/**
 * handleError.js — Centralised 500 error handler
 *
 * In production: returns a generic message so internal details are never
 * exposed to clients. In development: returns the real error message for
 * easier debugging.
 *
 * Usage:
 *   const handleError = require('../middleware/handleError');
 *   try { ... } catch (e) { return handleError(res, e); }
 */

const isProd = process.env.NODE_ENV === 'production';

module.exports = function handleError(res, err) {
  console.error('[API Error]', err?.message || err);
  return res.status(500).json({
    error: isProd ? 'Internal server error' : (err?.message || 'Internal server error'),
  });
};
