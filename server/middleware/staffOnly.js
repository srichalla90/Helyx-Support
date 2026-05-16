/**
 * staffOnly.js — Staff role guard middleware (agent or admin)
 *
 * Must be used AFTER requireAuth so that req.user is populated.
 *
 * Usage:
 *   const staffOnly = require('../middleware/staffOnly');
 *   router.get('/internal', staffOnly, handler);
 */

module.exports = function staffOnly(req, res, next) {
  if (!['agent', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Agent or admin access required' });
  }
  next();
};
