# API Reference

**Base URL:** `http://localhost:3001/api` (development) / `https://<your-domain>/api` (production)

All protected routes require: `Authorization: Bearer <app-jwt>`

**Auth levels used in this document:**
- **Public** — No auth required
- **Auth** — Any authenticated user (admin, agent, or customer)
- **Staff** — Agents and admins only
- **Admin** — Admins only

---

## Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | Returns `{ status: "ok", ts: "<iso-timestamp>" }` |

---

## Stats

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | Auth | Dashboard counts: total, open, pending, resolved, critical, by_status[], by_priority[], by_product[] |

---

## Authentication

### POST `/auth/azure`
Exchange a Microsoft MSAL ID token for an app JWT.

**Body:** `{ "idToken": "<microsoft-id-token>" }`

**Response 200:** `{ "token": "<app-jwt>", "user": { "id", "name", "email", "role" } }`

**Response 401:** Invalid or expired Microsoft token.

**Response 403:** Email not registered in the system, or account deactivated.

---

### POST `/auth/dev-login`
Development only — bypasses Azure SSO. Blocked in `NODE_ENV=production`.

**Body:** `{ "email": "admin@helyxtech.com" }`

**Response 200:** `{ "token": "<app-jwt>", "user": { "id", "name", "email", "role" } }`

**Response 403:** Email not found in users table or account deactivated.

---

## Tickets

### GET `/tickets`
List tickets. Customers see only their own tickets.

**Auth:** Auth

**Query params:**

| Param | Description |
|---|---|
| `status` | Filter by status string |
| `priority` | Filter by priority |
| `product` | Filter by product |
| `group_id` | Filter by group ID |
| `type` | Filter by ticket type |
| `customer_id` | Filter by customer ID |
| `assigned_to` | Filter by assigned user ID |
| `requester_email` | Filter by requester email (staff only) |
| `search` | Full-text search on title, description, email |

**Response:** Array of ticket objects (includes customer_name, group_name, assigned_user_name, sla_status, sla_remaining_hours).

---

### POST `/tickets`
Create a new ticket.

**Auth:** Auth

**Body:**
```json
{
  "title": "Login page broken",
  "description": "Cannot log in since 9am",
  "type": "Bug / Incident",
  "requester_email": "user@example.com",
  "product": "Helyx Platform",
  "status": "Open",
  "priority": "High",
  "customer_id": 1,
  "group_id": 2
}
```

**Response 201:** Created ticket object.

---

### GET `/tickets/:id`
Get a single ticket with comments, attachments, custom fields, and tags.

**Auth:** Auth (customers restricted to own tickets)

**Response:** Ticket object with `comments[]`, `attachments[]`, `custom_fields{}`, `tags[]`.

---

### PUT `/tickets/:id`
Update ticket fields.

**Auth:** Auth

**Body:** Any subset of ticket fields.

**Response:** Updated ticket object. Triggers automation rules and SLA checks.

---

### DELETE `/tickets/:id`
Delete a ticket and all related data.

**Auth:** Admin

**Response 200:** `{ "deleted": true }`

---

### POST `/tickets/:id/comments`
Add a comment or internal note.

**Auth:** Auth

**Body:**
```json
{
  "author": "A Ong",
  "body": "We are investigating this issue.",
  "is_public": true
}
```

`is_public: false` creates an internal note not visible to customers.

**Response 201:** Comment object. Fires email notifications if public.

---

### GET `/tickets/:id/activity`
Retrieve the full audit log for a ticket.

**Auth:** Staff

**Response:** Array of `ticket_activity` rows.

---

### POST `/tickets/:id/attachments`
Upload files to a ticket (multipart/form-data).

**Auth:** Auth

**Form fields:** `files[]` (multiple file inputs)

**Response 200:** `{ "attachments": [...] }`

Allowed types: JPEG, PNG, GIF, WebP, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, ZIP. Max 50 MB per file.

---

### DELETE `/tickets/attachments/:id`
Delete a ticket attachment.

**Auth:** Staff

**Response 200:** `{ "deleted": true }`

---

### GET `/tickets/attachments/:id/download`
Download a ticket attachment file.

**Auth:** Auth (customers restricted to own ticket attachments)

**Response:** File binary with correct Content-Type.

---

### GET `/tickets/:ticketId/tags`
List tags on a ticket.

**Auth:** Auth

---

### POST `/tickets/:ticketId/tags`
Add a tag to a ticket.

**Auth:** Staff

**Body:** `{ "tag": "billing" }`

---

### DELETE `/tickets/:ticketId/tags/:tag`
Remove a tag from a ticket.

**Auth:** Staff

---

## Groups

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/groups` | Auth | List all groups with member counts |
| POST | `/groups` | Admin | Create group `{ name }` |
| PUT | `/groups/:id` | Admin | Update group `{ name }` |
| PATCH | `/groups/:id/status` | Admin | Toggle active `{ active: true/false }` |
| DELETE | `/groups/:id` | Admin | Delete group |
| GET | `/groups/:id/members` | Auth | List group members |
| POST | `/groups/:id/members` | Admin | Add member `{ user_id }` |
| DELETE | `/groups/:id/members/:userId` | Admin | Remove member |

---

## Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | Staff | List all users |
| POST | `/users` | Admin | Create user `{ name, email, role }` |
| PUT | `/users/:id` | Admin | Update user `{ name, email, role }` |
| PATCH | `/users/:id/status` | Admin | Toggle active `{ active: true/false }` |
| DELETE | `/users/:id` | Admin | Delete user |

---

## Customers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/customers` | Staff | List all customers |
| POST | `/customers` | Staff | Create customer `{ name, lifecycle_status, ... }` |
| PUT | `/customers/:id` | Staff | Update customer |
| PATCH | `/customers/:id/status` | Admin | Toggle active |
| POST | `/customers/bulk-import` | Admin | Bulk import `{ rows: [{name, ...}] }` |
| DELETE | `/customers/:id` | Admin | Delete customer |

---

## Contacts

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/contacts` | Staff | List contacts (optional `?customer_id=`) |
| POST | `/contacts` | Staff | Create contact `{ name, email, customer_id, ... }` |
| PUT | `/contacts/:id` | Staff | Update contact |
| DELETE | `/contacts/:id` | Staff | Delete contact |

---

## Knowledge Base

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/kb/tree` | Auth | Full folder tree with articles and files |
| POST | `/kb/folders` | Staff | Create folder `{ name, parent_id? }` |
| PUT | `/kb/folders/:id` | Staff | Rename folder `{ name }` |
| DELETE | `/kb/folders/:id` | Admin | Delete folder (and contents) |
| POST | `/kb/folders/:id/files` | Staff | Upload files (multipart) |
| DELETE | `/kb/files/:id` | Staff | Delete KB file |
| GET | `/kb/files/:id/download` | Auth | Download KB file |
| POST | `/kb/articles` | Staff | Create article `{ folder_id, title, content, status, version }` |
| PUT | `/kb/articles/:id` | Staff | Update article |
| DELETE | `/kb/articles/:id` | Staff | Delete article |

---

## Announcements

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/announcements/public` | Public (GET only) | List published announcements for customer portal |
| GET | `/announcements` | Staff | List all announcements (including drafts) |
| POST | `/announcements` | Staff | Create announcement |
| PUT | `/announcements/:id` | Staff | Update announcement |
| DELETE | `/announcements/:id` | Admin | Delete announcement |

Publishing an announcement (`status: "published"`) triggers email notifications to customers/agents based on the `announce_notify_customers` / `announce_notify_agents` settings.

---

## Feature Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/features` | Auth | List all feature requests |
| POST | `/features` | Auth | Submit new feature request |
| PUT | `/features/:id` | Staff | Update status, title, description |
| DELETE | `/features/:id` | Admin | Delete feature request |
| POST | `/features/:id/vote` | Auth | Toggle vote (upvote/unvote) |
| POST | `/features/:id/comments` | Auth | Add comment |
| DELETE | `/features/:id/comments/:commentId` | Admin | Delete comment |

---

## Email

### POST `/email/ingest`
Generic email-to-ticket webhook. Used by SendGrid, Postmark, Zapier, etc.

**Auth:** `X-Ingest-Secret` header (value set in env `EMAIL_INGEST_SECRET`)

**Body:**
```json
{
  "from": "customer@example.com",
  "subject": "Login page is broken",
  "text": "I cannot log in since this morning...",
  "html": "<p>I cannot log in...</p>"
}
```

**Response 201:** Created or existing ticket object.

Deduplicates by email subject thread to avoid creating duplicate tickets from reply chains.

---

## Inbound (Microsoft Graph Webhook)

### POST `/inbound/email`
Microsoft Graph change notification endpoint. Called by Azure when a new email arrives in the support mailbox.

**Auth:** `clientState` header validation (matches `GRAPH_WEBHOOK_SECRET`)

**Body:** Microsoft Graph notification payload.

The server fetches the full message from Graph API and creates a ticket.

### GET `/inbound/email`
Webhook validation endpoint (Microsoft calls this with a `validationToken` query param during subscription setup).

---

## Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/settings` | Auth | Get all settings as key-value object |
| PUT | `/settings` | Admin | Update settings (partial update supported) |

---

## Email Templates

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/email-templates` | Staff | List all templates |
| PUT | `/email-templates/:key` | Admin | Update a template `{ subject, body, enabled }` |

---

## Canned Responses

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/canned-responses` | Staff | List all canned responses |
| POST | `/canned-responses` | Staff | Create `{ title, body, category }` |
| PUT | `/canned-responses/:id` | Staff | Update |
| DELETE | `/canned-responses/:id` | Staff | Delete |

---

## SLA Policies

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/sla` | Auth | List all SLA policies ordered by priority |
| POST | `/sla` | Admin | Create policy `{ name, priority, first_response_hours, resolution_hours }` |
| PUT | `/sla/:id` | Admin | Update policy |
| PATCH | `/sla/:id/status` | Admin | Toggle active |
| DELETE | `/sla/:id` | Admin | Delete policy |

---

## Automation Rules

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/automation` | Auth | List all rules |
| POST | `/automation` | Admin | Create rule `{ name, event, conditions, actions, active }` |
| PUT | `/automation/:id` | Admin | Update rule |
| PATCH | `/automation/:id/status` | Admin | Toggle active |
| DELETE | `/automation/:id` | Admin | Delete rule |

**Trigger events:** `ticket_created`, `ticket_updated`, `comment_added`

**Condition fields:** `status`, `priority`, `type`, `product`, `customer_id`, `group_id`

**Action types:** `set_status`, `set_priority`, `set_group`, `assign_to`, `send_email`, `add_tag`, `close_after_hours`

---

## Custom Fields

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/custom-fields` | Auth | List all field definitions |
| POST | `/custom-fields` | Admin | Create definition `{ name, label, field_type, options?, required? }` |
| PUT | `/custom-fields/:id` | Admin | Update definition |
| PATCH | `/custom-fields/:id/status` | Admin | Toggle active |
| DELETE | `/custom-fields/:id` | Admin | Delete definition |

---

## CSAT

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/csat/:token` | Public | Get survey data by token |
| POST | `/csat/:token` | Public | Submit rating `{ rating: 1-5, comment? }` |
| GET | `/csat` | Staff | List all CSAT ratings |
| POST | `/csat/send/:ticketId` | Staff | Send CSAT survey for a resolved ticket |

---

## Status Page

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/status` | Public | Get current system status |
| PUT | `/status` | Staff | Update system status |

---

## Ticket Templates

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/ticket-templates` | Auth | List all templates |
| POST | `/ticket-templates` | Admin | Create template |
| PUT | `/ticket-templates/:id` | Admin | Update template |
| DELETE | `/ticket-templates/:id` | Admin | Delete template |

---

## Forum

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/forum` | Auth | List questions |
| POST | `/forum` | Auth | Ask a question `{ title, body, tags? }` |
| GET | `/forum/:id` | Auth | Get question with answers |
| PUT | `/forum/:id` | Staff | Update question |
| DELETE | `/forum/:id` | Admin | Delete question |
| POST | `/forum/:id/answers` | Auth | Post an answer `{ body }` |
| PATCH | `/forum/:id/answers/:answerId/accept` | Staff | Mark as accepted answer |
| DELETE | `/forum/:id/answers/:answerId` | Admin | Delete answer |

---

## Downloads

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/downloads` | Public | List active downloads (customer-facing) |
| GET | `/downloads/all` | Staff | List all downloads including inactive |
| POST | `/downloads` | Admin | Create download entry |
| PUT | `/downloads/:id` | Admin | Update |
| PATCH | `/downloads/:id/status` | Admin | Toggle active |
| DELETE | `/downloads/:id` | Admin | Delete |

---

## Deployments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/deployments` | Staff | List deployments (filterable) |
| POST | `/deployments` | Staff | Create deployment record |
| PUT | `/deployments/:id` | Staff | Update deployment |
| DELETE | `/deployments/:id` | Admin | Delete deployment |
| POST | `/deployments/:id/attachments` | Staff | Upload attachment (multipart) |
| DELETE | `/deployments/:id/attachments/:attId` | Staff | Delete attachment |

---

## Reports

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/reports` | Staff | List all saved reports |
| POST | `/reports` | Staff | Save a report `{ name, filters, columns }` |
| DELETE | `/reports/:id` | Staff | Delete saved report |

---

## Azure DevOps Integration

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/devops/config` | Staff | Get configured ADO projects and work item types |
| GET | `/devops/suggest/:ticketId` | Staff | Suggest ADO project based on ticket's product |
| POST | `/devops/create-work-item` | Staff | Create Bug or Task in ADO from a ticket |
| GET | `/devops/work-item-state/:workItemId` | Staff | Fetch live ADO work item state |
| GET | `/devops/releases` | Staff | Fetch classic releases from ADO (keepForever=true only) |
| GET | `/devops/release-definitions` | Staff | List release pipeline definitions |
| GET | `/devops/releases-debug` | Staff | Debug: raw keepForever data for last 20 releases |

### POST `/devops/create-work-item` Body
```json
{
  "ticketId": 42,
  "adoProject": "Quality System",
  "workItemType": "Bug"
}
```

**Response:**
```json
{
  "workItemId": 1234,
  "workItemUrl": "https://dev.azure.com/CelitoTech/Quality%20System/_workitems/edit/1234",
  "workItemType": "Bug",
  "adoProject": "Quality System",
  "title": "[Helyx #42] Login page broken"
}
```

---

## Tag Definitions

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tag-definitions` | Auth | List all tag definitions |
| POST | `/tag-definitions` | Admin | Create `{ name, color, bg, description? }` |
| PUT | `/tag-definitions/:name` | Admin | Update tag definition |
| DELETE | `/tag-definitions/:name` | Admin | Delete tag definition |

---

## Rate Limits

| Scope | Limit | Window |
|---|---|---|
| `/api/auth/*` | 30 requests | 15 minutes |
| `/api/email/ingest` | 30 requests | 1 minute |
| `/api/inbound` | 30 requests | 1 minute |
| All other `/api/*` | 300 requests | 1 minute |

Exceeding limits returns HTTP 429 with `{ "error": "Too many requests, please try again later." }`.
