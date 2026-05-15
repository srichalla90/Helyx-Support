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
  `);

  // Add role column to existing users table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'agent'`); } catch (_) {}
  // Add active column to existing users table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  // Add active column to existing customers table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  // Add active column to existing groups table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE "groups" ADD COLUMN active INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  // Add email_message_id to existing tickets table if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE tickets ADD COLUMN email_message_id TEXT`); } catch (_) {}
  // Add is_public to existing ticket_comments if it doesn't exist (migration)
  try { _db.run(`ALTER TABLE ticket_comments ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1`); } catch (_) {}
  // Add ADO Bug ID and Deviation ID to existing tickets table (migration)
  try { _db.run(`ALTER TABLE tickets ADD COLUMN ado_bug_id TEXT`); } catch (_) {}
  try { _db.run(`ALTER TABLE tickets ADD COLUMN deviation_id TEXT`); } catch (_) {}
  // Add status column to kb_articles (migration)
  try { _db.run(`ALTER TABLE kb_articles ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'`); } catch (_) {}

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

  persist();
  console.log('  Database ready:', DB_FILE);
});

module.exports = db;
