# Email Ingest Webhook

In addition to the Microsoft Graph webhook, Helyx Support provides a **generic HTTP webhook** endpoint for creating tickets from emails. Any email service that can make an HTTP POST request can use this endpoint.

---

## Endpoint

```
POST /api/email/ingest
Content-Type: application/json
X-Ingest-Secret: <EMAIL_INGEST_SECRET>
```

### Request Body

```json
{
  "from":    "customer@example.com",
  "subject": "Login page is broken",
  "text":    "Hi, I cannot log in since this morning...",
  "html":    "<p>Hi, I cannot log in since this morning...</p>"
}
```

| Field | Required | Description |
|---|---|---|
| `from` | Yes | Sender email address (becomes `requester_email`) |
| `subject` | Yes | Email subject (becomes ticket `title`) |
| `text` | No | Plain text body (used if `html` not provided) |
| `html` | No | HTML body (preferred over `text`) |

### Response

**201 Created** (new ticket):
```json
{
  "id": 123,
  "title": "Login page is broken",
  "status": "Open",
  "priority": "Medium",
  "source": "email",
  ...
}
```

**200 OK** (duplicate — existing open ticket found with same requester + subject):
Returns the existing ticket object.

---

## Authentication

The endpoint uses a shared secret in the `X-Ingest-Secret` header. Set the secret in `server/.env`:

```
EMAIL_INGEST_SECRET=your-strong-random-secret-here
```

If the header is missing or incorrect, the server returns `401 Unauthorized`.

> **Rate limit:** This endpoint is limited to 30 requests per minute to prevent abuse.

---

## Default Values for Ingested Tickets

| Field | Value |
|---|---|
| `status` | `Open` |
| `priority` | `Medium` |
| `source` | `email` |
| `type` | `Question / How-To` |
| `customer_id` | Auto-matched by requester email domain if possible |

---

## Deduplication

The ingest endpoint checks for an existing **open** ticket with the same `requester_email` and `title` (subject). If found, it returns the existing ticket instead of creating a duplicate. This prevents email reply chains from creating multiple tickets.

For Graph-sourced tickets, deduplication uses the `email_message_id` column (internet message ID) for stronger deduplication.

---

## Compatible Email Services

Any service that supports outbound webhooks can be wired to this endpoint:

### SendGrid Inbound Parse
1. Go to SendGrid → Settings → Inbound Parse
2. Set the destination URL to `https://your-server.com/api/email/ingest`
3. SendGrid will POST the email contents to this URL

### Postmark Inbound
1. Go to Postmark → Servers → Inbound → Set webhook URL
2. Set to `https://your-server.com/api/email/ingest`
3. Postmark posts JSON with `From`, `Subject`, `TextBody`, `HtmlBody` fields
   (map to `from`, `subject`, `text`, `html` using Postmark's JSON mapping or a middleware adapter)

### Zapier
1. Create a Zap: Gmail/Outlook trigger → Webhooks by Zapier action
2. Configure POST to `https://your-server.com/api/email/ingest`
3. Map `from`, `subject`, `text` fields from the email trigger

### Cloudflare Email Workers
Write a Cloudflare Email Worker that receives forwarded emails and calls the endpoint:
```javascript
export default {
  async email(message, env, ctx) {
    const body = {
      from: message.from,
      subject: message.headers.get('Subject'),
      text: await new Response(message.raw).text(),
    };
    await fetch('https://your-server.com/api/email/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Ingest-Secret': env.INGEST_SECRET,
      },
      body: JSON.stringify(body),
    });
  }
}
```

### Make (formerly Integromat) / n8n
Both support HTTP webhook POST nodes that can be connected to email monitoring triggers.

---

## Email Threading (Replies)

When an agent replies to a ticket from the Helyx UI, the reply is sent via Microsoft Graph with:
- `In-Reply-To: <original-internet-message-id>`
- `References: <original-internet-message-id>`

This ensures the customer's reply in their email client is threaded with the original and will be routed back as a continuation of the same ticket thread.
