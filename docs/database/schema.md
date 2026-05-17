# Database Schema

Helyx Support uses **SQLite** (via sql.js, pure-JavaScript WebAssembly). The database file is `server/helix_support.db.bin`. The schema is defined and migrated inline in `server/db.js` using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` migration blocks.

---

## Tables

### `customers`
Represents a customer organisation / account.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Unique identifier |
| `name` | TEXT | NOT NULL, UNIQUE | Organisation name |
| `active` | INTEGER | NOT NULL, DEFAULT 1 | Soft-delete flag (1=active, 0=inactive) |
| `lifecycle_status` | TEXT | NOT NULL, DEFAULT 'Potential' | Sales stage: Potential, Active, Churned, etc. |
| `contacts` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of contact objects |
| `industry` | TEXT | NOT NULL, DEFAULT '' | Industry vertical |
| `website` | TEXT | NOT NULL, DEFAULT '' | Customer website URL |
| `phone` | TEXT | NOT NULL, DEFAULT '' | Primary phone number |
| `country` | TEXT | NOT NULL, DEFAULT '' | Country |
| `account_manager` | TEXT | NOT NULL, DEFAULT '' | Internal account manager name |
| `notes` | TEXT | NOT NULL, DEFAULT '' | Free-text notes |
| `created_at` | DATETIME | DEFAULT datetime('now') | Record creation timestamp |

---

### `groups`
Support teams/queues that tickets can be assigned to.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Unique identifier |
| `name` | TEXT | NOT NULL, UNIQUE | Group name |
| `active` | INTEGER | NOT NULL, DEFAULT 1 | Soft-delete flag |
| `created_at` | DATETIME | DEFAULT datetime('now') | Record creation timestamp |

**Default groups seeded at startup:**
- Helyx Support
- Helyx Data Engineering
- Helyx Platform Engineering
- Helyx SecOps

---

### `users`
Internal staff accounts (admins, agents) and external customer accounts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Unique identifier |
| `name` | TEXT | NOT NULL | Display name |
| `email` | TEXT | NOT NULL, UNIQUE | Login email (matched against Azure token) |
| `role` | TEXT | NOT NULL, DEFAULT 'agent' | Access role: `admin`, `agent`, `customer` |
| `active` | INTEGER | NOT NULL, DEFAULT 1 | Soft-delete flag |
| `created_at` | DATETIME | DEFAULT datetime('now') | Record creation timestamp |

**Default users seeded at startup:**
- `admin@helyxtech.com` (role: admin)
- `aong@helyxtech.com` (role: agent)
- `schalla@helyxtech.com` (role: agent)
- `agent@helyxtech.com` (role: agent)

---

### `group_members`
Many-to-many join between groups and users.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `group_id` | INTEGER | NOT NULL, PK | FK → groups.id |
| `user_id` | INTEGER | NOT NULL, PK | FK → users.id |

---

### `tickets`
The core entity. Represents a support request.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | Ticket number |
| `title` | TEXT | NOT NULL | Subject line |
| `description` | TEXT | | Full ticket body |
| `type` | TEXT | NOT NULL, DEFAULT 'Question / How-To' | Ticket type (see values below) |
| `requester_email` | TEXT | | Email of the person who submitted |
| `product` | TEXT | | Product the issue relates to |
| `status` | TEXT | NOT NULL, DEFAULT 'Open' | Lifecycle status (see values below) |
| `priority` | TEXT | NOT NULL, DEFAULT 'Medium' | Priority level (Low / Medium / High / Critical) |
| `customer_id` | INTEGER | | FK → customers.id |
| `group_id` | INTEGER | | FK → groups.id |
| `assigned_to` | INTEGER | | FK → users.id (assigned agent) |
| `source` | TEXT | NOT NULL, DEFAULT 'manual' | How the ticket was created: `manual`, `email`, `portal` |
| `email_message_id` | TEXT | | Internet Message-ID for deduplication |
| `ado_bug_id` | TEXT | | Linked Azure DevOps work item ID |
| `ado_work_item_url` | TEXT | | Direct URL to the ADO work item |
| `ado_work_item_type` | TEXT | | ADO type: `Bug` or `Task` |
| `deviation_id` | TEXT | | Linked deviation/change record ID |
| `sla_breached` | INTEGER | NOT NULL, DEFAULT 0 | Flag set when SLA resolution time exceeded |
| `created_at` | DATETIME | DEFAULT datetime('now') | Ticket creation timestamp |
| `updated_at` | DATETIME | DEFAULT datetime('now') | Last update timestamp |

**Type values:** Bug / Incident, Feature Request, Question / How-To, Access / Onboarding, Feedback

**Status values:** Open, Pending, In Investigation, Pending Engineering, Waiting on Customer, Pending Release, Resolved, Closed, Canceled

**Priority values:** Low, Medium, High, Critical

---

### `ticket_comments`
Comments and replies on tickets (both public customer-facing and internal notes).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `ticket_id` | INTEGER | NOT NULL | FK → tickets.id |
| `author` | TEXT | NOT NULL | Display name of commenter |
| `author_role` | TEXT | NOT NULL, DEFAULT 'agent' | Role at time of comment |
| `body` | TEXT | NOT NULL | Comment content (HTML allowed) |
| `is_public` | INTEGER | NOT NULL, DEFAULT 1 | 1 = visible to customer, 0 = internal note |
| `created_at` | DATETIME | DEFAULT datetime('now') | |

---

### `ticket_activity`
Immutable audit log of every change made to a ticket.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `ticket_id` | INTEGER | NOT NULL | FK → tickets.id |
| `actor` | TEXT | NOT NULL | Name/email of user who made the change |
| `action` | TEXT | NOT NULL | e.g. `status_changed`, `comment_added`, `assigned` |
| `field` | TEXT | | Field name that changed |
| `old_value` | TEXT | | Previous value |
| `new_value` | TEXT | | New value |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |

---

### `ticket_attachments`
Files uploaded to tickets or specific comments.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `ticket_id` | INTEGER | NOT NULL | FK → tickets.id |
| `comment_id` | INTEGER | | FK → ticket_comments.id (nullable) |
| `display_name` | TEXT | NOT NULL | Human-readable file name |
| `filename` | TEXT | NOT NULL | Stored filename on disk |
| `original_name` | TEXT | NOT NULL | Original uploaded filename |
| `mimetype` | TEXT | | MIME type |
| `size` | INTEGER | | File size in bytes |
| `uploaded_by` | TEXT | | Email of uploader |
| `created_at` | TEXT | NOT NULL | |

---

### `ticket_tags`
Many-to-many: tags applied to tickets.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `ticket_id` | INTEGER | NOT NULL, PK | FK → tickets.id |
| `tag` | TEXT | NOT NULL, PK | Tag string (references tag_definitions.name) |

---

### `tag_definitions`
Defines the available tags with display colours.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `name` | TEXT | PK | Tag name/slug |
| `color` | TEXT | NOT NULL, DEFAULT '#1D4ED8' | Text/border colour (hex) |
| `bg` | TEXT | NOT NULL, DEFAULT '#EFF6FF' | Background colour (hex) |
| `description` | TEXT | NOT NULL, DEFAULT '' | Human-readable description |
| `created_at` | TEXT | NOT NULL | |

---

### `ticket_custom_fields`
Values of custom fields for each ticket.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `ticket_id` | INTEGER | NOT NULL, PK | FK → tickets.id |
| `field_id` | INTEGER | NOT NULL, PK | FK → custom_field_definitions.id |
| `value` | TEXT | | Field value |

---

### `custom_field_definitions`
Defines what custom fields exist on tickets.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `name` | TEXT | NOT NULL, UNIQUE | Internal field key (e.g. `ado_bug_id`) |
| `label` | TEXT | NOT NULL | Display label (e.g. `ADO Bug ID`) |
| `field_type` | TEXT | NOT NULL, DEFAULT 'text' | Data type: `text`, `number`, `select`, `date` |
| `options` | TEXT | | JSON array of options for select fields |
| `required` | INTEGER | NOT NULL, DEFAULT 0 | Whether field is required |
| `position` | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| `active` | INTEGER | NOT NULL, DEFAULT 1 | Soft-delete flag |
| `created_at` | TEXT | NOT NULL | |

**Default custom fields seeded at startup:**
- `ado_bug_id` — ADO Bug ID (text)
- `deviation_id` — Deviation ID (text)

---

### `kb_folders`
Knowledge base folder hierarchy.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Folder name |
| `parent_id` | INTEGER | | Parent folder (null = root) |
| `created_at` | TEXT | NOT NULL | |

---

### `kb_articles`
Knowledge base articles (rich text content).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `folder_id` | INTEGER | NOT NULL | FK → kb_folders.id |
| `title` | TEXT | NOT NULL | Article title |
| `content` | TEXT | NOT NULL, DEFAULT '' | Article body (HTML) |
| `status` | TEXT | NOT NULL, DEFAULT 'draft' | `draft` or `published` |
| `version` | TEXT | NOT NULL, DEFAULT '0.1' | Version string |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `kb_files`
Files uploaded directly to KB folders.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `folder_id` | INTEGER | NOT NULL | FK → kb_folders.id |
| `display_name` | TEXT | NOT NULL | Human-readable name |
| `filename` | TEXT | NOT NULL | Stored filename |
| `original_name` | TEXT | NOT NULL | Original filename |
| `mimetype` | TEXT | | MIME type |
| `size` | INTEGER | | File size in bytes |
| `created_at` | TEXT | NOT NULL | |

---

### `kb_article_files`
Files attached to specific KB articles.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `article_id` | INTEGER | NOT NULL | FK → kb_articles.id |
| `display_name` | TEXT | NOT NULL | |
| `filename` | TEXT | NOT NULL | |
| `original_name` | TEXT | NOT NULL | |
| `mimetype` | TEXT | | |
| `size` | INTEGER | | |
| `created_at` | TEXT | NOT NULL | |

---

### `feature_requests`
User-submitted feature ideas / product improvement requests.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | Feature title |
| `description` | TEXT | NOT NULL, DEFAULT '' | Full description |
| `product` | TEXT | NOT NULL, DEFAULT '' | Target product |
| `status` | TEXT | NOT NULL, DEFAULT 'submitted' | `submitted`, `under_review`, `planned`, `in_progress`, `released`, `declined` |
| `submitter_email` | TEXT | NOT NULL | Who submitted |
| `submitter_name` | TEXT | NOT NULL, DEFAULT 'Community Member' | |
| `vote_count` | INTEGER | NOT NULL, DEFAULT 0 | Cached vote total |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `feature_votes`
One vote per email per feature request.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `feature_id` | INTEGER | NOT NULL | FK → feature_requests.id |
| `voter_email` | TEXT | NOT NULL | Voter's email |
| `created_at` | TEXT | NOT NULL | |
| | | UNIQUE(feature_id, voter_email) | One vote per person per feature |

---

### `feature_comments`
Comments on feature request entries.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `feature_id` | INTEGER | NOT NULL | FK → feature_requests.id |
| `author` | TEXT | NOT NULL | Author name |
| `author_email` | TEXT | NOT NULL | Author email |
| `body` | TEXT | NOT NULL | Comment content |
| `is_official` | INTEGER | NOT NULL, DEFAULT 0 | 1 = official staff response |
| `created_at` | TEXT | NOT NULL | |

---

### `announcements`
Product or operational announcements published to customers.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | Announcement title |
| `body` | TEXT | NOT NULL, DEFAULT '' | Rich text body (HTML) |
| `type` | TEXT | NOT NULL, DEFAULT 'general' | `general`, `release`, `maintenance`, `incident` |
| `status` | TEXT | NOT NULL, DEFAULT 'draft' | `draft` or `published` |
| `pinned` | INTEGER | NOT NULL, DEFAULT 0 | Pins to top of list |
| `products` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of product names for targeting; `[]` = all |
| `published_at` | TEXT | | ISO timestamp when published |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `settings`
Application-wide key-value configuration store.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | TEXT | PK | Setting key |
| `value` | TEXT | NOT NULL, DEFAULT '' | Setting value |

**Default settings seeded at startup:**

| Key | Default Value | Description |
|---|---|---|
| `company_name` | `Helyx` | Company name used in emails and UI |
| `support_email` | `support@helyxtech.com` | Support inbox address |
| `portal_url` | (from env) | Public URL of the customer portal |
| `announce_notify_customers` | `1` | Email customers on new announcements |
| `announce_notify_agents` | `0` | Email agents on new announcements |
| `products` | `[]` | JSON array of product names |

---

### `email_templates`
Editable HTML email templates for transactional notifications.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | TEXT | PK | Template identifier |
| `subject` | TEXT | NOT NULL, DEFAULT '' | Email subject (supports `{{variables}}`) |
| `body` | TEXT | NOT NULL, DEFAULT '' | HTML body (supports `{{variables}}`) |
| `enabled` | INTEGER | NOT NULL, DEFAULT 1 | Enable/disable this template |

**Templates included:**

| Key | Trigger |
|---|---|
| `ticket_created_customer` | New ticket created — sent to requester |
| `ticket_assigned_agent` | Ticket assigned — sent to agent |
| `ticket_resolved_customer` | Ticket resolved — sent to requester |
| `ticket_closed_customer` | Ticket closed — sent to requester |
| `announcement_published` | New announcement published |
| `csat_survey` | CSAT survey request (sent on resolve) |
| `agent_mentioned` | Agent mentioned with @mention in comment |
| `new_ticket_agent` | New ticket created — sent to agents |

---

### `canned_responses`
Pre-written reply snippets for agent use.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | Name of the response |
| `body` | TEXT | NOT NULL, DEFAULT '' | Response text (HTML) |
| `category` | TEXT | NOT NULL, DEFAULT 'General' | Grouping category |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `sla_policies`
Service Level Agreement definitions by priority.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Policy name |
| `priority` | TEXT | NOT NULL | Ticket priority this applies to |
| `first_response_hours` | INTEGER | NOT NULL, DEFAULT 8 | Max hours to first agent response |
| `resolution_hours` | INTEGER | NOT NULL, DEFAULT 48 | Max hours to resolution |
| `is_default` | INTEGER | NOT NULL, DEFAULT 0 | Whether this is the default policy |
| `active` | INTEGER | NOT NULL, DEFAULT 1 | Enable/disable |
| `created_at` | TEXT | NOT NULL | |

**Default SLA policies seeded:**

| Priority | First Response | Resolution |
|---|---|---|
| Low | 24 hours | 120 hours |
| Medium | 8 hours | 48 hours |
| High | 4 hours | 24 hours |
| Critical | 1 hour | 8 hours |

---

### `automation_rules`
Configurable automation triggers and actions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Rule name |
| `event` | TEXT | NOT NULL, DEFAULT 'ticket_created' | Trigger event |
| `conditions` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of condition objects |
| `actions` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of action objects |
| `active` | INTEGER | NOT NULL, DEFAULT 1 | Enable/disable |
| `position` | INTEGER | NOT NULL, DEFAULT 0 | Execution order |
| `created_at` | TEXT | NOT NULL | |

---

### `pending_automations`
Queued delayed automation actions (e.g. "close after 48 hours of no reply").

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `ticket_id` | INTEGER | NOT NULL | Target ticket |
| `rule_id` | INTEGER | | FK → automation_rules.id |
| `rule_name` | TEXT | NOT NULL, DEFAULT '' | Rule name at time of creation |
| `action_type` | TEXT | NOT NULL | What to do |
| `action_value` | TEXT | NOT NULL, DEFAULT '' | Action parameter value |
| `due_at` | TEXT | NOT NULL | ISO timestamp when action should fire |
| `created_at` | TEXT | NOT NULL | |

---

### `csat_ratings`
Customer Satisfaction survey tokens and responses.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `ticket_id` | INTEGER | NOT NULL | FK → tickets.id |
| `token` | TEXT | NOT NULL, UNIQUE | Unique survey link token |
| `rating` | INTEGER | | 1–5 rating (null until submitted) |
| `comment` | TEXT | | Optional free-text comment |
| `sent_at` | TEXT | NOT NULL | When the survey was emailed |
| `submitted_at` | TEXT | | When the customer responded |

---

### `ticket_templates`
Pre-configured ticket submission forms for common request types.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Template name |
| `description` | TEXT | NOT NULL, DEFAULT '' | Short description |
| `icon` | TEXT | NOT NULL, DEFAULT '📋' | Display emoji |
| `type` | TEXT | NOT NULL, DEFAULT '' | Pre-filled ticket type |
| `product` | TEXT | NOT NULL, DEFAULT '' | Pre-filled product |
| `priority` | TEXT | NOT NULL, DEFAULT 'Medium' | Pre-filled priority |
| `body` | TEXT | NOT NULL, DEFAULT '' | Pre-filled body text |
| `position` | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `forum_questions`
Community Q&A forum questions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | Question title |
| `body` | TEXT | NOT NULL, DEFAULT '' | Question body |
| `author_email` | TEXT | NOT NULL | Author's email |
| `author_name` | TEXT | NOT NULL, DEFAULT '' | Author's display name |
| `is_answered` | INTEGER | NOT NULL, DEFAULT 0 | Has an accepted answer |
| `answer_count` | INTEGER | NOT NULL, DEFAULT 0 | Cached answer count |
| `view_count` | INTEGER | NOT NULL, DEFAULT 0 | View counter |
| `tags` | TEXT | NOT NULL, DEFAULT '' | Comma-separated tags |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `forum_answers`
Answers to forum questions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `question_id` | INTEGER | NOT NULL | FK → forum_questions.id (CASCADE DELETE) |
| `body` | TEXT | NOT NULL | Answer content |
| `author_email` | TEXT | NOT NULL | |
| `author_name` | TEXT | NOT NULL, DEFAULT '' | |
| `is_staff` | INTEGER | NOT NULL, DEFAULT 0 | 1 = staff answer |
| `is_accepted` | INTEGER | NOT NULL, DEFAULT 0 | 1 = accepted/best answer |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `deployments`
Tracks product deployments to customers.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `product_id` | TEXT | NOT NULL, DEFAULT '' | Product identifier |
| `product_name` | TEXT | NOT NULL, DEFAULT '' | Product display name |
| `customer_id` | INTEGER | | FK → customers.id |
| `environment` | TEXT | NOT NULL, DEFAULT 'Production' | Deployment environment |
| `version` | TEXT | NOT NULL, DEFAULT '' | Version deployed |
| `status` | TEXT | NOT NULL, DEFAULT 'Planned' | `Planned`, `In Progress`, `Completed`, `Failed`, `Rolled Back` |
| `assigned_to` | INTEGER | | FK → users.id |
| `deployed_at` | TEXT | | Actual deployment timestamp |
| `notes` | TEXT | NOT NULL, DEFAULT '' | Deployment notes |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `deployment_attachments`
Files attached to deployment records.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `deployment_id` | INTEGER | NOT NULL | FK → deployments.id |
| `display_name` | TEXT | NOT NULL | |
| `filename` | TEXT | NOT NULL | |
| `original_name` | TEXT | NOT NULL | |
| `mimetype` | TEXT | | |
| `size` | INTEGER | | |
| `uploaded_by` | TEXT | | |
| `created_at` | TEXT | NOT NULL | |

---

### `downloads`
File/resource download library (product releases, docs, etc.).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `title` | TEXT | NOT NULL | Resource title |
| `description` | TEXT | NOT NULL, DEFAULT '' | Description |
| `category` | TEXT | NOT NULL, DEFAULT 'General' | Category grouping |
| `product` | TEXT | NOT NULL, DEFAULT '' | Associated product |
| `version` | TEXT | NOT NULL, DEFAULT '' | Version string |
| `file_type` | TEXT | NOT NULL, DEFAULT '' | File type label (e.g. PDF, ZIP) |
| `file_size` | TEXT | NOT NULL, DEFAULT '' | Human-readable size string |
| `url` | TEXT | NOT NULL, DEFAULT '' | External URL (if is_external=1) |
| `filename` | TEXT | NOT NULL, DEFAULT '' | Stored filename (if uploaded) |
| `is_external` | INTEGER | NOT NULL, DEFAULT 0 | 1 = external URL, 0 = uploaded file |
| `is_active` | INTEGER | NOT NULL, DEFAULT 1 | Visibility |
| `position` | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

### `saved_reports`
User-saved report configurations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | Report name |
| `filters` | TEXT | NOT NULL, DEFAULT '{}' | JSON filter state |
| `columns` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of selected columns |
| `created_by` | TEXT | NOT NULL, DEFAULT '' | Creator email |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |

---

## Indexes

| Index | Table | Column(s) | Purpose |
|---|---|---|---|
| `idx_ticket_comments_ticket_id` | ticket_comments | ticket_id | Fast comment lookup per ticket |
| `idx_ticket_activity_ticket_id` | ticket_activity | ticket_id | Fast activity log per ticket |
| `idx_ticket_attachments_ticket_id` | ticket_attachments | ticket_id | Fast attachment lookup per ticket |
| `idx_csat_ratings_ticket_id` | csat_ratings | ticket_id | Fast CSAT lookup per ticket |
| `idx_tickets_status` | tickets | status | Filter tickets by status |
| `idx_tickets_priority` | tickets | priority | Filter tickets by priority |
| `idx_tickets_assigned_to` | tickets | assigned_to | Filter by assigned agent |
| `idx_tickets_customer_id` | tickets | customer_id | Filter by customer |
| `idx_tickets_group_id` | tickets | group_id | Filter by group |
| `idx_kb_articles_folder_id` | kb_articles | folder_id | Articles per folder |
| `idx_kb_files_folder_id` | kb_files | folder_id | Files per folder |
| `idx_deployments_product_id` | deployments | product_id | Deployments per product |
| `idx_deployments_customer_id` | deployments | customer_id | Deployments per customer |
| `idx_deployment_attachments_dep_id` | deployment_attachments | deployment_id | Attachments per deployment |

---

## Entity Relationships (Summary)

```
customers (1) ──< (M) tickets
customers (1) ──< (M) deployments
groups    (1) ──< (M) tickets
groups    (M) >──< (M) users   [via group_members]
users     (1) ──< (M) tickets  [assigned_to]

tickets   (1) ──< (M) ticket_comments
tickets   (1) ──< (M) ticket_activity
tickets   (1) ──< (M) ticket_attachments
tickets   (M) >──< (M) tags  [via ticket_tags]
tickets   (M) >──< (M) custom_field_definitions [via ticket_custom_fields]
tickets   (1) ──< (1) csat_ratings

feature_requests (1) ──< (M) feature_votes
feature_requests (1) ──< (M) feature_comments

kb_folders (1) ──< (M) kb_folders [self-ref parent_id]
kb_folders (1) ──< (M) kb_articles
kb_folders (1) ──< (M) kb_files
kb_articles (1) ──< (M) kb_article_files

forum_questions (1) ──< (M) forum_answers

deployments (1) ──< (M) deployment_attachments

automation_rules (1) ──< (M) pending_automations
```
