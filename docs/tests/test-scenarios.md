# Test Scenarios by Feature

This document describes functional test scenarios for every feature area, organized to show what has been tested and what each scenario validates.

---

## 1. Authentication & Authorization

### Scenario 1.1 — Successful Admin Login
**Steps:** POST `/auth/dev-login` with `admin@helyxtech.com`
**Expected:** 200, token returned, user.role === 'admin'
**Covered by:** All three suites

### Scenario 1.2 — Successful Agent Login
**Steps:** POST `/auth/dev-login` with `agent@helyxtech.com`
**Expected:** 200, token returned, user.role === 'agent'
**Covered by:** Comprehensive, Master

### Scenario 1.3 — Successful Customer Login
**Steps:** Create a customer-role user via admin, then POST `/auth/dev-login`
**Expected:** 200, token returned, user.role === 'customer'
**Covered by:** Comprehensive, Master

### Scenario 1.4 — Unknown Email Rejected
**Steps:** POST `/auth/dev-login` with an email not in the database
**Expected:** 403 Forbidden
**Covered by:** All three suites

### Scenario 1.5 — Empty/Missing Email Rejected
**Steps:** POST `/auth/dev-login` with empty or missing email
**Expected:** 400 Bad Request
**Covered by:** Master

### Scenario 1.6 — Invalid Bearer Token Rejected
**Steps:** GET `/tickets` with `Authorization: Bearer bad.token.here`
**Expected:** 401 Unauthorized
**Covered by:** Master

### Scenario 1.7 — Azure Token Missing idToken Field
**Steps:** POST `/auth/azure` with empty body
**Expected:** 400, error message mentions idToken
**Covered by:** Master

### Scenario 1.8 — Azure Token Tampered
**Steps:** POST `/auth/azure` with `{ idToken: "this.is.fake" }`
**Expected:** 401 Unauthorized
**Covered by:** Master

### Scenario 1.9 — All Protected Routes Require Auth
**Steps:** Call each of GET /tickets, /users, /groups, /customers, /stats, /settings, /deployments, /sla, /features, /automation, /reports, /contacts without a token
**Expected:** 401 for all
**Covered by:** Core, Comprehensive, Master

---

## 2. Ticket Management

### Scenario 2.1 — Create Ticket with All Fields
**Steps:** POST `/tickets` with title, description, type, priority, status, product, customer_id, group_id, requester_email
**Expected:** 201, all fields persisted, defaults applied for omitted fields
**Covered by:** All suites

### Scenario 2.2 — Create Ticket with Minimal Fields
**Steps:** POST `/tickets` with only `title`
**Expected:** 201, status=Open, priority=Medium applied as defaults
**Covered by:** Master

### Scenario 2.3 — Create Ticket Missing Required Title
**Steps:** POST `/tickets` with only description (no title)
**Expected:** 400 Bad Request
**Covered by:** All suites

### Scenario 2.4 — Full Status Lifecycle
**Steps:** Create ticket → update to In Investigation → Pending → Resolved → Closed → reopen to Open
**Expected:** Each PUT returns 200 with the new status
**Covered by:** Master

### Scenario 2.5 — All Priority Values Valid
**Steps:** PUT `/tickets/:id` with priority=Low, then Medium, High, Critical
**Expected:** Each returns 200 with correct priority
**Covered by:** Master

### Scenario 2.6 — Customer Can Only See Own Tickets
**Steps:** Customer-role user calls GET `/tickets`
**Expected:** All returned tickets have requester_email matching the customer's email
**Covered by:** Comprehensive, Master

### Scenario 2.7 — Customer Cannot Delete Tickets
**Steps:** Customer-role user calls DELETE `/tickets/:id`
**Expected:** 403 Forbidden
**Covered by:** Comprehensive, Master

### Scenario 2.8 — Agent Cannot Delete Tickets
**Steps:** Agent calls DELETE `/tickets/:id`
**Expected:** 403 Forbidden
**Covered by:** Comprehensive, Master

### Scenario 2.9 — Admin Can Delete Tickets
**Steps:** Admin calls DELETE `/tickets/:id`
**Expected:** 200, ticket removed
**Covered by:** Comprehensive, Master (cleanup)

### Scenario 2.10 — Invalid ID Formats Rejected
**Steps:** GET `/tickets/0`, `/tickets/-5`, `/tickets/not-a-number`
**Expected:** 400 Bad Request for each
**Covered by:** Master

### Scenario 2.11 — Non-Existent Ticket Returns 404
**Steps:** GET `/tickets/9999999`
**Expected:** 404 Not Found
**Covered by:** Comprehensive, Master

### Scenario 2.12 — Ticket Filter by Status
**Steps:** GET `/tickets?status=Open`
**Expected:** 200, all returned tickets have status=Open
**Covered by:** Core, Master

### Scenario 2.13 — Ticket Full-Text Search
**Steps:** GET `/tickets?search=term`
**Expected:** 200, results contain the search term in title, description, or email
**Covered by:** Core, Master

### Scenario 2.14 — SQL Injection in Ticket Title
**Steps:** POST `/tickets` with title containing SQL injection string (e.g. `'; DROP TABLE tickets; --`)
**Expected:** 201, title stored safely as plain string (no SQL error, no data loss)
**Covered by:** Master

### Scenario 2.15 — Unicode/Emoji in Ticket Title
**Steps:** POST `/tickets` with title containing emoji and non-ASCII characters
**Expected:** 201, stored and retrieved correctly
**Covered by:** Master

### Scenario 2.16 — Very Long Description
**Steps:** POST `/tickets` with 10,000+ character description
**Expected:** 201, stored and retrievable
**Covered by:** Master

---

## 3. Ticket Comments

### Scenario 3.1 — Agent Adds Public Comment
**Steps:** POST `/tickets/:id/comments` with `is_public: true`
**Expected:** 201, comment stored, is_public=1
**Covered by:** Comprehensive, Master

### Scenario 3.2 — Agent Adds Internal Note
**Steps:** POST `/tickets/:id/comments` with `is_public: false`
**Expected:** 201, comment stored, is_public=0
**Covered by:** Comprehensive, Master

### Scenario 3.3 — Comment Body Required
**Steps:** POST `/tickets/:id/comments` with no body field
**Expected:** 400 Bad Request
**Covered by:** Master

### Scenario 3.4 — Customer Adds Public Comment
**Steps:** Customer-role user adds comment to their own ticket
**Expected:** 201
**Covered by:** Master

---

## 4. Ticket Tags

### Scenario 4.1 — Add Tag to Ticket
**Steps:** POST `/tickets/:id/tags` with `{ tag: "billing" }`
**Expected:** 200, tag added
**Covered by:** Master

### Scenario 4.2 — List Tags on Ticket
**Steps:** GET `/tickets/:id/tags`
**Expected:** 200, array of tag strings
**Covered by:** Master

### Scenario 4.3 — Tag Appears in Ticket Detail
**Steps:** GET `/tickets/:id` after adding tags
**Expected:** Response includes `tags[]` array with the added tag
**Covered by:** Master

### Scenario 4.4 — Remove Tag
**Steps:** DELETE `/tickets/:id/tags/:tag`
**Expected:** 200, tag removed from ticket
**Covered by:** Master

### Scenario 4.5 — Customer Cannot Add Tags
**Steps:** Customer-role user POSTs to `/tickets/:id/tags`
**Expected:** 403 Forbidden
**Covered by:** Master

---

## 5. Groups

### Scenario 5.1 — Create Group
**Steps:** POST `/groups` with `{ name: "New Group" }`
**Expected:** 201, group has id
**Covered by:** All suites

### Scenario 5.2 — Duplicate Group Name Rejected
**Steps:** POST `/groups` with a name that already exists
**Expected:** 409 Conflict
**Covered by:** Master

### Scenario 5.3 — Add/Remove Member
**Steps:** POST `/groups/:id/members` with user_id → GET members → DELETE member
**Expected:** User appears in and is removed from group member list
**Covered by:** All suites

### Scenario 5.4 — Agent Cannot Create Group
**Steps:** Agent POST `/groups`
**Expected:** 403 Forbidden
**Covered by:** Comprehensive, Master

---

## 6. Users

### Scenario 6.1 — Admin Creates User
**Steps:** POST `/users` with name, email, role
**Expected:** 201, user has id
**Covered by:** All suites

### Scenario 6.2 — Duplicate Email Rejected
**Steps:** POST `/users` with an email that already exists
**Expected:** 409 Conflict
**Covered by:** Master

### Scenario 6.3 — Deactivate and Reactivate User
**Steps:** PATCH `/users/:id/status` with active=false, then active=true
**Expected:** 200 each, active flag toggles
**Covered by:** Master

### Scenario 6.4 — Agent Cannot Create User
**Steps:** Agent POST `/users`
**Expected:** 403 Forbidden
**Covered by:** Comprehensive, Master

---

## 7. Customers

### Scenario 7.1 — Full CRUD
**Steps:** POST → GET → PUT → PATCH (deactivate) → DELETE
**Expected:** All operations succeed, data persists correctly
**Covered by:** All suites

### Scenario 7.2 — Customer Role Cannot Manage Customers
**Steps:** Customer-role user POST `/customers`
**Expected:** 403 Forbidden
**Covered by:** Master

---

## 8. Knowledge Base

### Scenario 8.1 — Nested Folder Structure
**Steps:** Create root folder → create child folder with parent_id → GET /kb/tree
**Expected:** Tree includes parent/child relationship
**Covered by:** Master

### Scenario 8.2 — Create and Publish Article
**Steps:** POST `/kb/articles` with status=draft → PUT with status=published
**Expected:** 201 then 200, status changes to published
**Covered by:** Master

### Scenario 8.3 — Customer Can Browse KB Tree
**Steps:** Customer-role user GET `/kb/tree`
**Expected:** 200 OK
**Covered by:** Comprehensive, Master

---

## 9. Announcements

### Scenario 9.1 — Draft Not Visible in Public Endpoint
**Steps:** Create announcement (status=draft) → GET `/announcements/public`
**Expected:** Draft not in the public list
**Covered by:** Comprehensive, Master

### Scenario 9.2 — Publish Makes Announcement Public
**Steps:** PUT `/announcements/:id` with status=published → GET `/announcements/public`
**Expected:** Announcement appears in public list
**Covered by:** Comprehensive, Master

### Scenario 9.3 — Public Endpoint Requires No Auth
**Steps:** GET `/announcements/public` without any token
**Expected:** 200 OK
**Covered by:** Master

### Scenario 9.4 — Agent Cannot Delete Announcements
**Steps:** Agent DELETE `/announcements/:id`
**Expected:** 403 Forbidden
**Covered by:** Master

---

## 10. Feature Requests

### Scenario 10.1 — Submit, Vote, Unvote
**Steps:** POST `/features` → POST `/features/:id/vote` → POST again (toggle off)
**Expected:** vote_count increments then decrements back
**Covered by:** Master

### Scenario 10.2 — Official Staff Comment
**Steps:** POST `/features/:id/comments` with is_official=true
**Expected:** Comment stored with is_official=1
**Covered by:** Master

### Scenario 10.3 — Status Workflow
**Steps:** Create feature (status=submitted) → PUT with status=planned → in_progress → released
**Expected:** Each PUT reflects the new status
**Covered by:** Master

---

## 11. SLA Policies

### Scenario 11.1 — Default Policies Seeded
**Steps:** GET `/sla`
**Expected:** Four policies exist (Low/Medium/High/Critical) with correct hour values
**Covered by:** Comprehensive, Master

### Scenario 11.2 — Invalid Priority Rejected
**Steps:** POST `/sla` with priority="VeryUrgent"
**Expected:** 400 Bad Request
**Covered by:** Comprehensive, Master

### Scenario 11.3 — SLA Status on Ticket
**Steps:** Create ticket → check sla_status field in GET `/tickets/:id`
**Expected:** sla_status is one of: 'ok', 'breached', 'met', or null
**Covered by:** Implicitly in ticket tests

---

## 12. Automation Rules

### Scenario 12.1 — Create Rule with Conditions and Actions
**Steps:** POST `/automation` with conditions JSON array and actions JSON array
**Expected:** 201, conditions/actions returned as parsed arrays
**Covered by:** Master

### Scenario 12.2 — Agent Cannot Manage Automation
**Steps:** Agent POST `/automation`
**Expected:** 403 Forbidden
**Covered by:** Comprehensive, Master

### Scenario 12.3 — Disable/Enable Rule
**Steps:** PATCH `/automation/:id/status` toggle active
**Expected:** 200, active flag toggles
**Covered by:** Master

---

## 13. Custom Fields

### Scenario 13.1 — Default Fields Seeded
**Steps:** GET `/custom-fields`
**Expected:** Contains ado_bug_id and deviation_id fields
**Covered by:** Master

### Scenario 13.2 — Agent Cannot Create Custom Fields
**Steps:** Agent POST `/custom-fields`
**Expected:** 403 Forbidden
**Covered by:** Master

---

## 14. CSAT Surveys

### Scenario 14.1 — Full Survey Flow
**Steps:** POST `/csat/send/:ticketId` → GET `/csat/:token` → POST `/csat/:token` with rating=5
**Expected:** Survey created, data returned, rating stored and submitted_at set
**Covered by:** Master

### Scenario 14.2 — Customer Submits Rating via Token
**Steps:** GET `/csat/:token` (public) → POST with rating
**Expected:** 200, no authentication required
**Covered by:** Master

---

## 15. Email Ingest Webhook

### Scenario 15.1 — Valid Ingest Creates Ticket
**Steps:** POST `/email/ingest` with valid from, subject, text
**Expected:** 201, ticket created with source=email
**Covered by:** Master

### Scenario 15.2 — Duplicate Subject Deduplication
**Steps:** POST `/email/ingest` twice with same from+subject
**Expected:** Second call returns 200 (existing ticket), not 201
**Covered by:** Master

### Scenario 15.3 — Missing from or subject → 400
**Steps:** POST `/email/ingest` without required fields
**Expected:** 400 Bad Request
**Covered by:** Master

### Scenario 15.4 — Wrong Ingest Secret → 401
**Steps:** POST `/email/ingest` with wrong X-Ingest-Secret header
**Expected:** 401 Unauthorized
**Covered by:** Master

---

## 16. Azure DevOps Integration

### Scenario 16.1 — Config Endpoint Returns Projects
**Steps:** GET `/devops/config`
**Expected:** 200, projects array includes Helyx Platform and Helyx Data
**Covered by:** Manual / integration test (requires ADO credentials)

### Scenario 16.2 — Create Bug Work Item from Ticket
**Steps:** POST `/devops/create-work-item` with ticketId, adoProject=Quality System, workItemType=Bug
**Expected:** 200, workItemId returned, ticket's ado_bug_id updated
**Covered by:** Manual / integration test

### Scenario 16.3 — Invalid ADO Project Rejected
**Steps:** POST `/devops/create-work-item` with adoProject="Invalid"
**Expected:** 400 Bad Request
**Covered by:** Manual test (validateable without ADO credentials)

### Scenario 16.4 — ADO Not Configured Returns 503
**Steps:** Call any `/devops/*` endpoint when ADO_PAT/ADO_ORG_URL are not set
**Expected:** 503 Service Unavailable
**Covered by:** Integration test

---

## 17. Deployments

### Scenario 17.1 — Full CRUD Lifecycle
**Steps:** POST → GET → PUT → DELETE
**Expected:** 201, 200, 200, 200
**Covered by:** Core, Master

### Scenario 17.2 — Filter by Product / Customer
**Steps:** GET `/deployments?product_id=helyx-platform`
**Expected:** 200, filtered results
**Covered by:** Master (implicitly)

---

## 18. Reports

### Scenario 18.1 — Save and Reload Report
**Steps:** POST `/reports` with name, filters, columns → GET `/reports` → find saved report → DELETE
**Expected:** Report persists with correct filters and columns
**Covered by:** Comprehensive, Master

### Scenario 18.2 — Customer Cannot Access Reports
**Steps:** Customer GET `/reports`
**Expected:** 403 Forbidden
**Covered by:** Comprehensive, Master

---

## 19. Forum

### Scenario 19.1 — Full Q&A Flow
**Steps:** POST question → add answer → mark as accepted → verify is_answered=1 on question → delete answer → delete question
**Expected:** All steps succeed, state transitions correct
**Covered by:** Core, Master

---

## 20. Downloads

### Scenario 20.1 — Admin Publishes, Customer Sees
**Steps:** POST `/downloads` (admin) → GET `/downloads` (no auth) → PATCH to deactivate → GET again
**Expected:** Active item appears in public list; deactivated item is filtered out
**Covered by:** Master

### Scenario 20.2 — Agent Cannot Create Download
**Steps:** Agent POST `/downloads`
**Expected:** 403 Forbidden
**Covered by:** Master

---

## 21. Tag Definitions

### Scenario 21.1 — Create Tag Definition with Colour
**Steps:** POST `/tag-definitions` with name, color, bg
**Expected:** 201, tag definition stored
**Covered by:** Master

### Scenario 21.2 — Agent Cannot Manage Tag Definitions
**Steps:** Agent POST `/tag-definitions`
**Expected:** 403 Forbidden
**Covered by:** Master

---

## 22. Contacts

### Scenario 22.1 — Full CRUD
**Steps:** POST → GET → GET with customer_id filter → PUT → DELETE
**Expected:** All operations succeed, filter returns only contacts for that customer
**Covered by:** Master

---

## 23. Status Page

### Scenario 23.1 — Public Read, Staff Write
**Steps:** GET `/status` without auth → PUT `/status` with staff auth → GET again
**Expected:** GET is public (200), PUT requires auth, change persists
**Covered by:** Master

---

## RBAC Summary Matrix

| Operation | Admin | Agent | Customer |
|---|---|---|---|
| Login | ✓ | ✓ | ✓ |
| View tickets (own) | ✓ | ✓ | ✓ |
| View all tickets | ✓ | ✓ | ✗ |
| Create ticket | ✓ | ✓ | ✓ |
| Update ticket | ✓ | ✓ | Limited |
| Delete ticket | ✓ | ✗ | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| Manage groups | ✓ | ✗ | ✗ |
| Manage customers | ✓ | ✓ | ✗ |
| Manage SLA | ✓ | ✗ | ✗ |
| Manage automation | ✓ | ✗ | ✗ |
| Manage custom fields | ✓ | ✗ | ✗ |
| Edit email templates | ✓ | ✗ | ✗ |
| Edit settings | ✓ | ✗ | ✗ |
| View KB | ✓ | ✓ | ✓ |
| Edit KB | ✓ | ✓ | ✗ |
| View announcements | ✓ | ✓ | ✓ (public only) |
| Create announcements | ✓ | ✓ | ✗ |
| Delete announcements | ✓ | ✗ | ✗ |
| Submit feature requests | ✓ | ✓ | ✓ |
| Update feature status | ✓ | ✓ | ✗ |
| Create/manage ADO work items | ✓ | ✓ | ✗ |
| Manage deployments | ✓ | ✓ | ✗ |
| View reports | ✓ | ✓ | ✗ |
| Manage downloads | ✓ | ✗ | ✗ |
| Manage tag definitions | ✓ | ✗ | ✗ |
