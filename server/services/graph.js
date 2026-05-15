/**
 * graph.js — Microsoft Graph API client
 *
 * Handles:
 *  - OAuth2 client-credentials token (cached, auto-refreshed)
 *  - Creating / renewing a mailbox change-notification subscription
 *  - Fetching a message by ID
 *  - Sending a reply email (with In-Reply-To / References for threading)
 *
 * All credentials come from .env — placeholder values are safe;
 * the service degrades gracefully until real credentials are provided.
 */

const TENANT_ID     = process.env.AZURE_TENANT_ID     || 'YOUR_TENANT_ID_HERE';
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     || 'YOUR_CLIENT_ID_HERE';
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';
const MAILBOX       = process.env.SUPPORT_MAILBOX      || 'support@helyxtech.com';
const WEBHOOK_BASE  = process.env.WEBHOOK_BASE_URL     || '';
const WEBHOOK_SECRET = process.env.GRAPH_WEBHOOK_SECRET || 'helyx-support-webhook-secret';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL  = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

function isConfigured() {
  return (
    TENANT_ID     !== 'YOUR_TENANT_ID_HERE' &&
    CLIENT_ID     !== 'YOUR_CLIENT_ID_HERE' &&
    CLIENT_SECRET !== 'YOUR_CLIENT_SECRET_HERE'
  );
}

// ── Token cache ───────────────────────────────────────────────────────────────

let _token       = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph token error: ${err}`);
  }

  const data   = await res.json();
  _token       = data.access_token;
  _tokenExpiry = Date.now() + data.expires_in * 1000;
  return _token;
}

// ── Generic request helper ────────────────────────────────────────────────────

async function graphRequest(path, options = {}) {
  const token = await getAccessToken();
  const res   = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 202 || res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Graph error ${res.status}`);
  return data;
}

// ── Subscription management ───────────────────────────────────────────────────

let _subscriptionId = null;

async function createSubscription() {
  if (!isConfigured()) {
    console.warn('⚠️  Graph: Azure credentials not configured — subscription skipped.');
    console.warn('    Fill in AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in server/.env');
    return null;
  }

  if (!WEBHOOK_BASE || WEBHOOK_BASE.includes('YOUR_SERVER')) {
    console.warn('⚠️  Graph: WEBHOOK_BASE_URL not set — subscription skipped.');
    console.warn('    Set WEBHOOK_BASE_URL to your public HTTPS server URL in server/.env');
    return null;
  }

  // Maximum expiration for mail subscriptions is 4230 minutes (~3 days)
  const expiry = new Date(Date.now() + 4230 * 60 * 1000).toISOString();

  try {
    const sub = await graphRequest('/subscriptions', {
      method: 'POST',
      body:   JSON.stringify({
        changeType:         'created',
        notificationUrl:    `${WEBHOOK_BASE}/api/inbound/email`,
        resource:           `users/${MAILBOX}/mailFolders/Inbox/messages`,
        expirationDateTime: expiry,
        clientState:        WEBHOOK_SECRET,
      }),
    });

    _subscriptionId = sub.id;
    console.log(`📬  Graph subscription active — id: ${sub.id}`);
    console.log(`    Watching: ${MAILBOX} | Expires: ${sub.expirationDateTime}`);
    return sub;
  } catch (e) {
    console.error('⚠️  Graph subscription failed:', e.message);
    return null;
  }
}

async function renewSubscription() {
  if (!_subscriptionId) return createSubscription();

  const expiry = new Date(Date.now() + 4230 * 60 * 1000).toISOString();
  try {
    await graphRequest(`/subscriptions/${_subscriptionId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ expirationDateTime: expiry }),
    });
    console.log('🔄  Graph subscription renewed');
  } catch (e) {
    console.warn('⚠️  Subscription renewal failed — recreating:', e.message);
    _subscriptionId = null;
    await createSubscription();
  }
}

// ── Message operations ────────────────────────────────────────────────────────

/**
 * Fetch a full message from the support mailbox.
 * Returns the raw Graph message object.
 */
async function getMessage(messageId) {
  const select = [
    'id', 'subject', 'bodyPreview', 'body',
    'from', 'toRecipients',
    'internetMessageId', 'internetMessageHeaders',
    'receivedDateTime',
  ].join(',');

  return graphRequest(`/users/${MAILBOX}/messages/${messageId}?$select=${select}`);
}

/**
 * Send a reply email through the support mailbox.
 *
 * @param {object} opts
 * @param {string} opts.to              - Recipient email address
 * @param {string} opts.subject         - Original ticket title (Re: prefix added automatically)
 * @param {string} opts.textBody        - Plain-text reply content
 * @param {string} [opts.htmlBody]      - Optional HTML version
 * @param {string} [opts.inReplyTo]     - Original email Message-ID (for threading)
 * @param {string} [opts.references]    - References header value (for threading)
 */
async function sendReply({ to, subject, textBody, htmlBody, inReplyTo, references }) {
  if (!isConfigured()) {
    console.warn('⚠️  Graph: Cannot send reply — Azure credentials not yet configured.');
    return;
  }

  const subjectLine = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const internetMessageHeaders = [];
  if (inReplyTo)  internetMessageHeaders.push({ name: 'In-Reply-To', value: inReplyTo });
  if (references) internetMessageHeaders.push({ name: 'References',  value: references });

  const content = htmlBody ||
    `<p>${(textBody || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</p>`;

  const messagePayload = {
    subject,
    body:         { contentType: 'HTML', content },
    toRecipients: [{ emailAddress: { address: to } }],
    ...(internetMessageHeaders.length ? { internetMessageHeaders } : {}),
  };

  // Use reply subject line
  messagePayload.subject = subjectLine;

  await graphRequest(`/users/${MAILBOX}/sendMail`, {
    method: 'POST',
    body:   JSON.stringify({
      message:         messagePayload,
      saveToSentItems: true,
    }),
  });
}

/**
 * Send a plain notification email (no threading headers).
 * Used for agent alerts — e.g. new ticket created.
 *
 * @param {object} opts
 * @param {string[]} opts.to       - Array of recipient email addresses
 * @param {string}   opts.subject  - Email subject
 * @param {string}   opts.htmlBody - HTML email body
 */
async function sendNotification({ to, subject, htmlBody }) {
  if (!isConfigured()) {
    console.warn('⚠️  Graph: Cannot send notification — Azure credentials not yet configured.');
    return;
  }
  if (!to || to.length === 0) return;

  await graphRequest(`/users/${MAILBOX}/sendMail`, {
    method: 'POST',
    body:   JSON.stringify({
      message: {
        subject,
        body:         { contentType: 'HTML', content: htmlBody },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
  });
}

module.exports = {
  isConfigured,
  getAccessToken,
  createSubscription,
  renewSubscription,
  getMessage,
  sendReply,
  sendNotification,
  MAILBOX,
  WEBHOOK_SECRET,
};
