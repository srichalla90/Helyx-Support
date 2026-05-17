# Microsoft Graph API Integration

Helyx Support uses the **Microsoft Graph API v1.0** for:
1. Watching the support mailbox for inbound emails (via change notifications / webhooks)
2. Fetching full message content and file attachments
3. Sending outbound reply emails and notifications

All Graph functionality is in `server/services/graph.js`. The `subscriptionManager.js` keeps the inbox subscription alive.

---

## Configuration

Add these to `server/.env`:

| Variable | Description |
|---|---|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret (server-to-server, not the SPA secret) |
| `SUPPORT_MAILBOX` | Mailbox to watch, e.g. `support@helyxtech.com` |
| `WEBHOOK_BASE_URL` | Public HTTPS URL where Graph can call the webhook endpoint |
| `GRAPH_WEBHOOK_SECRET` | Arbitrary secret echoed in all Graph notifications to verify authenticity |

> **Important:** The Graph API integration requires a **separate app registration** (or additional permissions on the same one) with **application permissions** (not delegated), since the server acts as a daemon without a user context.

### Required Application Permissions
In Azure Portal → App Registrations → API Permissions (Application permissions, not delegated):
- `Mail.Read` — to read incoming emails and fetch message content
- `Mail.Send` — to send outbound notifications and replies

Grant admin consent for the organization after adding these permissions.

---

## How It Works

### 1. Subscription Setup (on server startup)

```
subscriptionManager.start()
  └── graph.createSubscription()
        ├── Checks isConfigured() — skips if credentials are placeholder values
        ├── Checks WEBHOOK_BASE_URL — skips if not set
        └── POST https://graph.microsoft.com/v1.0/subscriptions
              {
                changeType: "created",
                notificationUrl: "{WEBHOOK_BASE_URL}/api/inbound/email",
                resource: "users/{SUPPORT_MAILBOX}/mailFolders/Inbox/messages",
                expirationDateTime: <now + 4230 minutes>,
                clientState: "{GRAPH_WEBHOOK_SECRET}"
              }
```

Microsoft Graph subscriptions expire after a maximum of **4230 minutes (~3 days)** for mail resources. The `subscriptionManager` renews the subscription every **2 days** using `setInterval`, ensuring it never lapses.

### 2. Inbound Email Processing

When a new email arrives at the support mailbox:

```
Microsoft → POST /api/inbound/email
  { value: [{ changeType: "created", resourceData: { id: "<messageId>" } }] }
        │
        ▼
inbound.js validates clientState matches GRAPH_WEBHOOK_SECRET
        │
        ▼
graph.getMessage(messageId)
  GET /users/{mailbox}/messages/{id}?$select=id,subject,body,from,...
        │
        ▼
graph.getMessageAttachments(messageId)
  GET /users/{mailbox}/messages/{id}/attachments
  (only file attachments, not inline images)
        │
        ▼
Deduplication: check tickets.email_message_id = internetMessageId
  → Skip if already processed
        │
        ▼
INSERT INTO tickets (source='email', title=subject, description=body, ...)
        │
        ▼
Save file attachments to disk → ticket_attachments table
        │
        ▼
emailNotifications: send ticket_created_customer and new_ticket_agent emails
```

### 3. Webhook Validation (one-time)

When the subscription is first created, Microsoft sends a GET request with a `validationToken` query parameter. The `/api/inbound/email` GET handler echoes this token back as plain text with `Content-Type: text/plain` to confirm the endpoint is valid.

---

## OAuth Token Management

The Graph service uses the **client credentials** OAuth 2.0 flow (no user interaction):

```
POST https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token
  grant_type=client_credentials
  client_id={CLIENT_ID}
  client_secret={CLIENT_SECRET}
  scope=https://graph.microsoft.com/.default
```

Tokens are **cached in memory** and auto-refreshed 60 seconds before expiry. Token expiry is typically 1 hour.

---

## Sending Emails

### Reply to a Ticket Requester (`graph.sendReply`)
Called when a public comment is added to a ticket. Sends the reply from the support mailbox with proper email threading headers:
- `In-Reply-To: <original-message-id>`
- `References: <original-message-id>`

This ensures the conversation threads correctly in the customer's email client.

### Notification Emails (`graph.sendNotification`)
Sends HTML notification emails without threading (used for new ticket alerts, announcements, etc.):
- To multiple recipients simultaneously
- `saveToSentItems: false` to avoid cluttering the mailbox

---

## Dynamic Mailbox

The support mailbox email is read from the `settings` table at call-time (key: `support_email`). This means admins can change the support email via the Settings page without restarting the server.

The subscription setup still uses the `SUPPORT_MAILBOX` environment variable (since the subscription is created at startup before the settings table is consulted).

---

## Graceful Degradation

If Azure credentials are not configured (placeholder values remain):
- `isConfigured()` returns `false`
- `createSubscription()` logs a warning and returns `null` — server still starts
- `sendReply()` and `sendNotification()` log a warning and return early
- No errors propagate to the API consumers

This means the app functions fully for manual ticket management even without Graph configured.

---

## Local Development / Testing

Microsoft Graph requires a **public HTTPS URL** for the webhook. For local development:

1. Install ngrok: `npm install -g ngrok`
2. Start the server: `cd server && node index.js`
3. In a new terminal: `ngrok http 3001`
4. Copy the `https://xxxxx.ngrok.io` URL
5. Set `WEBHOOK_BASE_URL=https://xxxxx.ngrok.io` in `server/.env`
6. Restart the server — it will create the subscription using the ngrok URL

Alternatively, use `VITE_DEV_MODE=true` and leave Graph unconfigured — all email features are disabled but everything else works.
