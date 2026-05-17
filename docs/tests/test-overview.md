# Test Overview

## Test Files

Helyx Support has three end-to-end (E2E) test suites, all implemented as standalone Node.js scripts that make real HTTP requests against a running server.

| File | Description | Assertions | Coverage |
|---|---|---|---|
| `e2e_test.js` | Core API test suite — the original | ~100 | Auth, tickets, groups, users, customers, KB, announcements, features, SLA, automation, custom fields, canned responses, templates, deployments, forum |
| `e2e_test_comprehensive.js` | Comprehensive suite — 3-role testing, frontend build check | ~200 | All of the above plus customer-role access control, role isolation, error handling edge cases |
| `e2e_master_tests.js` | Master suite — 300+ assertions | 300+ | All of the above plus contacts, tag definitions, reports, downloads, CSAT, ticket templates, full CRUD lifecycle for every entity |

All three suites are independent and can be run in any order or combination.

---

## Test Runner Script

`run-e2e.sh` — Shell script that starts the server and runs all three suites in sequence.

```bash
#!/bin/bash
# Usage: bash run-e2e.sh
# Requires: server installed and configured at ./server/
cd server && NODE_ENV=test node index.js &
SERVER_PID=$!
sleep 2  # Wait for DB to initialise

node e2e_test.js
node e2e_test_comprehensive.js
node e2e_master_tests.js

kill $SERVER_PID
```

---

## How to Run Tests

### Prerequisites
1. Server must be running on `http://localhost:3001`
2. `NODE_ENV` must be `development` or `test` (enables dev-login)
3. The admin user `admin@helyxtech.com` must exist in the database (seeded by default)
4. Agent user `agent@helyxtech.com` must exist (seeded by default)

### Running a Single Suite

```bash
# Start server in another terminal
cd server && NODE_ENV=test node index.js

# In another terminal, run any test file
node e2e_test.js
node e2e_test_comprehensive.js
node e2e_master_tests.js
```

### Running All Suites

```bash
bash run-e2e.sh
```

---

## Test Architecture

### HTTP Helper (`req` function)
All three suites implement their own `req(method, path, body, token)` helper that:
- Makes HTTP requests to `http://localhost:3001/api`
- Parses JSON responses
- Supports optional Bearer token auth
- Has a 10-second timeout
- Returns `{ status, body }`

### Assertion Pattern
Each test is an inline call:
```javascript
ok('Test description', condition, optionalDetails)
```
- Passes: logs `  ✓ description`
- Fails: logs `  ✗ description — details`
- Skip: logs `  - description (reason)`

### State Management
Tests create entities during the run and store their IDs (e.g. `testTicketId`, `testGroupId`) for use in subsequent dependent tests. The master test suite has a cleanup phase that deletes all created resources at the end.

### Role Tokens
The comprehensive and master suites authenticate as three roles:
- `adminToken` — `admin@helyxtech.com`
- `agentToken` — `agent@helyxtech.com`
- `customerToken` — dynamically created customer-role user

---

## Output Format

```
╔══════════════════════════════════════════════════════╗
║     Helyx Support — Master E2E Test Suite           ║
╚══════════════════════════════════════════════════════╝
  Run ID: 1716000000000

▶ Auth
  ✓ Dev login as admin → 200
  ✓ Admin login returns token
  ✓ Admin login returns user with role=admin
  ...

▶ Tickets
  ✓ POST /tickets → 201
  ✓ ticket has correct title
  ...

═══════════════════════════════
  Results:  280 passed  |  0 failed  |  5 skipped
═══════════════════════════════
```

---

## Test Coverage Areas

| Area | e2e_test | comprehensive | master |
|---|---|---|---|
| Health endpoint | ✓ | ✓ | ✓ |
| Auth (admin login) | ✓ | ✓ | ✓ |
| Auth (agent login) | — | ✓ | ✓ |
| Auth (customer login) | — | ✓ | ✓ |
| Auth negative cases | ✓ | ✓ | ✓ |
| Unauthenticated access blocked | ✓ | ✓ | ✓ |
| Stats endpoint | ✓ | — | ✓ |
| Settings CRUD | ✓ | — | ✓ |
| Tickets CRUD | ✓ | ✓ | ✓ |
| Ticket comments | ✓ | ✓ | ✓ |
| Ticket filters | ✓ | ✓ | ✓ |
| Customer ticket isolation | — | ✓ | ✓ |
| Ticket tags | — | — | ✓ |
| Ticket activity log | — | — | ✓ |
| Ticket custom fields | ✓ | ✓ | ✓ |
| Groups CRUD | ✓ | ✓ | ✓ |
| Group membership | ✓ | ✓ | ✓ |
| Users CRUD | ✓ | ✓ | ✓ |
| Customers CRUD | ✓ | ✓ | ✓ |
| Contacts CRUD | — | — | ✓ |
| Knowledge Base | ✓ | ✓ | ✓ |
| KB articles | ✓ | — | ✓ |
| Announcements | ✓ | ✓ | ✓ |
| Announcements (public endpoint) | — | — | ✓ |
| Feature requests | ✓ | ✓ | ✓ |
| Feature voting | — | — | ✓ |
| Feature comments | — | — | ✓ |
| SLA policies | ✓ | ✓ | ✓ |
| Automation rules | ✓ | ✓ | ✓ |
| Canned responses | ✓ | ✓ | ✓ |
| Email templates | ✓ | — | ✓ |
| Ticket templates | ✓ | — | ✓ |
| Forum Q&A | ✓ | — | ✓ |
| Deployments | ✓ | — | ✓ |
| Reports | — | ✓ | ✓ |
| Downloads | — | — | ✓ |
| Tag definitions | — | — | ✓ |
| CSAT | — | — | ✓ |
| Admin-only enforcement | — | ✓ | ✓ |
| Staff-only enforcement | — | ✓ | ✓ |
| Customer role isolation | — | ✓ | ✓ |
| Frontend build | — | ✓ | — |

---

## Known Test Limitations

1. **No file upload tests** — multipart file uploads require additional setup (FormData in Node.js) and are not covered in the current suites.
2. **No email delivery tests** — outbound email (Microsoft Graph) is not tested; tests mock by checking that triggers don't throw errors.
3. **No ADO integration tests** — the ADO endpoints require real credentials and cannot be tested in isolation.
4. **No concurrency tests** — the suites run sequentially; race conditions are not tested.
5. **No performance / load tests** — no benchmarking of response times or throughput.
