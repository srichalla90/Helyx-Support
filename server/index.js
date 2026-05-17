// Load .env before anything else
try { require('dotenv').config(); } catch (_) {}

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
const db       = require('./db');

const ticketsRouter      = require('./routes/tickets');
const groupsRouter       = require('./routes/groups');
const usersRouter        = require('./routes/users');
const customersRouter    = require('./routes/customers');
const emailRouter        = require('./routes/email');
const authRouter         = require('./routes/auth');
const inboundRouter      = require('./routes/inbound');
const kbRouter            = require('./routes/kb');
const announcementsRouter = require('./routes/announcements');
const featuresRouter      = require('./routes/features');
const settingsRouter      = require('./routes/settings');
const emailTemplatesRouter = require('./routes/emailTemplates');
const cannedResponsesRouter = require('./routes/cannedResponses');
const csatRouter            = require('./routes/csat');
const slaRouter             = require('./routes/sla');
const automationRouter      = require('./routes/automation');
const customFieldsRouter    = require('./routes/customFields');
const statusRouter          = require('./routes/status');
const ticketTemplatesRouter = require('./routes/ticketTemplates');
const forumRouter           = require('./routes/forum');
const downloadsRouter       = require('./routes/downloads');
const deploymentsRouter     = require('./routes/deployments');
const reportsRouter         = require('./routes/reports');
const devopsRouter          = require('./routes/devops');
const tagDefinitionsRouter  = require('./routes/tag-definitions');
const contactsRouter        = require('./routes/contacts');
const rateLimit           = require('express-rate-limit');
const subscriptionManager = require('./services/subscriptionManager');
const requireAuth         = require('./middleware/requireAuth');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());

// ── Rate limiting (M1) ────────────────────────────────────────────────────────
// Tight limit on auth endpoints to prevent brute-force
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));
// General API limit
app.use('/api', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
}));
// Tighter limit for email ingest endpoints
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many ingest requests' }
});
app.use('/api/email/ingest', ingestLimiter);
app.use('/api/inbound', ingestLimiter);

// ── Security startup checks ───────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start in production.');
  process.exit(1);
}
const WEAK_SECRETS = ['secret', 'dev-secret-NOT-for-production', 'changeme', 'password', 'jwt-secret'];
if (!process.env.JWT_SECRET || WEAK_SECRETS.includes(process.env.JWT_SECRET)) {
  console.warn('[SECURITY WARNING] JWT_SECRET is not set or is a known weak value. Set a strong secret in production!');
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production restrict to the configured portal origin; dev allows all.
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  console.warn('[WARN] CORS_ORIGIN not set — accepting all origins (dev only)');
}
app.use(cors(corsOrigin ? { origin: corsOrigin, credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization'] } : undefined));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API ───────────────────────────────────────────────────────────────────────
// Public routes (no auth required)
app.use('/api/auth',    authRouter);    // login/azure exchange
app.use('/api/inbound', inboundRouter); // Microsoft Graph webhook (validates its own secret)

// Protected routes — all require a valid Bearer token
app.use('/api/tickets',       requireAuth, ticketsRouter);
app.use('/api/groups',        requireAuth, groupsRouter);
app.use('/api/users',         requireAuth, usersRouter);
app.use('/api/customers',     requireAuth, customersRouter);
app.use('/api/email',         emailRouter);             // ingest uses X-Ingest-Secret; no global JWT
app.use('/api/kb',            requireAuth, kbRouter);
// Public announcements sub-route must be registered BEFORE the requireAuth wrapper
app.use('/api/announcements/public', (req, res, next) => {
  // Only GET is public — all mutations still require auth via the main mount below
  if (req.method === 'GET') return next();
  requireAuth(req, res, next);
}, announcementsRouter);
app.use('/api/announcements', requireAuth, announcementsRouter);
app.use('/api/features',      requireAuth, featuresRouter);
app.use('/api/settings',        requireAuth, settingsRouter);
app.use('/api/email-templates',  requireAuth, emailTemplatesRouter);
app.use('/api/canned-responses', requireAuth, cannedResponsesRouter);
app.use('/api/csat',             csatRouter);          // has both public + protected sub-routes
app.use('/api/sla',              requireAuth, slaRouter);
app.use('/api/automation',       requireAuth, automationRouter);
app.use('/api/custom-fields',    requireAuth, customFieldsRouter);
app.use('/api/status',           statusRouter);          // GET public, PUT requires auth (checked in route)
app.use('/api/ticket-templates', requireAuth, ticketTemplatesRouter);
app.use('/api/forum',            requireAuth, forumRouter);
app.use('/api/downloads',        downloadsRouter);   // GET / public · GET /all + POST/PUT/DELETE → admin only (enforced in route)
app.use('/api/deployments',      requireAuth, deploymentsRouter);
app.use('/api/reports',          requireAuth, reportsRouter);
app.use('/api/devops',           requireAuth, devopsRouter);
app.use('/api/tag-definitions',  requireAuth, tagDefinitionsRouter);
app.use('/api/contacts',         requireAuth, contactsRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const stats = {
      total:       db.prepare('SELECT COUNT(*) AS n FROM tickets').get().n,
      open:        db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status = 'Open'`).get().n,
      pending:     db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('Pending','In Investigation','Pending Engineering','Waiting on Customer','Pending Release')`).get().n,
      resolved:    db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('Resolved','Closed')`).get().n,
      critical:    db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE priority = 'Critical' AND status NOT IN ('Resolved','Closed','Canceled')`).get().n,
      by_status:   db.prepare('SELECT status, COUNT(*) AS n FROM tickets GROUP BY status').all(),
      by_priority: db.prepare('SELECT priority, COUNT(*) AS n FROM tickets GROUP BY priority').all(),
      by_product:  db.prepare(`SELECT COALESCE(product,'Unassigned') AS product, COUNT(*) AS n FROM tickets GROUP BY product`).all(),
    };
    res.json(stats);
  } catch (e) {
    console.error('[stats]', e);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : e.message });
  }
});

// ── Serve React build in production ──────────────────────────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/(.*)/, (req, res) => {
  const index = path.join(clientDist, 'index.html');
  res.sendFile(index, (err) => {
    if (err) res.status(200).send('Helyx Support API is running.');
  });
});

// ── Wait for DB then start ────────────────────────────────────────────────────
db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`\n🟢  Helyx Support API  →  http://localhost:${PORT}`);
    console.log(`    Email ingest:  POST http://localhost:${PORT}/api/email/ingest`);
    console.log(`    Graph webhook: POST http://localhost:${PORT}/api/inbound/email`);
    console.log(`    Health:        GET  http://localhost:${PORT}/api/health\n`);
  });

  // Start Microsoft Graph subscription manager (gracefully no-ops if credentials not set)
  subscriptionManager.start();
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
