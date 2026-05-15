# Helyx Support — Internal Ticketing System

A lightweight Freshdesk-style support ticket system built for Helix Tech.

---

## Quick Start

### 1. Install dependencies

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 2. Seed demo data (optional)

```bash
cd server && node seed.js
```

### 3. Start the app

**Terminal 1 — API server (port 3001):**
```bash
cd server && node index.js
```

**Terminal 2 — React dev server (port 5173):**
```bash
cd client && npx vite
```

Then open **http://localhost:5173** in your browser.

---

## Email-to-Ticket Integration

Whenever an email arrives at **support@helyxtech.com**, wire your email service to call:

```
POST http://yourserver:3001/api/email/ingest
Content-Type: application/json

{
  "from":    "customer@example.com",
  "subject": "Login page is broken",
  "text":    "Hi, I can't log in since this morning..."
}
```

### Recommended services

| Service | How to connect |
|---------|---------------|
| **SendGrid Inbound Parse** | Set the Inbound Parse webhook URL to your server's `/api/email/ingest` endpoint |
| **Postmark Inbound** | Set the inbound webhook to the same endpoint |
| **Zapier** | Gmail/Outlook trigger → Webhooks by Zapier → POST to endpoint |
| **Cloudflare Email Workers** | Forward support@helixtech.com, call the endpoint in the worker |

The system will automatically:
- Set the email subject as the ticket title
- Set the email body as the ticket description
- Set the sender as the requester email
- Tag the ticket source as `email`
- Default status to `Open` and priority to `Medium`

---

## Ticket Fields

| Field | Values |
|-------|--------|
| **Type** | Bug / Incident, Feature Request, Question / How-To, Access / Onboarding, Feedback |
| **Status** | Open, Pending, In Investigation, Pending Engineering, Waiting on Customer, Pending Release, Resolved, Closed, Canceled |
| **Priority** | Low, Medium, High, Critical |
| **Product** | Helix Platform, Helix Data |
| **Group** | Helix Support, Helix Data Engineering, Helix Platform Engineering, Helix SecOps |
| **Customer** | Configurable — add via the Customers page |

---

## Project Structure

```
FD Clone/
├── server/
│   ├── index.js          ← Express app + startup
│   ├── db.js             ← SQLite via sql.js (no native deps)
│   ├── seed.js           ← Optional demo data seeder
│   └── routes/
│       ├── tickets.js    ← CRUD + comments
│       ├── groups.js     ← Group management + members
│       ├── users.js      ← User management
│       ├── customers.js  ← Customer management
│       └── email.js      ← Email ingest endpoint
└── client/
    └── src/
        ├── App.jsx
        ├── api.js            ← All API calls + constants
        ├── components/
        │   ├── Sidebar.jsx
        │   ├── StatusBadge.jsx
        │   ├── CreateTicketModal.jsx
        │   └── Toast.jsx
        └── pages/
            ├── TicketList.jsx
            ├── TicketDetail.jsx
            ├── GroupsPage.jsx
            ├── UsersPage.jsx
            └── CustomersPage.jsx
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tickets` | List tickets (filterable by status, priority, product, group, type, search) |
| POST | `/api/tickets` | Create ticket |
| GET | `/api/tickets/:id` | Get ticket + comments |
| PUT | `/api/tickets/:id` | Update ticket fields |
| DELETE | `/api/tickets/:id` | Delete ticket |
| POST | `/api/tickets/:id/comments` | Add comment |
| POST | `/api/email/ingest` | Email-to-ticket webhook |
| GET | `/api/groups` | List groups with member counts |
| POST | `/api/groups` | Create group |
| GET | `/api/groups/:id/members` | List group members |
| POST | `/api/groups/:id/members` | Add member to group |
| DELETE | `/api/groups/:id/members/:userId` | Remove member |
| GET | `/api/users` | List users |
| POST | `/api/users` | Create user |
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/stats` | Dashboard statistics |

---

## Data Storage

Ticket data is stored in `server/helix_support.db.bin` (SQLite via sql.js — pure JavaScript, no native compilation needed). Back up this file to preserve your data.
# Helyx-Support
