/**
 * db.js — SQLite via sql.js (pure JavaScript, no native bindings)
 *
 * Exposes a synchronous-style API identical to better-sqlite3:
 *   db.prepare(sql).all(...params)
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).run(...params)   → { lastInsertRowid, changes }
 *   db.exec(sql)
 *
 * The database is loaded from disk on startup and saved after every write.
 */

const initSqlJs = require('sql.js');
const fs        = require('fs');
const path      = require('path');

const DB_FILE = path.join(__dirname, 'helix_support.db.bin');

// ── Bootstrap (sync-blocking via shared state) ────────────────────────────────
// We initialize sql.js in an async IIFE, then export a proxy object that
// queues calls until ready. In practice the server's app.listen is deferred
// via module.exports.ready promise.

let _db = null;

const READY = initSqlJs().then((SQL) => {
  let data;
  if (fs.existsSync(DB_FILE)) {
    data = fs.readFileSync(DB_FILE);
  }
  _db = data ? new SQL.Database(data) : new SQL.Database();
  _db.run('PRAGMA foreign_keys = ON');
  return _db;
});

// Persist after every write
function persist() {
  const data = _db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// ── Wrapped statement ─────────────────────────────────────────────────────────

function wrapStmt(sql) {
  return {
    all(...params) {
      const result = _db.exec(interpolate(sql, params));
      if (!result.length) return [];
      const { columns, values } = result[0];
      return values.map((row) =>
        Object.fromEntries(columns.map((col, i) => [col, row[i]]))
      );
    },
    get(...params) {
      const rows = this.all(...params);
      return rows[0] ?? null;
    },
    run(...params) {
      _db.run(interpolate(sql, params));
      const lastInsertRowid = _db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] ?? null;
      const changes         = _db.exec('SELECT changes() AS n')[0]?.values[0][0] ?? 0;
      persist();
      return { lastInsertRowid, changes };
    },
  };
}

// sql.js exec() doesn't support ? placeholders, so we inline params safely
function interpolate(sql, params) {
  let i = 0;
  return sql.replace(/\?/g, () => {
    const v = params[i++];
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number')         return String(v);
    if (typeof v === 'boolean')        return v ? '1' : '0';
    // Escape single quotes in strings
    return `'${String(v).replace(/'/g, "''")}'`;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

const db = {
  prepare(sql) {
    return wrapStmt(sql);
  },
  exec(sql) {
    _db.run(sql);
    persist();
  },
  ready: READY,
};

// ── Schema & seed (runs once db is ready) ─────────────────────────────────────

READY.then(() => {
  _db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS "groups" (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role  TEXT NOT NULL DEFAULT 'agent',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL,
      user_id  INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT    NOT NULL,
      description      TEXT,
      type             TEXT    NOT NULL DEFAULT 'Question / How-To',
      requester_email  TEXT,
      product          TEXT,
      status           TEXT    NOT NULL DEFAULT 'Open',
      priority         TEXT    NOT NULL DEFAULT 'Medium',
      customer_id      INTEGER,
      group_id         INTEGER,
      source           TEXT    NOT NULL DEFAULT 'manual',
      email_message_id TEXT,
      created_at       DATETIME DEFAULT (datetime('now')),
      updated_at       DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   INTEGER NOT NULL,
      author      TEXT    NOT NULL,
      author_role TEXT    NOT NULL DEFAULT 'agent',
      body        TEXT    NOT NULL,
      is_public   INTEGER NOT NULL DEFAULT 1,
      created_at  DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kb_folders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      parent_id  INTEGER,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kb_files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id     INTEGER NOT NULL,
      display_name  TEXT    NOT NULL,
      filename      TEXT    NOT NULL,
      original_name TEXT    NOT NULL,
      mimetype      TEXT,
      size          INTEGER,
      created_at    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kb_articles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id  INTEGER NOT NULL,
      title      TEXT    NOT NULL,
      content    TEXT    NOT NULL DEFAULT '',
      status     TEXT    NOT NULL DEFAULT 'draft',
      version    TEXT    NOT NULL DEFAULT '0.1',
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kb_article_files (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id    INTEGER NOT NULL,
      display_name  TEXT    NOT NULL,
      filename      TEXT    NOT NULL,
      original_name TEXT    NOT NULL,
      mimetype      TEXT,
      size          INTEGER,
      created_at    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_requests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT    NOT NULL,
      description     TEXT    NOT NULL DEFAULT '',
      status          TEXT    NOT NULL DEFAULT 'submitted',
      submitter_email TEXT    NOT NULL,
      submitter_name  TEXT    NOT NULL DEFAULT 'Community Member',
      vote_count      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL,
      updated_at      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_votes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id   INTEGER NOT NULL,
      voter_email  TEXT    NOT NULL,
      created_at   TEXT    NOT NULL,
      UNIQUE(feature_id, voter_email)
    );

    CREATE TABLE IF NOT EXISTS feature_comments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id   INTEGER NOT NULL,
      author       TEXT    NOT NULL,
      author_email TEXT    NOT NULL,
      body         TEXT    NOT NULL,
      is_official  INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT    NOT NULL,
      body         TEXT    NOT NULL DEFAULT '',
      type         TEXT    NOT NULL DEFAULT 'general',
      status       TEXT    NOT NULL DEFAULT 'draft',
      pinned       INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ticket_attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id     INTEGER NOT NULL,
      comment_id    INTEGER,
      display_name  TEXT NOT NULL,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype      TEXT,
      size          INTEGER,
      uploaded_by   TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_activity (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id  INTEGER NOT NULL,
      actor      TEXT NOT NULL,
      action     TEXT NOT NULL,
      field      TEXT,
      old_value  TEXT,
      new_value  TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_templates (
      key     TEXT PRIMARY KEY,
      subject TEXT NOT NULL DEFAULT '',
      body    TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS ticket_tags (
      ticket_id INTEGER NOT NULL,
      tag       TEXT    NOT NULL,
      PRIMARY KEY (ticket_id, tag)
    );

    CREATE TABLE IF NOT EXISTS canned_responses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL DEFAULT '',
      category   TEXT NOT NULL DEFAULT 'General',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS csat_ratings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id    INTEGER NOT NULL,
      token        TEXT    NOT NULL UNIQUE,
      rating       INTEGER,
      comment      TEXT,
      sent_at      TEXT    NOT NULL,
      submitted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sla_policies (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      name                 TEXT    NOT NULL,
      priority             TEXT    NOT NULL,
      first_response_hours INTEGER NOT NULL DEFAULT 8,
      resolution_hours     INTEGER NOT NULL DEFAULT 48,
      is_default           INTEGER NOT NULL DEFAULT 0,
      active               INTEGER NOT NULL DEFAULT 1,
      created_at           TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automation_rules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      event      TEXT    NOT NULL DEFAULT 'ticket_created',
      conditions TEXT    NOT NULL DEFAULT '[]',
      actions    TEXT    NOT NULL DEFAULT '[]',
      active     INTEGER NOT NULL DEFAULT 1,
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_field_definitions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      label      TEXT    NOT NULL,
      field_type TEXT    NOT NULL DEFAULT 'text',
      options    TEXT,
      required   INTEGER NOT NULL DEFAULT 0,
      position   INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_custom_fields (
      ticket_id INTEGER NOT NULL,
      field_id  INTEGER NOT NULL,
      value     TEXT,
      PRIMARY KEY (ticket_id, field_id)
    );
  `);

  // Add role column to existing users table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'agent'`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add active column to existing users table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add active column to existing customers table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add active column to existing groups table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE "groups" ADD COLUMN active INTEGER NOT NULL DEFAULT 1`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add email_message_id to existing tickets table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE tickets ADD COLUMN email_message_id TEXT`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add is_public to existing ticket_comments if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE ticket_comments ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add ADO Bug ID and Deviation ID to existing tickets table (migration)
  try { _db.run(`ALTER TABLE tickets ADD COLUMN ado_bug_id TEXT`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  try { _db.run(`ALTER TABLE tickets ADD COLUMN deviation_id TEXT`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add status column to kb_articles (migration)
  try { _db.run(`ALTER TABLE kb_articles ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add version column to kb_articles (migration)
  try { _db.run(`ALTER TABLE kb_articles ADD COLUMN version TEXT NOT NULL DEFAULT '0.1'`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add assigned_to column to existing tickets table (migration)
  try { _db.run(`ALTER TABLE tickets ADD COLUMN assigned_to INTEGER`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }
  // Add author_role column to ticket_comments if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE ticket_comments ADD COLUMN author_role TEXT NOT NULL DEFAULT 'agent'`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }

  // New P1 feature migrations
  try { _db.run(`ALTER TABLE tickets ADD COLUMN sla_breached INTEGER NOT NULL DEFAULT 0`); } catch (e) {
    if (!e.message?.includes('duplicate column name')) console.warn('Migration note:', e.message);
  }

  // ── Indexes ───────────────────────────────────────────────────────────────────
  const INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id    ON ticket_comments(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket_id    ON ticket_activity(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_csat_ratings_ticket_id       ON csat_ratings(ticket_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_status               ON tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_priority             ON tickets(priority)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to          ON tickets(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_customer_id          ON tickets(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_tickets_group_id             ON tickets(group_id)',
    'CREATE INDEX IF NOT EXISTS idx_kb_articles_folder_id        ON kb_articles(folder_id)',
    'CREATE INDEX IF NOT EXISTS idx_kb_files_folder_id           ON kb_files(folder_id)',
  ];
  for (const idx of INDEXES) { try { _db.run(idx); } catch (_) {} }

  // Seed default custom field definitions (replaces hardcoded ADO Bug ID / Deviation ID)
  const ts1 = new Date().toISOString();
  const defaultCustomFields = [
    { name: 'ado_bug_id',   label: 'ADO Bug ID',   field_type: 'text', position: 0 },
    { name: 'deviation_id', label: 'Deviation ID',  field_type: 'text', position: 1 },
  ];
  for (const f of defaultCustomFields) {
    const existing = _db.exec(`SELECT id FROM custom_field_definitions WHERE name = '${f.name}' LIMIT 1`);
    if (!existing.length || !existing[0].values.length) {
      _db.run(`INSERT INTO custom_field_definitions (name, label, field_type, position, created_at) VALUES ('${f.name}', '${f.label}', '${f.field_type}', ${f.position}, '${ts1}')`);
    }
  }

  // Migrate existing ado_bug_id / deviation_id column values into ticket_custom_fields
  try {
    const adobugs = _db.exec(`SELECT t.id, t.ado_bug_id, t.deviation_id, df1.id AS f1id, df2.id AS f2id
      FROM tickets t, custom_field_definitions df1, custom_field_definitions df2
      WHERE df1.name = 'ado_bug_id' AND df2.name = 'deviation_id'
        AND (t.ado_bug_id IS NOT NULL OR t.deviation_id IS NOT NULL)`);
    if (adobugs.length && adobugs[0].values.length) {
      const cols = adobugs[0].columns;
      for (const row of adobugs[0].values) {
        const r = Object.fromEntries(cols.map((c, i) => [c, row[i]]));
        if (r.ado_bug_id) _db.run(`INSERT OR IGNORE INTO ticket_custom_fields (ticket_id, field_id, value) VALUES (${r.id}, ${r.f1id}, '${String(r.ado_bug_id).replace(/'/g,"''")}')`);
        if (r.deviation_id) _db.run(`INSERT OR IGNORE INTO ticket_custom_fields (ticket_id, field_id, value) VALUES (${r.id}, ${r.f2id}, '${String(r.deviation_id).replace(/'/g,"''")}')`);
      }
    }
  } catch (_) {}

  // Seed default SLA policies (INSERT OR IGNORE)
  const DEFAULT_SLA = [
    { name: 'Low Priority SLA',      priority: 'Low',      first_response_hours: 24, resolution_hours: 120 },
    { name: 'Medium Priority SLA',   priority: 'Medium',   first_response_hours: 8,  resolution_hours: 48  },
    { name: 'High Priority SLA',     priority: 'High',     first_response_hours: 4,  resolution_hours: 24  },
    { name: 'Critical Priority SLA', priority: 'Critical', first_response_hours: 1,  resolution_hours: 8   },
  ];
  const ts0 = new Date().toISOString();
  for (const s of DEFAULT_SLA) {
    const existing = _db.exec(`SELECT id FROM sla_policies WHERE priority = '${s.priority}' LIMIT 1`);
    if (!existing.length || !existing[0].values.length) {
      _db.run(`INSERT INTO sla_policies (name, priority, first_response_hours, resolution_hours, is_default, created_at) VALUES ('${s.name}', '${s.priority}', ${s.first_response_hours}, ${s.resolution_hours}, 1, '${ts0}')`);
    }
  }

  // Seed default settings (INSERT OR IGNORE so existing values are never overwritten)
  const defaultSettings = [
    ['company_name',                   'Helyx'],
    ['support_email',                  process.env.SUPPORT_MAILBOX || 'support@helyxtech.com'],
    ['portal_url',                     process.env.WEBHOOK_BASE_URL || ''],
    ['announce_notify_customers',      '1'],
    ['announce_notify_agents',         '0'],
  ];
  for (const [key, value] of defaultSettings) {
    _db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('${key}', '${value.replace(/'/g, "''")}')`);
  }

  // Migrate emails from old helixtech.com → helyxtech.com spelling
  _db.run(`UPDATE users SET email = REPLACE(email, '@helixtech.com', '@helyxtech.com') WHERE email LIKE '%@helixtech.com'`);

  // Seed admin user
  _db.run(`INSERT OR IGNORE INTO users (name, email, role) VALUES ('Admin', 'admin@helyxtech.com', 'admin')`);

  // Seed agent accounts
  _db.run(`INSERT OR IGNORE INTO users (name, email, role) VALUES ('A Ong',    'aong@helyxtech.com',   'agent')`);
  _db.run(`INSERT OR IGNORE INTO users (name, email, role) VALUES ('S Challa', 'schalla@helyxtech.com','agent')`);
  _db.run(`INSERT OR IGNORE INTO users (name, email, role) VALUES ('Agent',    'agent@helyxtech.com',  'agent')`);

  // Seed demo customer account (Vanessa @ Electra)
  _db.run(`INSERT OR IGNORE INTO customers (name) VALUES ('Electra')`);
  _db.run(`
    INSERT OR IGNORE INTO tickets (title, description, type, requester_email, product, status, priority, source, created_at, updated_at)
    SELECT 'Welcome to Helyx Support', 'This is your support portal. Submit tickets here and our team will get back to you.', 'Question / How-To', 'vanessa@electra.com', NULL, 'Closed', 'Low', 'manual', datetime('now'), datetime('now')
    WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE LOWER(requester_email) = 'vanessa@electra.com')
  `);

  // Seed default groups
  const defaultGroups = [
    'Helyx Support',
    'Helyx Data Engineering',
    'Helyx Platform Engineering',
    'Helyx SecOps',
  ];
  for (const name of defaultGroups) {
    _db.run(`INSERT OR IGNORE INTO "groups" (name) VALUES ('${name.replace(/'/g, "''")}')` );
  }

  // Seed default email templates (INSERT OR IGNORE so existing values are never overwritten)
  const DEFAULT_TEMPLATES = [
    {
      key: 'ticket_created_customer',
      subject: '[{{company_name}}] Your support ticket #{{ticket_id}} has been received',
      body: `<p>Hi there,</p><p>Thank you for reaching out to <strong>{{company_name}} Support</strong>. We've received your request and it's been logged as ticket <strong>#{{ticket_id}}</strong>.</p><h3>{{ticket_title}}</h3><p><strong>Priority:</strong> {{priority}}<br><strong>Type:</strong> {{type}}</p><p>Our team will review your request and get back to you as soon as possible. You can track your ticket status in the <a href="{{portal_url}}">customer portal</a>.</p><p>Best regards,<br>{{company_name}} Support Team</p>`
    },
    {
      key: 'ticket_assigned_agent',
      subject: '[{{company_name}}] Ticket #{{ticket_id}} has been assigned to you',
      body: `<p>Hi {{agent_name}},</p><p>Ticket <strong>#{{ticket_id}}</strong> has been assigned to you.</p><h3>{{ticket_title}}</h3><p><strong>Requester:</strong> {{requester_email}}<br><strong>Priority:</strong> {{priority}}<br><strong>Type:</strong> {{type}}<br><strong>Status:</strong> {{status}}</p><p>Please review and respond as soon as possible.</p><p>{{company_name}} Support</p>`
    },
    {
      key: 'ticket_resolved_customer',
      subject: '[{{company_name}}] Your ticket #{{ticket_id}} has been resolved',
      body: `<p>Hi there,</p><p>We're happy to let you know that your support ticket <strong>#{{ticket_id}}</strong> has been resolved.</p><h3>{{ticket_title}}</h3><p>If you have any further questions or if the issue persists, please don't hesitate to reply to this email or open a new ticket in the <a href="{{portal_url}}">customer portal</a>.</p><p>Best regards,<br>{{company_name}} Support Team</p>`
    },
    {
      key: 'ticket_closed_customer',
      subject: '[{{company_name}}] Your ticket #{{ticket_id}} has been closed',
      body: `<p>Hi there,</p><p>Your support ticket <strong>#{{ticket_id}}</strong> has been closed. We hope your issue was fully resolved.</p><h3>{{ticket_title}}</h3><p>If you need further help, you're always welcome to open a new ticket.</p><p>Thank you for using {{company_name}} Support.</p><p>Best regards,<br>{{company_name}} Support Team</p>`
    },
    {
      key: 'announcement_published',
      subject: '[{{company_name}}] {{title}}',
      body: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:40px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td style="background:#1E293B;padding:28px 36px;"><span style="font-size:22px;font-weight:700;color:#fff;">{{company_name}} Support</span></td></tr><tr><td style="padding:32px 36px 12px;"><span style="display:inline-block;background:#EFF6FF;color:#1D4ED8;font-size:12px;font-weight:700;border-radius:20px;padding:4px 14px;letter-spacing:0.5px;margin-bottom:16px;">{{type_label}}</span><h1 style="margin:0;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">{{title}}</h1></td></tr><tr><td style="padding:8px 36px 32px;font-size:15px;color:#374151;line-height:1.7;">{{body}}</td></tr><tr><td style="padding:0 36px 36px;"><a href="{{portal_url}}" style="display:inline-block;background:#2563EB;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">View in Customer Portal →</a></td></tr><tr><td style="background:#F8FAFC;padding:20px 36px;border-top:1px solid #E5E7EB;"><p style="margin:0;font-size:12px;color:#9CA3AF;">You''re receiving this because you have an account with {{company_name}} Support. This is an automated notification.</p></td></tr></table></td></tr></table></body></html>`
    },
    {
      key: 'csat_survey',
      subject: '[{{company_name}}] How did we do? Rate your support experience',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#111827"><div style="background:#1D4ED8;padding:16px 24px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:18px">How did we do?</h2></div><div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px"><p style="margin:0 0 8px">Hi there,</p><p style="margin:0 0 16px">Your support ticket <strong>#{{ticket_id}}</strong> — <em>{{ticket_title}}</em> — has been resolved. We''d love to hear how we did.</p><p style="font-weight:600;margin-bottom:12px">How satisfied were you with the support you received?</p><div style="text-align:center;margin:24px 0"><a href="{{rating_url_1}}" style="display:inline-block;margin:0 6px;width:48px;height:48px;border-radius:50%;background:#FEE2E2;color:#991B1B;font-size:22px;line-height:48px;text-decoration:none;font-weight:700">1</a><a href="{{rating_url_2}}" style="display:inline-block;margin:0 6px;width:48px;height:48px;border-radius:50%;background:#FEF3C7;color:#92400E;font-size:22px;line-height:48px;text-decoration:none;font-weight:700">2</a><a href="{{rating_url_3}}" style="display:inline-block;margin:0 6px;width:48px;height:48px;border-radius:50%;background:#FEF9C3;color:#854D0E;font-size:22px;line-height:48px;text-decoration:none;font-weight:700">3</a><a href="{{rating_url_4}}" style="display:inline-block;margin:0 6px;width:48px;height:48px;border-radius:50%;background:#DCFCE7;color:#166534;font-size:22px;line-height:48px;text-decoration:none;font-weight:700">4</a><a href="{{rating_url_5}}" style="display:inline-block;margin:0 6px;width:48px;height:48px;border-radius:50%;background:#BBF7D0;color:#14532D;font-size:22px;line-height:48px;text-decoration:none;font-weight:700">5</a></div><p style="text-align:center;font-size:12px;color:#9CA3AF;margin-top:8px">1 = Very Unsatisfied · 5 = Very Satisfied</p><p style="font-size:12px;color:#9CA3AF;margin-top:24px">This link expires in 30 days. Thank you for using {{company_name}} Support.</p></div></div>`
    },
    {
      key: 'agent_mentioned',
      subject: '[{{company_name}}] You were mentioned in ticket #{{ticket_id}}',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#111827"><div style="background:#7C3AED;padding:16px 24px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:18px">You were mentioned in a ticket</h2></div><div style="border:1px solid #E5E7EB;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px"><p style="margin:0 0 12px">Hi {{agent_name}},</p><p style="margin:0 0 16px"><strong>{{mentioned_by}}</strong> mentioned you in ticket <strong>#{{ticket_id}}</strong> — <em>{{ticket_title}}</em>.</p><div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:12px 16px;font-size:13px;color:#374151;margin-bottom:20px;border-left:4px solid #7C3AED">{{comment_preview}}</div><a href="{{app_url}}" style="display:inline-block;background:#7C3AED;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View Ticket #{{ticket_id}} →</a></div></div>`
    },
    {
      key: 'new_ticket_agent',
      subject: '[New Ticket #{{ticket_id}}] {{ticket_title}}',
      body: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#111827"><div style="background:#1D4ED8;padding:16px 24px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0;font-size:18px">New Support Ticket #{{ticket_id}}</h2></div><div style="border:1px solid #E5E7EB;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px"><table style="width:100%;border-collapse:collapse;margin-bottom:16px"><tr><td style="padding:6px 0;color:#6B7280;font-size:13px;width:110px">From</td><td style="padding:6px 0;font-size:13px"><strong>{{requester_email}}</strong></td></tr><tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Subject</td><td style="padding:6px 0;font-size:13px"><strong>{{ticket_title}}</strong></td></tr></table><div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;padding:12px 16px;font-size:13px;color:#374151;margin-bottom:20px;white-space:pre-wrap">{{body_preview}}</div><a href="{{app_url}}" style="display:inline-block;background:#1D4ED8;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View Ticket #{{ticket_id}} →</a></div></div>`
    },
  ];
  for (const t of DEFAULT_TEMPLATES) {
    _db.run(`INSERT OR IGNORE INTO email_templates (key, subject, body) VALUES ('${t.key}', '${t.subject.replace(/'/g,"''")}', '${t.body.replace(/'/g,"''")}') `);
  }

  persist();
  console.log('  Database ready:', DB_FILE);
});

module.exports = db;
