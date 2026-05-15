/**
 * Optional seed script — run once to populate demo data.
 * Usage: node seed.js
 */
const db = require('./db');

db.ready.then(() => {
  console.log('Seeding demo data...');

  // Customers
  const customers = ['Acme Corp', 'Globex Industries', 'Initech', 'Umbrella Corporation'];
  for (const name of customers) {
    try { db.prepare(`INSERT OR IGNORE INTO customers (name) VALUES (?)`).run(name); } catch {}
  }

  // Users
  const users = [
    { name: 'Alice Nguyen',   email: 'alice@helyxtech.com' },
    { name: 'Bob Patel',      email: 'bob@helyxtech.com' },
    { name: 'Carol Martinez', email: 'carol@helyxtech.com' },
    { name: 'David Kim',      email: 'david@helyxtech.com' },
  ];
  for (const u of users) {
    try { db.prepare(`INSERT OR IGNORE INTO users (name, email) VALUES (?, ?)`).run(u.name, u.email); } catch {}
  }

  // Add users to groups
  const allUsers  = db.prepare('SELECT id FROM users').all();
  const allGroups = db.prepare('SELECT id FROM "groups"').all();
  if (allUsers.length > 0 && allGroups.length > 0) {
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(allGroups[0].id, allUsers[0].id);
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(allGroups[0].id, allUsers[1].id);
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(allGroups[1].id, allUsers[2].id);
    db.prepare(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`).run(allGroups[2].id, allUsers[3].id);
  }

  // Demo tickets
  const now = new Date().toISOString();
  const tickets = [
    { title: 'Cannot login to Helyx Platform', description: 'Multiple users at Acme are unable to log in since the 2.4 release. They see a blank white screen after entering credentials.', type: 'Bug / Incident', requester_email: 'it@acme.com', product: 'Helyx Platform', status: 'Open', priority: 'Critical', source: 'email' },
    { title: 'Data export not generating CSV', description: 'The nightly CSV export job has been failing silently. No files in the output bucket since Monday.', type: 'Bug / Incident', requester_email: 'ops@globex.com', product: 'Helyx Data', status: 'In Investigation', priority: 'High', source: 'email' },
    { title: 'How do I configure SSO with Okta?', description: 'We want to set up SSO for our team using Okta. Can you walk me through the configuration?', type: 'Question / How-To', requester_email: 'admin@initech.com', product: 'Helyx Platform', status: 'Pending Engineering', priority: 'Medium', source: 'email' },
    { title: 'Request: Bulk user import via CSV', description: 'We have 200 users to onboard. A CSV import feature would save us a lot of time.', type: 'Feature Request', requester_email: 'pm@umbrella.com', product: 'Helyx Platform', status: 'Open', priority: 'Low', source: 'manual' },
    { title: 'API rate limit too restrictive', description: 'Our integration is hitting the 100 req/min rate limit regularly during business hours. We need a higher tier.', type: 'Feature Request', requester_email: 'dev@acme.com', product: 'Helyx Data', status: 'Waiting on Customer', priority: 'Medium', source: 'email' },
    { title: 'Dashboard loading slowly for large datasets', description: 'When filtering by date ranges longer than 90 days, the main analytics dashboard takes 30+ seconds to load.', type: 'Bug / Incident', requester_email: 'support@globex.com', product: 'Helyx Platform', status: 'Pending Release', priority: 'High', source: 'email' },
    { title: 'New hire onboarding — access request', description: 'Three new analysts starting Monday. Please provision accounts: jane@globex.com, mark@globex.com, sara@globex.com', type: 'Access / Onboarding', requester_email: 'hr@globex.com', product: 'Helyx Platform', status: 'Open', priority: 'Medium', source: 'email' },
    { title: 'Great experience with the support team!', description: 'Just wanted to share positive feedback — the team resolved our issue in under an hour. Excellent service.', type: 'Feedback', requester_email: 'ceo@initech.com', product: null, status: 'Closed', priority: 'Low', source: 'email' },
  ];

  const custMap  = Object.fromEntries(db.prepare('SELECT id, name FROM customers').all().map((c) => [c.name, c.id]));
  const groupMap = Object.fromEntries(db.prepare('SELECT id, name FROM "groups"').all().map((g) => [g.name, g.id]));

  const groupAssign = {
    'Helyx Platform': groupMap['Helyx Platform Engineering'],
    'Helyx Data':     groupMap['Helyx Data Engineering'],
  };

  for (const t of tickets) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO tickets
          (title, description, type, requester_email, product, status, priority,
           customer_id, group_id, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        t.title, t.description, t.type, t.requester_email,
        t.product, t.status, t.priority,
        custMap[Object.keys(custMap)[Math.floor(Math.random() * Object.keys(custMap).length)]] || null,
        t.product ? (groupAssign[t.product] || null) : null,
        t.source, now, now,
      );
    } catch (e) { console.error('Seed error:', e.message); }
  }

  console.log(`✅  Seeded ${tickets.length} demo tickets, ${customers.length} customers, ${users.length} users`);
  process.exit(0);
});
