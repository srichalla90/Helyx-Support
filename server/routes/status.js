const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const adminOnly    = require('../middleware/adminOnly');
const handleError   = require('../middleware/handleError');

const VALID_STATUSES = ['operational', 'degraded', 'outage', 'maintenance'];

// GET /api/status — public, no auth required
router.get('/', (req, res) => {
  try {
    const status  = db.prepare(`SELECT value FROM settings WHERE key = 'system_status'`).get();
    const message = db.prepare(`SELECT value FROM settings WHERE key = 'system_status_message'`).get();
    const updated = db.prepare(`SELECT value FROM settings WHERE key = 'system_status_updated_at'`).get();
    res.json({
      status:     status?.value  || 'operational',
      message:    message?.value || '',
      updated_at: updated?.value || null,
    });
  } catch (e) { return handleError(res, e); }
});

// PUT /api/status — admin only
router.put('/', requireAuth, adminOnly, (req, res) => {
  try {
    const { status, message = '' } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const now = new Date().toISOString();
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system_status', ?)`).run(status);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system_status_message', ?)`).run(message);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('system_status_updated_at', ?)`).run(now);
    res.json({ status, message, updated_at: now });
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
