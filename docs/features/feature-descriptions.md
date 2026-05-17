# Feature Descriptions

This document describes every feature in the Helyx Support application in detail.

---

## 1. Authentication & User Management

### Azure Entra ID SSO (Single Sign-On)
Users log in via Microsoft Azure Entra ID (formerly Azure AD). The MSAL library handles the OAuth 2.0 / OIDC flow in the browser. After Microsoft authenticates the user, the frontend sends the ID token to the backend, which validates it cryptographically against Microsoft's JWKS endpoint and issues a short-lived (8-hour) app JWT. This JWT is stored in `localStorage` and sent with every API request.

**Key behaviours:**
- All users must be pre-registered in the `users` table by an admin. Azure handles authentication; Helyx controls authorization.
- Inactive users are rejected at login with a clear message.
- Dev environments can bypass SSO using `POST /auth/dev-login` (blocked in production).
- The app JWT is checked on page load — expired tokens trigger a silent re-login.

### Role-Based Access Control (RBAC)
Three roles are supported:

- **Admin** — Full access including user management, settings, automation rules, SLA policies, tag definitions, and all admin-only destructive operations.
- **Agent** — Full access to tickets, customers, KB, announcements, features, deployments, reports, and forum. Cannot manage users, settings, or automation rules.
- **Customer** — Restricted portal access: can only view/create their own tickets, view published KB articles and announcements, submit feature requests, and vote on ideas.

---

## 2. Ticket Management

The core feature of the application. Tickets represent support requests from customers or internal teams.

### Creating Tickets
- **Manual creation** — via the Create Ticket modal (all fields available to agents/admins)
- **Email ingest** — via the email webhook (`/api/email/ingest`) or Microsoft Graph inbox subscription
- **Customer portal** — customers can submit tickets from the CustomerPortal page
- **Ticket templates** — pre-configured forms for common request types (access requests, bug reports, etc.)

### Ticket Fields
- **Title** (required)
- **Description** — rich text / HTML
- **Type** — Bug / Incident, Feature Request, Question / How-To, Access / Onboarding, Feedback
- **Priority** — Low, Medium, High, Critical
- **Status** — Open, Pending, In Investigation, Pending Engineering, Waiting on Customer, Pending Release, Resolved, Closed, Canceled
- **Product** — configurable via Settings > Products
- **Customer** — linked to a customer account
- **Group** — assigned support team
- **Assigned To** — individual agent
- **Requester Email** — auto-set from email ingest
- **Source** — `manual`, `email`, `portal`
- **Tags** — multiple tags from the tag definitions registry
- **Custom Fields** — ADO Bug ID, Deviation ID, and any admin-configured fields
- **ADO Work Item** — linked Azure DevOps Bug or Task (ID, URL, type)

### Viewing Tickets
- **TicketList page** — sortable by created date (newest first), filterable by status/priority/product/group/type/search
- **Sidebar navigation** — quick links for All Tickets, Open, Pending, Resolved views
- **TicketDetail page** — full detail: fields, comments thread, activity log, attachments, custom fields, tags, SLA status indicator, ADO work item link

### Ticket Comments
- **Public reply** — visible to the customer, triggers email notification to requester
- **Internal note** — visible to agents only, not sent to customer
- Supports @mention of agent names, which triggers an email notification to the mentioned agent
- Canned responses can be inserted into the reply editor

### Ticket Activity Log
Every change to a ticket is recorded: status changes, priority changes, assignments, comments added, tags changed, custom field updates, ADO work item creation. Visible in the TicketDetail page.

### File Attachments
Agents and customers can upload files to tickets. Supported types: JPEG, PNG, GIF, WebP, PDF, TXT, CSV, DOC, DOCX, XLS, XLSX, ZIP. Max 50 MB per file. Files are stored on disk with randomised filenames.

### SLA Tracking
Each priority level has an SLA policy with `first_response_hours` and `resolution_hours`. The ticket list and detail views show:
- **SLA status**: `ok` (within time), `breached` (overdue), `met` (resolved in time), or `null` (no policy matched)
- **Remaining hours** before SLA breach

---

## 3. Operations Center (Dashboard)

The home page after login. Provides a real-time operational overview:

- **Ticket statistics** — total, open, pending, resolved, critical counts
- **Charts** — tickets by status, by priority, by product
- **Azure DevOps releases** — the live list of "Retain Indefinitely" releases from both ADO projects (Helyx Platform and Helyx Data), showing environment deployment statuses

---

## 4. Customer Management

Manage the customer organisations that use Helyx products.

- **Customer list** with search, filter by status, filter by lifecycle stage
- **Customer details** — name, industry, website, phone, country, account manager, notes, lifecycle status
- **Lifecycle stages** — Potential, Active, Churned, etc.
- **Contacts** — per-customer contact person records (separate Contacts page)
- **Ticket history** — view all tickets submitted by a customer
- **Bulk import** — import customers from CSV/array
- **Soft delete** — deactivate customers without deleting historical data

---

## 5. Contacts

Manage individual contact people within customer organisations.

- Each contact is linked to a customer
- Fields: name, email, phone, title/role
- Separate Contacts page with search and customer filter

---

## 6. Groups

Support teams that can be assigned to tickets.

- Create and manage named groups (e.g. "Helyx Support", "Helyx Platform Engineering")
- Add/remove agents as members
- Soft delete (deactivate without losing history)
- Groups appear in ticket assignment dropdowns

---

## 7. Users

Manage all system users (agents, admins, customers).

- Create/edit/deactivate users
- Assign roles: `admin`, `agent`, `customer`
- Customer-role users are restricted to the customer portal view

---

## 8. Knowledge Base

A hierarchical document library for support documentation.

- **Folder structure** — nested folders (unlimited depth via parent_id)
- **Articles** — rich-text articles with status (`draft` / `published`) and version tracking
- **File uploads** — attach files directly to folders or articles
- **Download** — all KB files are downloadable via authenticated endpoints
- Accessible to all authenticated users; customers see the KB in the portal

---

## 9. Announcements

Publish product updates, maintenance notices, incidents, and general news.

- **Types** — general, release, maintenance, incident
- **Draft / Published** workflow
- **Pinned** — pin important announcements to the top
- **Product targeting** — target announcements to specific products; empty array = all customers
- **Email notifications** — on publish, optionally email customers and/or agents (controlled by settings)
- **Public endpoint** — `/api/announcements/public` is accessible without auth (for the customer portal)

---

## 10. Feature Requests (Ideas Board)

A community-style board for collecting and tracking product improvement ideas.

- Anyone can submit a feature request with a title, description, and product
- **Voting** — authenticated users can upvote/unvote; vote count is displayed
- **Status workflow** — submitted → under_review → planned → in_progress → released / declined
- **Comments** — discussion threads on each feature; staff can mark replies as "official responses"
- Visible in both the staff UI and the customer portal

---

## 11. Products

A simple catalogue of products managed through Settings > Products.

- Products are stored as a JSON array in the `settings` table (key: `products`)
- Available in ticket type/product dropdowns, announcement targeting, deployment records, and KB filtering
- Managed by admins via the ProductsPage

---

## 12. Deployments

Track product deployments to customers.

- **Record fields** — product, customer, environment (Production/Staging/Dev), version, status, assigned engineer, notes, deployed timestamp
- **Status values** — Planned, In Progress, Completed, Failed, Rolled Back
- **File attachments** — attach release notes, runbooks, or sign-off docs to deployments
- **Filtering** — by product, customer, environment, status
- Linked to the customer and product catalogues for cross-referencing

---

## 13. Azure DevOps (ADO) Integration

Connects tickets to Azure DevOps work items and shows release pipeline data.

### Work Item Creation
From any ticket's detail page, an agent can create a linked ADO work item:
- **Type** — Bug or Task
- **Project** — Quality System (Helyx Platform) or HelyxData (Helyx Data)
- The ticket's product field auto-suggests the appropriate ADO project
- On creation, the ADO work item ID is saved to the ticket's `ado_bug_id` custom field and the ticket row
- A direct link to the ADO work item is shown on the ticket detail page
- Activity log records the work item creation

### Work Item State Sync
The ticket detail page can fetch the live state of a linked ADO work item:
- Shows current state (Active, Closed, Resolved, etc.)
- Shows work item type, title, and project

### Release Pipeline View
The Operations Center shows the list of "Retain Indefinitely" Classic Releases from both ADO projects:
- Release name, definition, status (Active/Abandoned)
- Build version and branch
- Environment deployment statuses (notStarted, inProgress, succeeded, rejected, canceled)
- Deployed timestamps per environment

---

## 14. Reports

Build, save, and reload custom ticket reports.

- **Filter combinations** — status, priority, product, type, date range, customer, assigned agent
- **Column selection** — choose which ticket fields to display
- **Save/load reports** — saved reports are stored per-user; reloading restores the exact filter + column state
- Accessible to agents and admins

---

## 15. Settings

Admin-only configuration panel:

### General Settings
- Company name (used in emails and page titles)
- Support email address
- Portal URL (used in email links)

### SLA Policies
Full CRUD for SLA policies. Default policies are seeded at startup.

### Automation Rules
Create trigger-based rules to automate ticket workflow:
- **Events** — ticket_created, ticket_updated, comment_added
- **Conditions** — match on status, priority, type, product, customer, group
- **Actions** — set status/priority/group/assignee, send email, add tag, close after N hours (delayed action)
- Rules are evaluated in position order when the trigger event fires

### Custom Fields
Define additional fields on tickets. Default fields (ADO Bug ID, Deviation ID) are seeded at startup. Supports text, number, select, and date field types.

### Email Templates
Edit the HTML subject and body for all transactional email types. Templates support `{{variable}}` placeholders. Can be enabled/disabled individually.

### Canned Responses
Manage the library of pre-written reply snippets available to agents in the comment editor.

### Ticket Templates
Configure pre-filled forms for common ticket types, surfaced in the "New Ticket" dropdown.

### Tag Definitions
Define the available ticket tags with custom display colours (text colour + background colour).

### Products
Manage the product catalogue (JSON array). Products appear throughout the app.

---

## 16. Email Notifications

Outbound emails are sent via Microsoft Graph API's `sendMail` endpoint using the support mailbox.

### Triggers

| Template | Trigger |
|---|---|
| `ticket_created_customer` | New ticket created — sent to requester |
| `new_ticket_agent` | New ticket created — sent to all active agents |
| `ticket_assigned_agent` | Ticket assigned to an agent — sent to that agent |
| `ticket_resolved_customer` | Ticket resolved — sent to requester |
| `ticket_closed_customer` | Ticket closed — sent to requester |
| `announcement_published` | Announcement published — sent to customers/agents per settings |
| `csat_survey` | Ticket resolved — CSAT survey link emailed to requester |
| `agent_mentioned` | Agent @mentioned in a comment — sent to mentioned agent |

### Template Variables
All templates support `{{company_name}}`, `{{ticket_id}}`, `{{ticket_title}}`, `{{priority}}`, `{{type}}`, `{{status}}`, `{{portal_url}}`, `{{requester_email}}`, `{{agent_name}}` and more. Templates are fully editable in Settings > Email Templates.

---

## 17. CSAT (Customer Satisfaction)

Automatically collect satisfaction ratings after tickets are resolved.

- On ticket resolution, a survey email is sent to the requester with a unique tokenised link
- The customer clicks a rating (1–5) which submits directly without requiring login
- Optional free-text comment
- Survey tokens expire in 30 days
- Staff can view all CSAT ratings and averages in the admin panel

---

## 18. Forum (Community Q&A)

An internal or customer-facing Q&A board.

- Ask and answer questions
- Staff answers are visually distinguished
- Accept a best answer (sets `is_accepted = 1`, marks question `is_answered = 1`)
- Question view counter
- Tag questions for categorisation

---

## 19. Downloads Library

A curated library of downloadable files and resources.

- Admin uploads files (PDFs, ZIPs, DOCXs, etc.) or links to external URLs
- Organise by category and product
- Version tracking
- Active/inactive toggle
- Public endpoint (`GET /downloads`) for the customer portal

---

## 20. Status Page

A simple system status indicator.

- Staff can set the current system status
- Public GET endpoint for embedding in the customer portal
- Status can be used to communicate incidents or maintenance windows

---

## 21. Customer Portal

A separate, simplified UI for customer-role users:

- View and create their own support tickets
- See published announcements
- Browse the knowledge base
- Submit and vote on feature requests
- View the downloads library

The same React SPA serves both the internal staff UI and the customer portal — the rendered view and navigation adapt based on the user's role.

---

## 22. Toast Notifications

Global in-app toast notification system for success/error feedback on every operation. Toasts auto-dismiss after a few seconds and are displayed in the corner of the screen.

---

## 23. Inbound Email (Microsoft Graph Webhook)

When properly configured with Azure credentials:
1. At startup, the app creates a Microsoft Graph change-notification subscription watching the support mailbox inbox
2. The `subscriptionManager` renews the subscription every 2 days (before the 3-day maximum expiry)
3. When a new email arrives, Microsoft calls `POST /api/inbound/email`
4. The server verifies the `clientState` header, fetches the full message and attachments from Graph API, and creates a ticket
5. Email deduplication uses the `email_message_id` column to prevent duplicate tickets from re-notifications
6. Reply emails from the support portal include proper `In-Reply-To` and `References` headers for email threading
