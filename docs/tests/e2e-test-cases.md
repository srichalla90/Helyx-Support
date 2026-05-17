# E2E Test Cases

This document lists every test case across the three E2E test suites.

---

## Suite 1: `e2e_test.js` — Core API Tests

### Health
| # | Test Case | Expected |
|---|---|---|
| 1 | GET /health — no auth required | 200 OK |
| 2 | Response has status: "ok" | Body: `{ status: "ok" }` |

### Auth
| # | Test Case | Expected |
|---|---|---|
| 3 | POST /auth/dev-login as admin | 200, returns token |
| 4 | dev-login returns token field | Token is a string |
| 5 | POST /auth/dev-login with unknown email | 403 Forbidden |

### Security — Auth Enforcement
| # | Test Case | Expected |
|---|---|---|
| 6 | GET /tickets without token | 401 Unauthorized |
| 7 | GET /users without token | 401 Unauthorized |
| 8 | GET /deployments without token | 401 Unauthorized |

### Stats
| # | Test Case | Expected |
|---|---|---|
| 9 | GET /stats → 200 | 200 OK |
| 10 | Stats has `total` (number) | typeof total === 'number' |
| 11 | Stats has `by_status` (array) | Array.isArray |
| 12 | Stats has `by_priority` (array) | Array.isArray |

### Settings
| # | Test Case | Expected |
|---|---|---|
| 13 | GET /settings → 200 | 200 OK with settings object |
| 14 | PUT /settings updates company_name | 200, updated value returned |

### Groups CRUD
| # | Test Case | Expected |
|---|---|---|
| 15 | POST /groups creates a group | 201, id assigned |
| 16 | GET /groups lists groups | 200, array |
| 17 | PUT /groups/:id updates group | 200, name updated |
| 18 | GET /groups/:id/members | 200, array |
| 19 | POST /groups/:id/members adds member | 201 |
| 20 | DELETE /groups/:id/members/:uid removes member | 200 |
| 21 | DELETE /groups/:id deletes group | 200 |

### Users CRUD
| # | Test Case | Expected |
|---|---|---|
| 22 | POST /users creates user | 201 |
| 23 | GET /users lists users | 200, array |
| 24 | PUT /users/:id updates user | 200 |
| 25 | DELETE /users/:id deletes user | 200 |

### Customers CRUD
| # | Test Case | Expected |
|---|---|---|
| 26 | POST /customers creates customer | 201 |
| 27 | GET /customers lists customers | 200, array |
| 28 | PUT /customers/:id updates customer | 200 |
| 29 | DELETE /customers/:id deletes customer | 200 |

### Tickets CRUD
| # | Test Case | Expected |
|---|---|---|
| 30 | POST /tickets creates ticket | 201, id assigned |
| 31 | GET /tickets lists tickets | 200, array |
| 32 | GET /tickets/:id gets ticket | 200 |
| 33 | PUT /tickets/:id updates ticket | 200 |
| 34 | POST /tickets/:id/comments adds comment | 201 |
| 35 | GET /tickets?status=Open filters by status | 200, array |
| 36 | GET /tickets?priority=High filters by priority | 200, array |
| 37 | GET /tickets?search=term full-text search | 200, array |
| 38 | DELETE /tickets/:id deletes ticket | 200 |

### Knowledge Base
| # | Test Case | Expected |
|---|---|---|
| 39 | POST /kb/folders creates folder | 201 |
| 40 | GET /kb/tree returns tree | 200 |
| 41 | PUT /kb/folders/:id renames folder | 200 |
| 42 | POST /kb/articles creates article | 201 |
| 43 | PUT /kb/articles/:id updates article | 200 |
| 44 | DELETE /kb/articles/:id deletes article | 200 |
| 45 | DELETE /kb/folders/:id deletes folder | 200 |

### Announcements
| # | Test Case | Expected |
|---|---|---|
| 46 | POST /announcements creates announcement | 201 |
| 47 | GET /announcements lists announcements | 200, array |
| 48 | PUT /announcements/:id updates announcement | 200 |
| 49 | DELETE /announcements/:id deletes | 200 |

### Feature Requests
| # | Test Case | Expected |
|---|---|---|
| 50 | POST /features creates feature request | 201 |
| 51 | GET /features lists features | 200, array |
| 52 | PUT /features/:id updates feature | 200 |
| 53 | DELETE /features/:id deletes feature | 200 |

### SLA Policies
| # | Test Case | Expected |
|---|---|---|
| 54 | GET /sla lists SLA policies | 200, array |
| 55 | POST /sla creates new SLA policy | 201 |
| 56 | PUT /sla/:id updates SLA policy | 200 |
| 57 | DELETE /sla/:id deletes SLA policy | 200 |

### Automation Rules
| # | Test Case | Expected |
|---|---|---|
| 58 | GET /automation lists rules | 200, array |
| 59 | POST /automation creates rule | 201 |
| 60 | PUT /automation/:id updates rule | 200 |
| 61 | DELETE /automation/:id deletes rule | 200 |

### Custom Fields
| # | Test Case | Expected |
|---|---|---|
| 62 | GET /custom-fields lists definitions | 200, array |
| 63 | POST /custom-fields creates definition | 201 |
| 64 | PUT /custom-fields/:id updates definition | 200 |
| 65 | DELETE /custom-fields/:id deletes definition | 200 |

### Canned Responses
| # | Test Case | Expected |
|---|---|---|
| 66 | GET /canned-responses lists responses | 200, array |
| 67 | POST /canned-responses creates response | 201 |
| 68 | PUT /canned-responses/:id updates response | 200 |
| 69 | DELETE /canned-responses/:id deletes | 200 |

### Email Templates
| # | Test Case | Expected |
|---|---|---|
| 70 | GET /email-templates lists templates | 200, array |
| 71 | PUT /email-templates/:key updates template | 200 |

### Ticket Templates
| # | Test Case | Expected |
|---|---|---|
| 72 | GET /ticket-templates lists templates | 200, array |
| 73 | POST /ticket-templates creates template | 201 |
| 74 | DELETE /ticket-templates/:id deletes | 200 |

### Forum
| # | Test Case | Expected |
|---|---|---|
| 75 | POST /forum creates question | 201 |
| 76 | GET /forum lists questions | 200, array |
| 77 | GET /forum/:id gets question | 200 |
| 78 | POST /forum/:id/answers adds answer | 201 |
| 79 | DELETE /forum/:id deletes question | 200 |

### Deployments
| # | Test Case | Expected |
|---|---|---|
| 80 | POST /deployments creates deployment | 201 |
| 81 | GET /deployments lists deployments | 200, array |
| 82 | PUT /deployments/:id updates deployment | 200 |
| 83 | DELETE /deployments/:id deletes | 200 |

---

## Suite 2: `e2e_test_comprehensive.js` — Comprehensive Tests

### Frontend Build
| # | Test Case | Expected |
|---|---|---|
| 1 | React client builds without errors (Vite build) | Exit code 0 |

### Auth (3 roles)
| # | Test Case | Expected |
|---|---|---|
| 2 | Dev login as admin → 200 | Token returned, role=admin |
| 3 | Admin login returns token | typeof token === 'string' |
| 4 | Admin login returns role=admin | user.role === 'admin' |
| 5 | Dev login as agent → 200 | Token returned, role=agent |
| 6 | Agent login returns token | typeof token === 'string' |
| 7 | Agent login returns role=agent | user.role === 'agent' |
| 8 | Create customer-role user | 201 |
| 9 | Dev login as customer → 200 | Token returned, role=customer |
| 10 | Customer login returns token | typeof token === 'string' |
| 11 | Customer login returns role=customer | user.role === 'customer' |

### Auth Negative Cases
| # | Test Case | Expected |
|---|---|---|
| 12 | GET /tickets without token → 401 | 401 |
| 13 | GET /users without token → 401 | 401 |
| 14 | GET /customers without token → 401 | 401 |
| 15 | GET /stats without token → 401 | 401 |
| 16 | POST /tickets without token → 401 | 401 |
| 17 | POST /auth/dev-login with unknown email → 403 | 403 |

### Tickets
| # | Test Case | Expected |
|---|---|---|
| 18 | Admin creates ticket → 201 | 201, id assigned |
| 19 | Ticket has correct title | title matches input |
| 20 | Ticket defaults status=Open | status === 'Open' |
| 21 | Ticket defaults priority=Medium | priority === 'Medium' |
| 22 | POST /tickets missing title → 400 | 400 |
| 23 | Agent can create ticket → 201 | 201 |
| 24 | Customer cannot create ticket for other email | 403 or filtered |
| 25 | Admin GET /tickets/:id → 200 | 200 |
| 26 | Agent GET /tickets/:id → 200 | 200 |
| 27 | Customer GET /tickets — sees only own | All items have matching email |
| 28 | PUT /tickets/:id updates status | 200, status updated |
| 29 | PUT /tickets/:id updates priority | 200, priority updated |
| 30 | Customer cannot DELETE /tickets/:id → 403 | 403 |
| 31 | Agent cannot DELETE /tickets/:id → 403 | 403 |
| 32 | Admin can DELETE /tickets/:id → 200 | 200 |

### Ticket Comments
| # | Test Case | Expected |
|---|---|---|
| 33 | Agent adds public comment → 201 | 201 |
| 34 | Comment is_public=true | is_public === 1 |
| 35 | Agent adds internal note (is_public=false) → 201 | 201 |
| 36 | Customer cannot see internal notes | Internal notes filtered in portal |

### Groups
| # | Test Case | Expected |
|---|---|---|
| 37 | Admin creates group → 201 | 201 |
| 38 | Agent can GET /groups → 200 | 200 |
| 39 | Agent cannot POST /groups → 403 | 403 |
| 40 | Customer cannot GET /groups → 403 | 403 |
| 41 | Admin adds member to group → 200 | 200 |
| 42 | Admin removes member from group → 200 | 200 |
| 43 | Admin deletes group → 200 | 200 |

### Users
| # | Test Case | Expected |
|---|---|---|
| 44 | Admin creates user → 201 | 201 |
| 45 | Agent cannot create user → 403 | 403 |
| 46 | Admin can deactivate user → 200 | 200, active=0 |
| 47 | Admin deletes user → 200 | 200 |

### Customers
| # | Test Case | Expected |
|---|---|---|
| 48 | Admin creates customer → 201 | 201 |
| 49 | Agent can create customer → 201 | 201 |
| 50 | Customer role cannot create customer → 403 | 403 |
| 51 | PUT /customers/:id updates customer | 200 |
| 52 | Admin deletes customer → 200 | 200 |

### SLA Policies
| # | Test Case | Expected |
|---|---|---|
| 53 | GET /sla returns default policies | 200, has Critical/High/Medium/Low |
| 54 | Admin creates SLA policy → 201 | 201 |
| 55 | Invalid priority → 400 | 400 |
| 56 | Agent cannot create SLA → 403 | 403 |
| 57 | Admin updates SLA → 200 | 200 |
| 58 | Admin deletes SLA → 200 | 200 |

### Automation Rules
| # | Test Case | Expected |
|---|---|---|
| 59 | Admin creates automation rule → 201 | 201 |
| 60 | Agent cannot create automation rule → 403 | 403 |
| 61 | Admin updates rule → 200 | 200 |
| 62 | Admin deletes rule → 200 | 200 |

### Custom Fields
| # | Test Case | Expected |
|---|---|---|
| 63 | GET /custom-fields returns default fields | 200, includes ado_bug_id |
| 64 | Admin creates custom field → 201 | 201 |
| 65 | Agent cannot create custom field → 403 | 403 |
| 66 | Admin deletes custom field → 200 | 200 |

### Canned Responses
| # | Test Case | Expected |
|---|---|---|
| 67 | Agent creates canned response → 201 | 201 |
| 68 | Customer cannot create canned response → 403 | 403 |
| 69 | DELETE canned response → 200 | 200 |

### Knowledge Base
| # | Test Case | Expected |
|---|---|---|
| 70 | Admin creates KB folder → 201 | 201 |
| 71 | GET /kb/tree returns tree | 200 |
| 72 | Admin creates KB article → 201 | 201 |
| 73 | Customer can GET /kb/tree → 200 | 200 |
| 74 | Agent deletes KB article → 200 | 200 |
| 75 | Admin deletes KB folder → 200 | 200 |

### Announcements
| # | Test Case | Expected |
|---|---|---|
| 76 | Admin creates announcement → 201 | 201 |
| 77 | GET /announcements/public is public (no auth) → 200 | 200 |
| 78 | Unpublished announcement not in public list | Not in public endpoint |
| 79 | Published announcement appears in public list | In public endpoint |
| 80 | Admin deletes announcement → 200 | 200 |

### Feature Requests
| # | Test Case | Expected |
|---|---|---|
| 81 | Agent creates feature request → 201 | 201 |
| 82 | Customer creates feature request → 201 | 201 |
| 83 | Admin can update feature status → 200 | 200 |
| 84 | Admin deletes feature request → 200 | 200 |

### Reports
| # | Test Case | Expected |
|---|---|---|
| 85 | Agent saves a report → 201 | 201 |
| 86 | GET /reports lists reports | 200 |
| 87 | DELETE /reports/:id deletes | 200 |
| 88 | Customer cannot access reports → 403 | 403 |

### Error Handling Edge Cases
| # | Test Case | Expected |
|---|---|---|
| 89 | GET /tickets/9999999 → 404 | 404 |
| 90 | GET /groups/9999999 → 404 | 404 |
| 91 | GET /customers/9999999 → 404 | 404 |
| 92 | POST /tickets missing required field → 400 | 400 |
| 93 | POST /groups missing name → 400 | 400 |
| 94 | POST /sla invalid priority → 400 | 400 |

---

## Suite 3: `e2e_master_tests.js` — Master Tests (300+)

### Health
| # | Test Case | Expected |
|---|---|---|
| 1 | GET /health → 200 (no auth required) | 200 |
| 2 | Health body has status:ok | status === 'ok' |

### Auth — Edge Cases
| # | Test Case | Expected |
|---|---|---|
| 3 | dev-login with empty body → 400 | 400 |
| 4 | dev-login with empty email → 400 | 400 |
| 5 | dev-login with unknown email → 403 | 403 |
| 6 | POST /auth/azure missing idToken → 400 | 400 |
| 7 | Error message mentions idToken | message includes "idToken" |
| 8 | POST /auth/azure with invalid token → 401 | 401 |
| 9 | Invalid bearer token → 401 | 401 |
| 10 | admin dev-login → 200 | 200 |
| 11 | admin login returns token | string |
| 12 | admin login role=admin | role === 'admin' |
| 13 | agent dev-login → 200 | 200 |
| 14 | agent login role=agent | role === 'agent' |
| 15 | customer dev-login → 200 | 200 |
| 16 | customer login role=customer | role === 'customer' |

### Unauthenticated Access Rejected
| # | Test Case | Expected |
|---|---|---|
| 17–28 | GET {each protected endpoint} without token → 401 | 401 for: /tickets, /users, /groups, /customers, /stats, /settings, /deployments, /sla, /features, /automation, /reports, /contacts |

### Stats
| # | Test Case | Expected |
|---|---|---|
| 29 | GET /stats → 200 | 200 |
| 30 | Stats has total (number) | number |
| 31 | Stats has by_status (array) | array |
| 32 | Stats has by_priority (array) | array |
| 33 | Agent can GET /stats → 200 | 200 |

### Settings
| # | Test Case | Expected |
|---|---|---|
| 34 | GET /settings → 200 | 200 |
| 35 | Settings has company_name | string |
| 36 | Settings has support_email | string |
| 37 | Settings has products (array) | array |
| 38 | PUT /settings updates company_name | 200, updated |
| 39 | PUT /settings reverts company_name | 200 |
| 40 | Agent can GET /settings | 200 |
| 41 | Customer cannot GET /settings → 403 | 403 |
| 42 | Agent cannot PUT /settings → 403 | 403 |

### Users CRUD + RBAC
| # | Test Case | Expected |
|---|---|---|
| 43 | Admin POST /users creates user → 201 | 201 |
| 44 | New user has id | number |
| 45 | New user has email | matches input |
| 46 | New user has role=agent | role |
| 47 | GET /users returns array | array |
| 48 | New user appears in list | found in list |
| 49 | PUT /users/:id updates name | 200 |
| 50 | Updated name persists | GET confirms |
| 51 | PATCH /users/:id/status deactivates | 200, active=0 |
| 52 | PATCH /users/:id/status reactivates | 200, active=1 |
| 53 | Agent cannot POST /users → 403 | 403 |
| 54 | Agent cannot DELETE /users/:id → 403 | 403 |
| 55 | Customer cannot GET /users → 403 | 403 |
| 56 | POST /users duplicate email → 409 | 409 |
| 57 | POST /users missing email → 400 | 400 |
| 58 | POST /users missing name → 400 | 400 |

### Groups CRUD + RBAC
| # | Test Case | Expected |
|---|---|---|
| 59 | Admin POST /groups → 201 | 201 |
| 60 | Group has id and name | present |
| 61 | GET /groups returns array | array |
| 62 | PUT /groups/:id updates name | 200 |
| 63 | POST /groups/:id/members adds member | 200 |
| 64 | GET /groups/:id/members lists member | array with user |
| 65 | DELETE /groups/:id/members/:uid removes | 200 |
| 66 | PATCH /groups/:id/status deactivates | 200 |
| 67 | Agent cannot POST /groups → 403 | 403 |
| 68 | POST /groups duplicate name → 409 | 409 |
| 69 | POST /groups missing name → 400 | 400 |

### Customers CRUD + RBAC
| # | Test Case | Expected |
|---|---|---|
| 70 | Admin POST /customers → 201 | 201 |
| 71 | GET /customers returns array | array |
| 72 | PUT /customers/:id updates | 200 |
| 73 | PATCH /customers/:id/status deactivates | 200 |
| 74 | Customer cannot POST /customers → 403 | 403 |
| 75 | POST /customers duplicate name → 409 | 409 |

### Tickets — Full Lifecycle
| # | Test Case | Expected |
|---|---|---|
| 76 | POST /tickets (all fields) → 201 | 201 |
| 77 | Ticket has id | present |
| 78 | Ticket has correct title | matches |
| 79 | Ticket has comments array | array |
| 80 | Ticket has attachments array | array |
| 81 | POST /tickets (minimal) → 201 | 201 |
| 82 | Minimal ticket defaults status=Open | Open |
| 83 | Minimal ticket defaults priority=Medium | Medium |
| 84 | POST /tickets missing title → 400 | 400 |
| 85 | POST /tickets empty body → 400 | 400 |
| 86 | Admin GET /tickets/:id → 200 | 200 |
| 87 | Ticket id matches | id match |
| 88 | GET /tickets/9999999 → 404 | 404 |
| 89 | GET /tickets/not-a-number → 400 | 400 |
| 90 | GET /tickets/0 → 400 | 400 |
| 91 | GET /tickets/-5 → 400 | 400 |
| 92–95 | Ticket status → In Investigation/Pending/Resolved/Closed | 200 each |
| 96–99 | Ticket priority → Low/Medium/High/Critical | 200 each |
| 100 | GET /tickets?status filter → 200 | 200 |
| 101 | GET /tickets?priority filter → 200 | 200 |
| 102 | GET /tickets?search → 200 | 200, array |
| 103 | Customer sees only own tickets | filtered correctly |
| 104 | Customer cannot DELETE ticket → 403 | 403 |
| 105 | Agent cannot DELETE ticket → 403 | 403 |

### Ticket Comments
| # | Test Case | Expected |
|---|---|---|
| 106 | POST /tickets/:id/comments → 201 | 201 |
| 107 | Comment body matches | correct body |
| 108 | Comment is_public=true | 1 |
| 109 | Add internal note (is_public=false) → 201 | 201 |
| 110 | Internal note is_public=false | 0 |
| 111 | Comment without body → 400 | 400 |
| 112 | Customer can add public comment | 201 |
| 113 | GET /tickets/:id includes comments array | comments present |

### Ticket Attachments — Download/Delete
| # | Test Case | Expected |
|---|---|---|
| 114 | GET /tickets/attachments/9999999/download → 404 | 404 |
| 115 | DELETE /tickets/attachments/9999999 → 404 | 404 |

### Ticket Merge
| # | Test Case | Expected |
|---|---|---|
| 116 | POST /tickets/:id/merge with target → 200 or 404 | handled |

### Input Edge Cases
| # | Test Case | Expected |
|---|---|---|
| 117 | Ticket with SQL injection in title — title stored safely | No SQL error |
| 118 | Ticket with XSS in description — stored as-is | No injection |
| 119 | Ticket with very long description (10,000 chars) → 201 | 201 |
| 120 | Ticket with Unicode/emoji in title → 201 | 201 |
| 121 | Update ticket with empty string title → 400 | 400 |

### Knowledge Base
| # | Test Case | Expected |
|---|---|---|
| 122 | POST /kb/folders creates root folder → 201 | 201 |
| 123 | POST /kb/folders creates child folder → 201 | 201, parent_id set |
| 124 | GET /kb/tree returns nested structure | 200, has folders |
| 125 | PUT /kb/folders/:id renames | 200 |
| 126 | POST /kb/articles creates article → 201 | 201 |
| 127 | Article has folder_id | present |
| 128 | PUT /kb/articles/:id updates | 200 |
| 129 | Article status → published | 200 |
| 130 | DELETE /kb/articles/:id → 200 | 200 |
| 131 | GET /kb/files/:id/download non-existent → 404 | 404 |
| 132 | DELETE /kb/folders/:id → 200 | 200 |
| 133 | Customer can GET /kb/tree → 200 | 200 |

### Announcements
| # | Test Case | Expected |
|---|---|---|
| 134 | POST /announcements → 201 | 201 |
| 135 | Announcement has id, title, status=draft | present |
| 136 | GET /announcements → 200 | 200, array |
| 137 | PUT /announcements/:id publishes | status=published |
| 138 | GET /announcements/public returns published | 200, array |
| 139 | Draft not in public list | filtered |
| 140 | Published is in public list | present |
| 141 | No auth required for GET /announcements/public | 200 |
| 142 | DELETE /announcements/:id → 200 | 200 |
| 143 | Customer can GET /announcements/public | 200 |
| 144 | Agent cannot DELETE announcement → 403 | 403 |

### Feature Requests
| # | Test Case | Expected |
|---|---|---|
| 145 | POST /features → 201 | 201 |
| 146 | Feature has id, title, status=submitted | present |
| 147 | GET /features returns array | 200 |
| 148 | POST /features/:id/vote adds vote | 200 |
| 149 | Vote count increases | vote_count + 1 |
| 150 | POST /features/:id/vote again removes vote (toggle) | vote_count back |
| 151 | POST /features/:id/comments adds comment → 201 | 201 |
| 152 | PUT /features/:id updates status → under_review | 200 |
| 153 | DELETE /features/:id/comments/:id → 200 | 200 |
| 154 | DELETE /features/:id → 200 | 200 |
| 155 | Customer can submit feature request | 201 |
| 156 | Customer can vote | 200 |

### SLA Policies
| # | Test Case | Expected |
|---|---|---|
| 157 | GET /sla has default policies | 200, has Critical |
| 158 | Default Critical policy: 1h response, 8h resolution | correct values |
| 159 | Default High policy: 4h, 24h | correct values |
| 160 | POST /sla → 201 | 201 |
| 161 | SLA has id and priority | present |
| 162 | PUT /sla/:id updates hours | 200 |
| 163 | PATCH /sla/:id/status toggles active | 200 |
| 164 | POST /sla invalid priority → 400 | 400 |
| 165 | Agent cannot POST /sla → 403 | 403 |
| 166 | DELETE /sla/:id → 200 | 200 |

### Canned Responses
| # | Test Case | Expected |
|---|---|---|
| 167 | POST /canned-responses → 201 | 201 |
| 168 | GET /canned-responses returns array | 200 |
| 169 | PUT /canned-responses/:id updates | 200 |
| 170 | Customer cannot POST canned responses → 403 | 403 |
| 171 | DELETE /canned-responses/:id → 200 | 200 |

### Email Templates
| # | Test Case | Expected |
|---|---|---|
| 172 | GET /email-templates returns array | 200, non-empty |
| 173 | Has ticket_created_customer template | present |
| 174 | PUT /email-templates/:key updates subject | 200 |
| 175 | Updated subject persists | GET confirms |
| 176 | Agent cannot PUT email templates → 403 | 403 |
| 177 | Non-existent key → 404 | 404 |

### CSAT
| # | Test Case | Expected |
|---|---|---|
| 178 | POST /csat/send/:ticketId sends survey | 200 or 201 |
| 179 | GET /csat/:token returns survey data | 200 |
| 180 | POST /csat/:token with rating=5 → 200 | 200 |
| 181 | Rating persists | submitted_at set |
| 182 | GET /csat lists ratings (staff) | 200, array |

### Status Page
| # | Test Case | Expected |
|---|---|---|
| 183 | GET /status → 200 (public) | 200 |
| 184 | PUT /status updates status | 200 |
| 185 | GET /status reflects update | updated value |

### Downloads
| # | Test Case | Expected |
|---|---|---|
| 186 | POST /downloads → 201 (admin) | 201 |
| 187 | GET /downloads returns active items (public) | 200 |
| 188 | GET /downloads/all returns all items (staff) | 200 |
| 189 | PUT /downloads/:id updates | 200 |
| 190 | PATCH /downloads/:id/status deactivates | 200 |
| 191 | Deactivated item not in public list | filtered |
| 192 | Agent cannot POST /downloads → 403 | 403 |
| 193 | DELETE /downloads/:id → 200 | 200 |

### Deployments
| # | Test Case | Expected |
|---|---|---|
| 194 | POST /deployments → 201 | 201 |
| 195 | Deployment has id, product_name | present |
| 196 | GET /deployments returns array | 200 |
| 197 | PUT /deployments/:id updates | 200 |
| 198 | DELETE /deployments/:id → 200 | 200 |

### Reports
| # | Test Case | Expected |
|---|---|---|
| 199 | POST /reports → 201 | 201 |
| 200 | GET /reports returns array | 200 |
| 201 | Report has filters and columns | present |
| 202 | DELETE /reports/:id → 200 | 200 |
| 203 | Customer cannot access reports → 403 | 403 |

### Forum
| # | Test Case | Expected |
|---|---|---|
| 204 | POST /forum creates question → 201 | 201 |
| 205 | GET /forum returns array | 200 |
| 206 | GET /forum/:id returns question | 200 |
| 207 | POST /forum/:id/answers adds answer → 201 | 201 |
| 208 | Answer appears in question answers | present |
| 209 | PATCH /forum/:id/answers/:id/accept → 200 | 200 |
| 210 | Accepted answer is_accepted=1 | 1 |
| 211 | Question is_answered=1 | 1 |
| 212 | DELETE /forum/:id/answers/:id → 200 | 200 |
| 213 | DELETE /forum/:id → 200 | 200 |

### Tag Definitions
| # | Test Case | Expected |
|---|---|---|
| 214 | POST /tag-definitions → 201 | 201 |
| 215 | GET /tag-definitions returns array | 200 |
| 216 | PUT /tag-definitions/:name updates colour | 200 |
| 217 | Agent cannot POST tag definitions → 403 | 403 |
| 218 | DELETE /tag-definitions/:name → 200 | 200 |

### Contacts
| # | Test Case | Expected |
|---|---|---|
| 219 | POST /contacts → 201 | 201 |
| 220 | GET /contacts returns array | 200 |
| 221 | GET /contacts?customer_id filters | 200, filtered |
| 222 | PUT /contacts/:id updates | 200 |
| 223 | DELETE /contacts/:id → 200 | 200 |

### Custom Fields
| # | Test Case | Expected |
|---|---|---|
| 224 | GET /custom-fields returns default fields | 200 |
| 225 | Has ado_bug_id field | present |
| 226 | Has deviation_id field | present |
| 227 | POST /custom-fields → 201 | 201 |
| 228 | PUT /custom-fields/:id updates label | 200 |
| 229 | PATCH /custom-fields/:id/status toggles active | 200 |
| 230 | Agent cannot POST custom fields → 403 | 403 |
| 231 | DELETE /custom-fields/:id → 200 | 200 |

### Automation Rules
| # | Test Case | Expected |
|---|---|---|
| 232 | POST /automation → 201 | 201 |
| 233 | Rule conditions parsed from JSON | array |
| 234 | Rule actions parsed from JSON | array |
| 235 | GET /automation returns array | 200 |
| 236 | PUT /automation/:id updates | 200 |
| 237 | PATCH /automation/:id/status toggles | 200 |
| 238 | Agent cannot POST automation → 403 | 403 |
| 239 | DELETE /automation/:id → 200 | 200 |

### Ticket Templates
| # | Test Case | Expected |
|---|---|---|
| 240 | POST /ticket-templates → 201 | 201 |
| 241 | GET /ticket-templates returns array | 200 |
| 242 | PUT /ticket-templates/:id updates | 200 |
| 243 | Agent cannot POST ticket templates → 403 | 403 |
| 244 | DELETE /ticket-templates/:id → 200 | 200 |

### Email Ingest
| # | Test Case | Expected |
|---|---|---|
| 245 | POST /email/ingest creates ticket → 201 | 201 |
| 246 | Ingested ticket source=email | source === 'email' |
| 247 | Ingested ticket requester_email matches from | email match |
| 248 | Ingested ticket title matches subject | title match |
| 249 | POST /email/ingest duplicate subject → 200 (existing) | 200 |
| 250 | POST /email/ingest missing from → 400 | 400 |
| 251 | POST /email/ingest missing subject → 400 | 400 |
| 252 | POST /email/ingest wrong secret → 401 | 401 |

### Ticket Tags
| # | Test Case | Expected |
|---|---|---|
| 253 | POST /tickets/:id/tags adds tag → 200 | 200 |
| 254 | GET /tickets/:id/tags returns tags | 200, array |
| 255 | Tag appears in ticket detail | tags array includes tag |
| 256 | DELETE /tickets/:id/tags/:tag removes tag | 200 |
| 257 | Customer cannot add tags → 403 | 403 |

### Inbound Route
| # | Test Case | Expected |
|---|---|---|
| 258 | GET /inbound/email without validationToken → ignored | 200 or 204 |
| 259 | POST /inbound/email with wrong clientState → 401 | 401 |

### RBAC Cross-Cutting Checks
| # | Test Case | Expected |
|---|---|---|
| 260 | Customer cannot DELETE any resource | 403 across entities |
| 261 | Agent cannot access admin-only settings | 403 |
| 262 | Admin can access all endpoints | 200/201 |

### Cleanup
| # | Test Case | Expected |
|---|---|---|
| 263–300+ | Delete all resources created during the test run | 200 or already deleted |

---

## Test Result Summary Format

```
═══════════════════════════════════════════
  Helyx Support — Full E2E Test Suite
═══════════════════════════════════════════

▶ Health
  ✓ GET /health → 200
  ✓ returns status:ok
...

═══════════════════════════════
  Passed:  280
  Failed:  0
  Skipped: 5
═══════════════════════════════
```

Skipped tests typically indicate a dependency wasn't created (e.g. no admin token acquired, or a prior step failed). They do not count as failures.
