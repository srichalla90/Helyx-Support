const db = require('./db');
db.ready.then(() => {
  const users = db.prepare('SELECT id, name, email, role, active FROM users').all();
  console.log(JSON.stringify(users, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
