/**
 * auth.js — Authentication routes
 *
 * POST /api/auth/azure
 *   Called by the frontend immediately after Microsoft SSO.
 *   Receives the Microsoft ID token, validates it against Microsoft's
 *   public keys, looks up the user's role in our database, and returns
 *   a signed app JWT that the frontend uses for all subsequent API calls.
 *
 *   Role resolution:
 *     - Email found in `users` table AND active → use that role (admin | agent | customer)
 *     - Email found in `users` table AND inactive → 403 error
 *     - Email NOT in `users` table → 403 error (explicit registration required)
 *
 *   Every user — whether agent, admin, or customer — must be explicitly added
 *   by an admin before they can access the application. Azure AD handles
 *   authentication only; this table handles authorization.
 */

const express    = require('express');
const router     = express.Router();
const jwt        = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const db         = require('../db');

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-NOT-for-production';

// Microsoft's public key endpoint for this tenant
const keyClient = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache:       true,
  cacheMaxAge: 86400000, // 24 hours — Microsoft rotates keys infrequently
  rateLimit:   true,
});

// Callback-style key retriever for jsonwebtoken
function getSigningKey(header, callback) {
  keyClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

// Wrap jwt.verify in a Promise
function verifyMicrosoftToken(idToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getSigningKey,
      {
        algorithms: ['RS256'],
        audience:   CLIENT_ID,
        issuer:     `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });
}

// ── POST /api/auth/azure ──────────────────────────────────────────────────────
router.post('/azure', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required.' });
    }

    // Validate the Microsoft ID token
    let msPayload;
    try {
      msPayload = await verifyMicrosoftToken(idToken);
    } catch (e) {
      console.error('Microsoft token validation failed:', e.message);
      return res.status(401).json({ error: 'Microsoft token is invalid or expired. Please sign in again.' });
    }

    // Extract email and display name from the Microsoft token
    // preferred_username is the UPN (usually the email address)
    const email = (msPayload.preferred_username || msPayload.email || '').toLowerCase().trim();
    const msName = msPayload.name || email.split('@')[0];

    if (!email) {
      return res.status(400).json({ error: 'Could not determine email from Microsoft token.' });
    }

    // Look up role in our users table
    const internalUser = db.prepare(
      `SELECT id, name, email, role, active FROM users WHERE LOWER(email) = LOWER(?)`
    ).get(email);

    if (!internalUser) {
      // Not in our system at all — reject regardless of Azure AD status
      return res.status(403).json({
        error: 'You do not have access to this application. Please contact your administrator to request access.',
      });
    }

    if (!internalUser.active) {
      return res.status(403).json({ error: 'Your account has been deactivated. Please contact your administrator.' });
    }

    const role        = internalUser.role;
    const userId      = internalUser.id;
    const displayName = internalUser.name;

    // Issue our own short-lived JWT (8 hours)
    const appToken = jwt.sign(
      { id: userId, name: displayName, email, role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      token: appToken,
      user:  { id: userId, name: displayName, email, role },
    });

  } catch (e) {
    console.error('Auth error:', e);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

// ── POST /api/auth/dev-login ──────────────────────────────────────────────────
// DEV ONLY — never active in production.
// Accepts a plain email, looks it up in the users table and returns an app JWT.
// Mirrors the Azure endpoint exactly — unknown emails are rejected, not auto-assigned.
router.post('/dev-login', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found.' });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const normalised = email.toLowerCase().trim();

  const internalUser = db.prepare(
    `SELECT id, name, email, role, active FROM users WHERE LOWER(email) = LOWER(?)`
  ).get(normalised);

  if (!internalUser) {
    return res.status(403).json({
      error: 'You do not have access to this application. Please contact your administrator to request access.',
    });
  }

  if (!internalUser.active) {
    return res.status(403).json({ error: 'Your account has been deactivated.' });
  }

  const role        = internalUser.role;
  const userId      = internalUser.id;
  const displayName = internalUser.name;

  const appToken = jwt.sign(
    { id: userId, name: displayName, email: normalised, role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({
    token: appToken,
    user:  { id: userId, name: displayName, email: normalised, role },
  });
});

module.exports = router;
