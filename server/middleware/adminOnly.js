/**
 * adminOnly.js — Admin role guard middleware
 *
 * Must be used AFTER requireAuth so that req.user is populated.
 *
 * Usage:
 *   const adminOnly = require('../middleware/adminOnly');
 *   router.put('/something', adminOnly, handler);
 */

module.exports = function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can perform this action' });
  }
  next();
};
