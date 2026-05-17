# Architecture Overview

## System Design

Helyx Support is a **monorepo** application with a React single-page application (SPA) served by a Node.js/Express backend. In production the Express server serves the compiled React build directly; in development, Vite runs a separate dev server with proxy forwarding to the API.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React SPA)                     │
│  ┌────────────┐  ┌────────────────┐  ┌───────────────────────┐  │
│  │ MSAL (SSO) │  │  App UI Pages  │  │  api.js (fetch calls) │  │
│  └────────────┘  └────────────────┘  └───────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTPS / Bearer JWT
┌─────────────────────────────▼───────────────────────────────────┐
│                  Node.js / Express API  (:3001)                 │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │ requireAuth  │  │  27 Routers │  │  Rate Limiting / Helmet│  │
│  │ middleware   │  │  (routes/)  │  │  (security layer)      │  │
│  └──────────────┘  └─────────────┘  └────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                       db.js (sql.js wrapper)               │  │
│  │            SQLite database — helix_support.db.bin          │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────-─┘
           │                           │
           ▼                           ▼
┌──────────────────┐        ┌──────────────────────┐
│  Microsoft Azure │        │  Azure DevOps (ADO)   │
│  ── Entra ID     │        │  ── Work Items API    │
│  ── Graph API    │        │  ── Release Mgmt API  │
│  ── Mailbox      │        └──────────────────────┘
└──────────────────┘
```

---

## Directory Structure

```
FD Clone/
├── server/                        ← Node.js/Express backend
│   ├── index.js                   ← App entry point, route mounting, startup
│   ├── db.js                      ← sql.js SQLite wrapper + full schema + seeds
│   ├── seed.js                    ← Optional demo data seeder
│   ├── check_users.js             ← Utility to inspect users table
│   ├── helix_support.db.bin       ← SQLite database file (binary)
│   ├── middleware/
│   │   ├── requireAuth.js         ← JWT verification, attaches req.user
│   │   ├── adminOnly.js           ← Restricts route to role=admin
│   │   ├── staffOnly.js           ← Restricts route to agent + admin only
│   │   └── handleError.js         ← Centralised error response helper
│   ├── routes/
│   │   ├── tickets.js             ← Ticket CRUD, comments, attachments, tags
│   │   ├── auth.js                ← Azure SSO exchange + dev-login
│   │   ├── users.js               ← User management (admin)
│   │   ├── customers.js           ← Customer account management
│   │   ├── contacts.js            ← Customer contact records
│   │   ├── groups.js              ← Support group management + members
│   │   ├── kb.js                  ← Knowledge base folders, articles, files
│   │   ├── announcements.js       ← Announcements (draft / publish)
│   │   ├── features.js            ← Feature requests / ideas board
│   │   ├── email.js               ← Generic email ingest webhook
│   │   ├── inbound.js             ← Microsoft Graph webhook receiver
│   │   ├── devops.js              ← Azure DevOps integration
│   │   ├── deployments.js         ← Deployment tracking
│   │   ├── reports.js             ← Saved reports
│   │   ├── settings.js            ← App-wide settings key-value store
│   │   ├── emailTemplates.js      ← Editable email notification templates
│   │   ├── cannedResponses.js     ← Reusable reply snippets
│   │   ├── sla.js                 ← SLA policy management
│   │   ├── automation.js          ← Automation rule engine
│   │   ├── customFields.js        ← Custom field definitions + values
│   │   ├── csat.js                ← Customer satisfaction surveys
│   │   ├── status.js              ← System status page (public)
│   │   ├── forum.js               ← Community Q&A forum
│   │   ├── ticketTemplates.js     ← Ticket submission templates
│   │   ├── downloads.js           ← File/resource download library
│   │   ├── tags.js                ← Ticket tags (sub-router of tickets)
│   │   └── tag-definitions.js     ← Global tag colour/description registry
│   ├── services/
│   │   ├── graph.js               ← Microsoft Graph API client (token + subscriptions)
│   │   ├── emailNotifications.js  ← Outbound email notification dispatcher
│   │   └── subscriptionManager.js ← Graph subscription keep-alive (renews every 2 days)
│   └── uploads/
│       ├── ticket_attachments/    ← Uploaded files attached to tickets
│       ├── kb/                    ← Knowledge base uploaded files
│       └── downloads/             ← Admin-uploaded downloadable resources
│
├── client/                        ← React SPA (Vite)
│   ├── src/
│   │   ├── main.jsx               ← React DOM entry, MSAL provider wrapping
│   │   ├── App.jsx                ← Root component, routing, auth state
│   │   ├── api.js                 ← Centralised API client (all fetch calls)
│   │   ├── authConfig.js          ← MSAL/Azure AD configuration + singleton
│   │   ├── components/
│   │   │   ├── Sidebar.jsx        ← Navigation sidebar with page links
│   │   │   ├── CreateTicketModal.jsx ← New ticket creation modal
│   │   │   ├── StatusBadge.jsx    ← Coloured status pill component
│   │   │   └── Toast.jsx          ← Global toast notification system
│   │   ├── context/
│   │   │   ├── UserContext.jsx    ← Current logged-in user (role, email, name)
│   │   │   └── ProductsContext.jsx ← Global product list from settings
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx      ← Azure SSO login + dev bypass
│   │   │   ├── TicketList.jsx     ← Ticket list with filters and search
│   │   │   ├── TicketDetail.jsx   ← Single ticket view + comments + activity
│   │   │   ├── OperationsCenterPage.jsx ← Dashboard with stats + ADO releases
│   │   │   ├── CustomersPage.jsx  ← Customer account management
│   │   │   ├── ContactsPage.jsx   ← Contact management per customer
│   │   │   ├── GroupsPage.jsx     ← Support group management
│   │   │   ├── UsersPage.jsx      ← User/agent management
│   │   │   ├── ProductsPage.jsx   ← Product catalogue management
│   │   │   ├── KnowledgeBasePage.jsx ← KB folder/article/file browser
│   │   │   ├── AnnouncementsPage.jsx ← Announcement management
│   │   │   ├── FeatureRequestsPage.jsx ← Ideas board + voting
│   │   │   ├── DeploymentsPage.jsx ← Deployment tracker
│   │   │   ├── ReportsPage.jsx    ← Saved report builder + viewer
│   │   │   ├── SettingsPage.jsx   ← Admin settings, SLA, automation, etc.
│   │   │   ├── EmailTemplatesPage.jsx ← Edit transactional email templates
│   │   │   └── CustomerPortal.jsx ← External customer-facing portal view
│   │   └── styles/
│   │       └── index.css          ← Global CSS (custom properties + base styles)
│   ├── index.html                 ← HTML entry point
│   ├── vite.config.js             ← Vite + proxy config (dev: /api → :3001)
│   └── package.json
│
├── Dockerfile                     ← Multi-stage Docker build
├── docker-compose.yml             ← Compose definition for containerised deployment
├── e2e_test.js                    ← E2E test suite #1 (core APIs)
├── e2e_test_comprehensive.js      ← E2E test suite #2 (comprehensive, 3-role)
├── e2e_master_tests.js            ← E2E test suite #3 (master, 300+ assertions)
└── run-e2e.sh                     ← Shell script to run all three E2E suites
```

---

## Authentication & Authorization Flow

```
User visits app
      │
      ▼
MSAL checks localStorage for valid Helyx app JWT
      │
  Token valid? ─── YES ──► Render app with cached user role
      │
      NO
      ▼
Microsoft SSO (Azure Entra ID)
  ── user logs in with @helyxtech.com or customer email
  ── MSAL acquires ID token (RS256, signed by Microsoft)
      │
      ▼
POST /api/auth/azure  { idToken }
  ── Backend verifies token against Microsoft JWKS endpoint
  ── Looks up email in `users` table
  ── If found + active → issues our own app JWT (8h, HS256)
  ── If not found or inactive → 403 Forbidden
      │
      ▼
App JWT stored in localStorage
  ── All subsequent API calls carry: Authorization: Bearer <jwt>
  ── requireAuth middleware decodes and attaches req.user { id, name, email, role }
```

**Roles and access levels:**

| Role | Access |
|---|---|
| `admin` | Full access to all features, admin-only endpoints, user/settings management |
| `agent` | All ticket operations, KB, announcements, features, deployments, reports |
| `customer` | Customer portal only — own tickets, public KB, announcements, feature voting |

---

## Request Lifecycle (Typical Ticket API Call)

```
Browser
  │  GET /api/tickets?status=Open
  │  Authorization: Bearer <jwt>
  ▼
Express app (index.js)
  │
  ├── helmet() — security headers
  ├── cors()   — origin validation
  ├── rateLimit() — 300 req/min general, 30/15min auth
  ├── express.json()
  │
  ▼
requireAuth middleware
  │  jwt.verify(token, JWT_SECRET) → req.user = { id, name, email, role }
  ▼
ticketsRouter (routes/tickets.js)
  │  GET /
  │  Builds parameterized SQL query
  │  Role-based filter: customer → own tickets only
  │  db.prepare(sql).all(...params)
  ▼
db.js (sql.js wrapper)
  │  Executes against SQLite in-memory DB
  │  Returns array of row objects
  ▼
res.json(rows) → 200 OK
```

---

## Email-to-Ticket Flow (Microsoft Graph)

```
Email arrives at support@helyxtech.com
      │
Microsoft Graph webhook notification
      │  POST /api/inbound/email
      │  { value: [{ resourceData: { id: "<messageId>" } }] }
      ▼
inbound.js — validates clientState secret
      │
      ▼
graph.js.getMessage(messageId)
  ── fetches full message from Graph API
  ── fetches file attachments if any
      │
      ▼
Deduplication check (email_message_id column)
      │
      ▼
db.prepare INSERT INTO tickets ...
  ── source: 'email'
  ── requester_email: from address
  ── title: email subject
  ── description: email body (HTML stripped)
      │
      ▼
emailNotifications.js
  ── Sends auto-reply to customer (ticket_created_customer template)
  ── Sends new ticket notification to agents (new_ticket_agent template)
```

---

## Database Persistence Model

Helyx Support uses **sql.js** (pure-JavaScript SQLite compiled to WebAssembly). The database is loaded from `helix_support.db.bin` at startup into memory and **persisted back to disk after every write operation**. This gives a synchronous-style API identical to `better-sqlite3` without requiring any native compilation (important for Docker/cross-platform deployment).

> **Backup note:** The single file `server/helix_support.db.bin` contains all application data. Back this file up regularly.
