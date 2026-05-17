/**
 * requireAuth.js — JWT authentication middleware
 *
 * Every protected API route must pass through this. It reads the
 * Bearer token from the Authorization header, verifies it was signed
 * by us (using JWT_SECRET), and attaches the decoded user to req.user.
 *
 * Usage in routes:
 *   const requireAuth = require('../middleware/requireAuth');
 *   router.get('/something', requireAuth, handler);
 *
 * Or applied globally in index.js to a whole route group:
 *   app.use('/api/tickets', requireAuth, ticketsRouter);
 */

const jwt = require('jsonwebtoken');

// Warn loudly in non-production if secret is missing so devs know immediately
const SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[requireAuth] WARNING: JWT_SECRET not set — using insecure dev fallback. Never use this in production.');
  }
  return 'dev-secret-NOT-for-production';
})();

module.exports = function requireAuth(req, res, next) {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload; // { id, name, email, role, iat, exp }
    next();
  } catch (e) {
    // Token expired or tampered with
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
};
