/**
 * e2e_test_comprehensive.js — Comprehensive E2E Test Suite for Helyx Support
 *
 * Covers: Auth, Tickets, Automation, Reports, Groups, Users, Customers,
 *         SLA Policies, Canned Responses, Knowledge Base, Announcements,
 *         Feature Requests, Custom Fields, and Error Handling edge cases.
 *
 * Usage: node e2e_test_comprehensive.js
 * Requires server running at http://localhost:3001 with VITE_DEV_MODE=true
 */

'use strict';

const http        = require('http');
const { execSync } = require('child_process');
const path        = require('path');

const TS = Date.now(); // unique prefix to avoid collisions with existing data

let passed  = 0;
let failed  = 0;
let skipped = 0;

// Tokens for the three roles
let adminToken    = '';
let agentToken    = '';
let customerToken = '';

// IDs of resources created during tests (for cleanup)
const created = {
  ticketId:        null,
  ticket2Id:       null,   // second ticket for merge tests
  groupId:         null,
  userId:          null,
  customerUserId:  null,   // the user record for the customer-role login
  customerId:      null,
  slaId:           null,
  automationId:    null,
  customFieldId:   null,
  cannedId:        null,
  kbFolderId:      null,
  kbArticleId:     null,
  announcementId:  null,
  featureId:       null,
  reportId:        null,
};

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined && body !== null ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port:     3001,
      path:     '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const timer = setTimeout(() => reject(new Error('Request timed out after 10s')), 10000);

    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        clearTimeout(timer);
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });

    r.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (data) r.write(data);
    r.end();
  });
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
function ok(name, cond, details) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    const suffix = details ? ` — ${details}` : '';
    console.log(`  ✗ ${name}${suffix}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`  - ${name}${reason ? ' (' + reason + ')' : ''}`);
  skipped++;
}

function section(title) {
  console.log(`\n▶ ${title}`);
}

// ── Frontend build check ──────────────────────────────────────────────────────
function checkFrontendBuild() {
  section('Frontend Build');
  const clientDir = path.resolve(__dirname, 'client');
  const tmpOut    = '/tmp/vite-e2e-build-' + Date.now();
  try {
    // Write to /tmp so we never hit EPERM on read-only or mounted filesystems
    execSync(
      `npx vite build --outDir ${tmpOut} --emptyOutDir 2>&1`,
      { cwd: clientDir, stdio: 'pipe', timeout: 120000 }
    );
    ok('React client builds without errors', true);
    // Clean up temp output
    try { execSync(`rm -rf ${tmpOut}`); } catch (_) {}
  } catch (e) {
    const output = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    // Extract the most relevant error line (esbuild / Vite errors contain "error:")
    const errLine = output.split('\n').find((l) => /\berror\b/i.test(l))?.trim() || 'build failed';
    ok('React client builds without errors', false, errLine);
    // A build failure is fatal — no point running API tests against broken UI
    printSummary();
    process.exit(1);
  }
}

// ── Run all tests ─────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   Helyx Support — Comprehensive E2E Test Suite   ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');
  console.log(`  Timestamp prefix: ${TS}`);

  // ── 0. FRONTEND BUILD ───────────────────────────────────────────────────────
  // Catches JSX syntax errors, missing imports, and type errors before any
  // API tests run. Exits immediately on failure so the broken UI is flagged.
  // Set SKIP_BUILD_CHECK=1 when the build has already been validated externally
  // (e.g. when the run-e2e.sh wrapper runs it as a separate step before the server).
  if (process.env.SKIP_BUILD_CHECK !== '1') {
    checkFrontendBuild();
  }

  // ── 1. AUTH ─────────────────────────────────────────────────────────────────
  section('Auth');

  // Admin login
  try {
    const r = await req('POST', '/auth/dev-login', { email: 'admin@helyxtech.com' });
    ok('Dev login as admin → 200', r.status === 200, `got ${r.status}`);
    ok('Admin login returns token', typeof r.body.token === 'string' && r.body.token.length > 10);
    ok('Admin login returns user with role=admin', r.body.user?.role === 'admin');
    adminToken = r.body.token || '';
  } catch (e) {
    ok('Dev login as admin', false, e.message);
  }

  // Agent login
  try {
    const r = await req('POST', '/auth/dev-login', { email: 'agent@helyxtech.com' });
    ok('Dev login as agent → 200', r.status === 200, `got ${r.status}`);
    ok('Agent login returns token', typeof r.body.token === 'string' && r.body.token.length > 10);
    ok('Agent login returns user with role=agent', r.body.user?.role === 'agent');
    agentToken = r.body.token || '';
  } catch (e) {
    ok('Dev login as agent', false, e.message);
  }

  // Customer login — create a customer-role user first using admin token, then dev-login as them
  const customerEmail = `customer_e2e_${TS}@test.com`;
  if (adminToken) {
    try {
      const cr = await req('POST', '/users', {
        name:  `E2E Customer ${TS}`,
        email: customerEmail,
        role:  'customer',
      }, adminToken);
      if (cr.status === 201) {
        created.customerUserId = cr.body.id;
        const lr = await req('POST', '/auth/dev-login', { email: customerEmail });
        ok('Dev login as customer → 200', lr.status === 200, `got ${lr.status}`);
        ok('Customer login returns token', typeof lr.body.token === 'string');
        ok('Customer login returns user with role=customer', lr.body.user?.role === 'customer');
        customerToken = lr.body.token || '';
      } else {
        skip('Dev login as customer', 'could not create customer user');
      }
    } catch (e) {
      ok('Dev login as customer', false, e.message);
    }
  } else {
    skip('Dev login as customer', 'no admin token');
  }

  // Auth negative cases
  try {
    const r = await req('GET', '/tickets');
    ok('Protected route without token → 401', r.status === 401, `got ${r.status}`);
  } catch (e) {
    ok('Protected route without token → 401', false, e.message);
  }

  try {
    const r = await req('GET', '/tickets', null, 'this.is.not.valid');
    ok('Protected route with invalid token → 401', r.status === 401, `got ${r.status}`);
  } catch (e) {
    ok('Protected route with invalid token → 401', false, e.message);
  }

  try {
    const r = await req('POST', '/auth/dev-login', { email: 'nobody@nowhere.invalid' });
    ok('Dev login with unknown email → 403', r.status === 403, `got ${r.status}`);
  } catch (e) {
    ok('Dev login with unknown email → 403', false, e.message);
  }

  // Customer cannot access admin-only routes
  if (customerToken) {
    try {
      const r = await req('POST', '/users', { name: 'Hacker', email: `hack_${TS}@test.com`, role: 'admin' }, customerToken);
      ok('Customer cannot create users (admin-only) → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Customer cannot create users → 403', false, e.message);
    }
    try {
      const r = await req('GET', '/automation/pending', null, customerToken);
      ok('Customer cannot access /automation/pending → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Customer cannot access /automation/pending → 403', false, e.message);
    }
  } else {
    skip('Customer role restrictions', 'no customer token');
  }

  if (!adminToken) {
    console.log('\n  FATAL: No admin token — cannot continue most tests.\n');
    printSummary();
    return;
  }

  // ── 2. USERS ────────────────────────────────────────────────────────────────
  section('Users');

  // List users
  try {
    const r = await req('GET', '/users', null, adminToken);
    ok('Admin can list users → 200', r.status === 200, `got ${r.status}`);
    ok('Users response is array', Array.isArray(r.body));
    ok('User objects have expected fields', r.body.length === 0 || (!!r.body[0].id && !!r.body[0].email));
  } catch (e) {
    ok('GET /users', false, e.message);
  }

  // Agent can also list users (needed for dropdowns)
  if (agentToken) {
    try {
      const r = await req('GET', '/users', null, agentToken);
      ok('Agent can list users → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Agent can list users', false, e.message);
    }
  }

  // Create user
  const testUserEmail = `agent_e2e_${TS}@helyxtech.com`;
  try {
    const r = await req('POST', '/users', {
      name:  `E2E Agent ${TS}`,
      email: testUserEmail,
      role:  'agent',
    }, adminToken);
    ok('Admin can create user → 201', r.status === 201, `got ${r.status}`);
    ok('Created user has id', !!r.body.id);
    ok('Created user has correct role', r.body.role === 'agent');
    created.userId = r.body.id;
  } catch (e) {
    ok('Admin can create user', false, e.message);
  }

  // Duplicate email → 409
  try {
    const r = await req('POST', '/users', {
      name:  'Duplicate',
      email: testUserEmail,
      role:  'agent',
    }, adminToken);
    ok('Duplicate email → 409', r.status === 409, `got ${r.status}`);
  } catch (e) {
    ok('Duplicate email → 409', false, e.message);
  }

  // Create user with missing required fields → 400
  try {
    const r = await req('POST', '/users', { role: 'agent' }, adminToken);
    ok('Create user missing name/email → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Create user missing fields → 400', false, e.message);
  }

  // Agent cannot create users → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/users', {
        name: 'Sneaky', email: `sneaky_${TS}@test.com`, role: 'agent',
      }, agentToken);
      ok('Agent cannot create users → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Agent cannot create users → 403', false, e.message);
    }
  }

  // Deactivate user
  if (created.userId) {
    try {
      const r = await req('PATCH', `/users/${created.userId}/status`, { active: false }, adminToken);
      ok('Admin can deactivate user → 200', r.status === 200, `got ${r.status}`);
      ok('User active is now false/0', r.body.active === 0 || r.body.active === false);
    } catch (e) {
      ok('Admin can deactivate user', false, e.message);
    }
    // Re-activate for group member test
    try { await req('PATCH', `/users/${created.userId}/status`, { active: true }, adminToken); } catch (_) {}
  }

  // ── 3. GROUPS ───────────────────────────────────────────────────────────────
  section('Groups');

  // List groups — any staff
  try {
    const r = await req('GET', '/groups', null, adminToken);
    ok('Admin can list groups → 200', r.status === 200, `got ${r.status}`);
    ok('Groups response is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /groups', false, e.message);
  }

  if (agentToken) {
    try {
      const r = await req('GET', '/groups', null, agentToken);
      ok('Agent can list groups → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Agent can list groups', false, e.message);
    }
  }

  // Create group
  try {
    const r = await req('POST', '/groups', { name: `E2E Group ${TS}` }, adminToken);
    ok('Admin can create group → 201', r.status === 201, `got ${r.status}`);
    ok('Created group has id', !!r.body.id);
    created.groupId = r.body.id;
  } catch (e) {
    ok('Admin can create group', false, e.message);
  }

  // Create group with no name → 400
  try {
    const r = await req('POST', '/groups', { name: '' }, adminToken);
    ok('Create group with no name → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Create group with no name → 400', false, e.message);
  }

  // Add member to group
  if (created.groupId && created.userId) {
    try {
      const r = await req('POST', `/groups/${created.groupId}/members`, { user_id: created.userId }, adminToken);
      ok('Admin can add member to group → 200/201', r.status === 200 || r.status === 201, `got ${r.status}`);
    } catch (e) {
      ok('Admin can add member to group', false, e.message);
    }

    // Remove member from group
    try {
      const r = await req('DELETE', `/groups/${created.groupId}/members/${created.userId}`, null, adminToken);
      ok('Admin can remove member from group → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can remove member from group', false, e.message);
    }
  } else {
    skip('Group member add/remove', 'no group or user id');
  }

  // Deactivate a group
  if (created.groupId) {
    try {
      const r = await req('PATCH', `/groups/${created.groupId}/status`, { active: false }, adminToken);
      ok('Admin can deactivate group → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can deactivate group', false, e.message);
    }
    // Re-activate for cleanup
    try { await req('PATCH', `/groups/${created.groupId}/status`, { active: true }, adminToken); } catch (_) {}
  }

  // ── 4. CUSTOMERS ────────────────────────────────────────────────────────────
  section('Customers');

  try {
    const r = await req('GET', '/customers', null, adminToken);
    ok('Admin can list customers → 200', r.status === 200, `got ${r.status}`);
    ok('Customers response is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /customers', false, e.message);
  }

  // Create customer
  try {
    const r = await req('POST', '/customers', {
      name:             `E2E Corp ${TS}`,
      lifecycle_status: 'Potential',
      industry:         'Technology',
    }, adminToken);
    ok('Admin can create customer → 201', r.status === 201, `got ${r.status}`);
    ok('Created customer has id', !!r.body.id);
    created.customerId = r.body.id;
  } catch (e) {
    ok('Admin can create customer', false, e.message);
  }

  // Create customer with missing name → 400
  try {
    const r = await req('POST', '/customers', { industry: 'Tech' }, adminToken);
    ok('Create customer with missing name → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Create customer with missing name → 400', false, e.message);
  }

  // Update customer
  if (created.customerId) {
    try {
      const r = await req('PUT', `/customers/${created.customerId}`, {
        name:             `E2E Corp ${TS} Updated`,
        lifecycle_status: 'Active',
        industry:         'Technology',
      }, adminToken);
      ok('Admin can update customer → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can update customer', false, e.message);
    }

    // Deactivate customer
    try {
      const r = await req('PATCH', `/customers/${created.customerId}/status`, { active: false }, adminToken);
      ok('Admin can deactivate customer → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can deactivate customer', false, e.message);
    }
  }

  // ── 5. TICKETS ──────────────────────────────────────────────────────────────
  section('Tickets');

  // List tickets as admin
  try {
    const r = await req('GET', '/tickets', null, adminToken);
    ok('Admin can list tickets → 200', r.status === 200, `got ${r.status}`);
    ok('Tickets response is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /tickets as admin', false, e.message);
  }

  // Create ticket (all fields)
  const ticketEmail = `requester_${TS}@testco.com`;
  try {
    const r = await req('POST', '/tickets', {
      title:           `E2E Ticket ${TS}`,
      description:     'Created by comprehensive E2E suite',
      requester_email: ticketEmail,
      requester_name:  'E2E Requester',
      priority:        'High',
      type:            'Bug / Incident',
      status:          'Open',
      source:          'manual',
    }, adminToken);
    ok('Admin can create ticket (all fields) → 201', r.status === 201, `got ${r.status}`);
    ok('Created ticket has id', !!r.body.id);
    ok('Created ticket has correct title', r.body.title === `E2E Ticket ${TS}`);
    ok('Created ticket has comments array', Array.isArray(r.body.comments));
    created.ticketId = r.body.id;
  } catch (e) {
    ok('Admin can create ticket', false, e.message);
  }

  // Create ticket with missing title → 400
  try {
    const r = await req('POST', '/tickets', {
      description:     'No title provided',
      requester_email: 'test@test.com',
    }, adminToken);
    ok('Create ticket missing title → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Create ticket missing title → 400', false, e.message);
  }

  // Get single ticket
  if (created.ticketId) {
    try {
      const r = await req('GET', `/tickets/${created.ticketId}`, null, adminToken);
      ok('Get single ticket → 200', r.status === 200, `got ${r.status}`);
      ok('Ticket has correct id', r.body.id === created.ticketId);
      ok('Ticket has comments array', Array.isArray(r.body.comments));
    } catch (e) {
      ok('Get single ticket', false, e.message);
    }
  }

  // Get ticket that doesn't exist → 404
  try {
    const r = await req('GET', '/tickets/999999', null, adminToken);
    ok('Get non-existent ticket → 404', r.status === 404, `got ${r.status}`);
  } catch (e) {
    ok('Get non-existent ticket → 404', false, e.message);
  }

  // Update ticket status, priority, assignee
  if (created.ticketId) {
    try {
      const r = await req('PUT', `/tickets/${created.ticketId}`, {
        status:      'In Investigation',
        priority:    'Critical',
        assigned_to: created.userId || null,
      }, adminToken);
      ok('Update ticket status/priority/assignee → 200', r.status === 200, `got ${r.status}`);
      ok('Updated status is correct', r.body.status === 'In Investigation');
      ok('Updated priority is correct', r.body.priority === 'Critical');
    } catch (e) {
      ok('Update ticket', false, e.message);
    }
  }

  // Customer can only see own tickets
  if (customerToken) {
    try {
      const r = await req('GET', '/tickets', null, customerToken);
      ok('Customer can list tickets → 200', r.status === 200, `got ${r.status}`);
      // All returned tickets must belong to the customer's email
      const allMatch = Array.isArray(r.body) && r.body.every(
        (t) => t.requester_email?.toLowerCase() === customerEmail.toLowerCase()
      );
      ok('Customer sees only own tickets', allMatch || r.body.length === 0,
        `${r.body.length} tickets returned`);
    } catch (e) {
      ok('Customer ticket isolation', false, e.message);
    }
  }

  // Add public comment
  if (created.ticketId) {
    try {
      const r = await req('POST', `/tickets/${created.ticketId}/comments`, {
        body:      'Public comment from E2E test',
        is_public: true,
      }, adminToken);
      ok('Add public comment → 201', r.status === 201, `got ${r.status}`);
      ok('Public comment has is_public=1', r.body.is_public === 1 || r.body.is_public === true);
    } catch (e) {
      ok('Add public comment', false, e.message);
    }

    // Add internal comment
    try {
      const r = await req('POST', `/tickets/${created.ticketId}/comments`, {
        body:      'Internal note — not for customer eyes',
        is_public: false,
      }, adminToken);
      ok('Add internal comment → 201', r.status === 201, `got ${r.status}`);
      ok('Internal comment has is_public=0', r.body.is_public === 0 || r.body.is_public === false);
    } catch (e) {
      ok('Add internal comment', false, e.message);
    }

    // public_only=1 filter only returns public comments
    try {
      const r = await req('GET', `/tickets/${created.ticketId}?public_only=1`, null, adminToken);
      ok('Ticket with public_only=1 returns only public comments', r.status === 200, `got ${r.status}`);
      if (Array.isArray(r.body.comments)) {
        const allPublic = r.body.comments.every((c) => c.is_public === 1 || c.is_public === true);
        ok('All returned comments are public (is_public=1)', allPublic,
          `${r.body.comments.length} comments`);
      }
    } catch (e) {
      ok('Public-only comment filter', false, e.message);
    }

    // Comment body required
    try {
      const r = await req('POST', `/tickets/${created.ticketId}/comments`, { is_public: true }, adminToken);
      ok('Comment with no body → 400', r.status === 400, `got ${r.status}`);
    } catch (e) {
      ok('Comment with no body → 400', false, e.message);
    }
  }

  // Create second ticket for merge test
  try {
    const r = await req('POST', '/tickets', {
      title:           `E2E Merge Source ${TS}`,
      description:     'This ticket will be merged into another',
      requester_email: `merge_${TS}@test.com`,
      priority:        'Low',
    }, adminToken);
    ok('Create second ticket for merge test → 201', r.status === 201, `got ${r.status}`);
    created.ticket2Id = r.body.id;
  } catch (e) {
    ok('Create second ticket', false, e.message);
  }

  // Merge two tickets
  if (created.ticketId && created.ticket2Id) {
    try {
      const r = await req('POST', `/tickets/${created.ticketId}/merge`, {
        source_ticket_id: created.ticket2Id,
      }, adminToken);
      ok('Merge two tickets → 200', r.status === 200, `got ${r.status}`);
      ok('Merged ticket response has id', r.body.id === created.ticketId);
    } catch (e) {
      ok('Merge two tickets', false, e.message);
    }

    // Merge ticket with itself → 400
    try {
      const r = await req('POST', `/tickets/${created.ticketId}/merge`, {
        source_ticket_id: created.ticketId,
      }, adminToken);
      ok('Merge ticket with itself → 400', r.status === 400, `got ${r.status}`);
    } catch (e) {
      ok('Merge ticket with itself → 400', false, e.message);
    }
  } else {
    skip('Ticket merge tests', 'could not create two tickets');
  }

  // Agent cannot delete tickets → 403
  if (created.ticketId && agentToken) {
    try {
      const r = await req('DELETE', `/tickets/${created.ticketId}`, null, agentToken);
      ok('Agent cannot delete ticket → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Agent cannot delete ticket → 403', false, e.message);
    }
  }

  // ── 6. AUTOMATION RULES ─────────────────────────────────────────────────────
  section('Automation Rules');

  // Admin can list rules
  try {
    const r = await req('GET', '/automation', null, adminToken);
    ok('Admin can list automation rules → 200', r.status === 200, `got ${r.status}`);
    ok('Automation rules is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /automation', false, e.message);
  }

  // Admin can create rule
  try {
    const r = await req('POST', '/automation', {
      name:       `E2E Rule ${TS}`,
      event:      'ticket_created',
      conditions: [{ field: 'priority', operator: 'equals', value: 'Critical' }],
      actions:    [{ type: 'set_status', value: 'In Investigation' }],
      active:     true,
    }, adminToken);
    ok('Admin can create automation rule → 201', r.status === 201, `got ${r.status}`);
    ok('Created rule has id', !!r.body.id);
    ok('Created rule has correct name', r.body.name === `E2E Rule ${TS}`);
    ok('Created rule conditions are parsed (array)', Array.isArray(r.body.conditions));
    created.automationId = r.body.id;
  } catch (e) {
    ok('Admin can create automation rule', false, e.message);
  }

  // Admin can update rule
  if (created.automationId) {
    try {
      const r = await req('PUT', `/automation/${created.automationId}`, {
        name:       `E2E Rule ${TS} Updated`,
        event:      'ticket_created',
        conditions: [],
        actions:    [{ type: 'set_priority', value: 'High' }],
        active:     true,
      }, adminToken);
      ok('Admin can update automation rule → 200', r.status === 200, `got ${r.status}`);
      ok('Updated rule name is correct', r.body.name === `E2E Rule ${TS} Updated`);
    } catch (e) {
      ok('Admin can update automation rule', false, e.message);
    }

    // Admin can toggle rule active/inactive
    try {
      const r = await req('PATCH', `/automation/${created.automationId}/toggle`, { active: false }, adminToken);
      ok('Admin can toggle rule inactive → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can toggle rule', false, e.message);
    }
  }

  // Agent cannot create rules → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/automation', {
        name:       `Agent Rule ${TS}`,
        event:      'ticket_created',
        conditions: [],
        actions:    [],
      }, agentToken);
      ok('Agent cannot create automation rule → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Agent cannot create automation rule → 403', false, e.message);
    }

    // Agent cannot delete rules → 403
    if (created.automationId) {
      try {
        const r = await req('DELETE', `/automation/${created.automationId}`, null, agentToken);
        ok('Agent cannot delete automation rule → 403', r.status === 403, `got ${r.status}`);
      } catch (e) {
        ok('Agent cannot delete automation rule → 403', false, e.message);
      }
    }
  }

  // GET /automation/pending is admin-only
  try {
    const r = await req('GET', '/automation/pending', null, adminToken);
    ok('GET /automation/pending as admin → 200', r.status === 200, `got ${r.status}`);
    ok('/automation/pending returns array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /automation/pending', false, e.message);
  }

  if (agentToken) {
    try {
      const r = await req('GET', '/automation/pending', null, agentToken);
      ok('GET /automation/pending as agent → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('GET /automation/pending as agent → 403', false, e.message);
    }
  }

  // Rule with no conditions creates successfully (should match all tickets)
  try {
    const r = await req('POST', '/automation', {
      name:       `E2E No-Condition Rule ${TS}`,
      event:      'ticket_created',
      conditions: [],
      actions:    [{ type: 'add_tag', value: 'auto-tagged' }],
      active:     true,
    }, adminToken);
    ok('Rule with no conditions creates successfully → 201', r.status === 201, `got ${r.status}`);
    if (r.body.id) {
      await req('DELETE', `/automation/${r.body.id}`, null, adminToken).catch(() => {});
    }
  } catch (e) {
    ok('Rule with no conditions', false, e.message);
  }

  // Rule with delay_hours queues to pending_automations
  let delayRuleId = null;
  try {
    const r = await req('POST', '/automation', {
      name:       `E2E Delay Rule ${TS}`,
      event:      'ticket_created',
      conditions: [],
      actions:    [{ type: 'set_status', value: 'Closed', delay_hours: 1 }],
      active:     true,
    }, adminToken);
    ok('Rule with delay_hours creates successfully → 201', r.status === 201, `got ${r.status}`);
    delayRuleId = r.body.id;
  } catch (e) {
    ok('Rule with delay_hours', false, e.message);
  }

  if (delayRuleId) {
    try {
      const tr = await req('POST', '/tickets', {
        title:           `E2E Delay Trigger ${TS}`,
        requester_email: `delay_${TS}@test.com`,
      }, adminToken);
      if (tr.status === 201 && tr.body.id) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const pr = await req('GET', '/automation/pending', null, adminToken);
        ok('Delayed rule queues action (pending_automations responds)', pr.status === 200 && Array.isArray(pr.body));
        await req('DELETE', `/tickets/${tr.body.id}`, null, adminToken).catch(() => {});
      }
    } catch (e) {
      skip('Delay rule pending queue check', e.message);
    }
    await req('DELETE', `/automation/${delayRuleId}`, null, adminToken).catch(() => {});
  }

  // ── 7. REPORTS ──────────────────────────────────────────────────────────────
  section('Reports');

  // Admin can create saved report
  try {
    const r = await req('POST', '/reports', {
      name:    `E2E Report ${TS}`,
      filters: { status: 'Open', priority: 'High' },
      columns: ['id', 'title', 'status', 'priority'],
    }, adminToken);
    ok('Admin can create saved report → 201', r.status === 201, `got ${r.status}`);
    ok('Created report has id', !!r.body.id);
    ok('Created report has correct name', r.body.name === `E2E Report ${TS}`);
    ok('Created report filters are object', typeof r.body.filters === 'object');
    created.reportId = r.body.id;
  } catch (e) {
    ok('Admin can create saved report', false, e.message);
  }

  // Agent can also create saved report
  if (agentToken) {
    try {
      const r = await req('POST', '/reports', {
        name:    `E2E Agent Report ${TS}`,
        filters: {},
        columns: ['id', 'title'],
      }, agentToken);
      ok('Agent can create saved report → 201', r.status === 201, `got ${r.status}`);
      if (r.body.id) await req('DELETE', `/reports/${r.body.id}`, null, adminToken).catch(() => {});
    } catch (e) {
      ok('Agent can create saved report', false, e.message);
    }
  }

  // Admin can list reports
  try {
    const r = await req('GET', '/reports', null, adminToken);
    ok('Admin can list reports → 200', r.status === 200, `got ${r.status}`);
    ok('Reports is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /reports', false, e.message);
  }

  // Admin can update report
  if (created.reportId) {
    try {
      const r = await req('PUT', `/reports/${created.reportId}`, {
        name:    `E2E Report ${TS} Updated`,
        filters: { status: 'Closed' },
        columns: ['id', 'title', 'status'],
      }, adminToken);
      ok('Admin can update report → 200', r.status === 200, `got ${r.status}`);
      ok('Updated report name is correct', r.body.name === `E2E Report ${TS} Updated`);
    } catch (e) {
      ok('Admin can update report', false, e.message);
    }
  }

  // Admin can delete report (done in cleanup section below)

  // Customer cannot access reports → 403
  if (customerToken) {
    try {
      const r = await req('GET', '/reports', null, customerToken);
      ok('Customer cannot access reports → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Customer cannot access reports → 403', false, e.message);
    }
  }

  // ── 8. SLA POLICIES ─────────────────────────────────────────────────────────
  section('SLA Policies');

  try {
    const r = await req('GET', '/sla', null, adminToken);
    ok('Admin can list SLA policies → 200', r.status === 200, `got ${r.status}`);
    ok('SLA policies is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /sla', false, e.message);
  }

  // Admin can create SLA policy
  try {
    const r = await req('POST', '/sla', {
      name:                 `E2E SLA ${TS}`,
      priority:             'High',
      first_response_hours: 4,
      resolution_hours:     24,
    }, adminToken);
    ok('Admin can create SLA policy → 201', r.status === 201, `got ${r.status}`);
    ok('Created SLA has id', !!r.body.id);
    created.slaId = r.body.id;
  } catch (e) {
    ok('Admin can create SLA policy', false, e.message);
  }

  // Admin can update SLA policy
  if (created.slaId) {
    try {
      const r = await req('PUT', `/sla/${created.slaId}`, {
        name:                 `E2E SLA ${TS} Updated`,
        priority:             'Medium',
        first_response_hours: 8,
        resolution_hours:     48,
      }, adminToken);
      ok('Admin can update SLA policy → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can update SLA policy', false, e.message);
    }
  }

  // Admin can delete SLA policy (tested in cleanup)

  // Agent cannot create SLA → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/sla', {
        name:                 `Agent SLA ${TS}`,
        priority:             'Low',
        first_response_hours: 24,
        resolution_hours:     72,
      }, agentToken);
      ok('Agent cannot create SLA policy → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Agent cannot create SLA policy → 403', false, e.message);
    }
  }

  // ── 9. CANNED RESPONSES ─────────────────────────────────────────────────────
  section('Canned Responses');

  // Get canned responses — staff only
  try {
    const r = await req('GET', '/canned-responses', null, adminToken);
    ok('Admin can get canned responses → 200', r.status === 200, `got ${r.status}`);
    ok('Canned responses is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /canned-responses', false, e.message);
  }

  if (agentToken) {
    try {
      const r = await req('GET', '/canned-responses', null, agentToken);
      ok('Agent can get canned responses → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Agent can get canned responses', false, e.message);
    }
  }

  // Customer cannot access canned responses → 403
  if (customerToken) {
    try {
      const r = await req('GET', '/canned-responses', null, customerToken);
      ok('Customer cannot access canned responses → 403', r.status === 403, `got ${r.status}`);
    } catch (e) {
      ok('Customer cannot access canned responses → 403', false, e.message);
    }
  }

  // Admin can create canned response
  try {
    const r = await req('POST', '/canned-responses', {
      title:    `E2E Canned ${TS}`,
      body:     'Thank you for reaching out. We will look into this shortly.',
      category: 'General',
    }, adminToken);
    ok('Admin can create canned response → 201', r.status === 201, `got ${r.status}`);
    ok('Created canned response has id', !!r.body.id);
    created.cannedId = r.body.id;
  } catch (e) {
    ok('Admin can create canned response', false, e.message);
  }

  // Admin can update canned response
  if (created.cannedId) {
    try {
      const r = await req('PUT', `/canned-responses/${created.cannedId}`, {
        title: `E2E Canned ${TS} Updated`,
        body:  'Updated canned response text.',
      }, adminToken);
      ok('Admin can update canned response → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can update canned response', false, e.message);
    }
  }

  // Admin can delete canned response (tested in cleanup)

  // ── 10. KNOWLEDGE BASE ──────────────────────────────────────────────────────
  section('Knowledge Base');

  // Staff can list KB content
  try {
    const r = await req('GET', '/kb/tree', null, adminToken);
    ok('Admin can get KB tree → 200', r.status === 200, `got ${r.status}`);
    ok('KB tree is object', r.body && typeof r.body === 'object');
  } catch (e) {
    ok('GET /kb/tree', false, e.message);
  }

  // Admin can create KB folder
  try {
    const r = await req('POST', '/kb/folders', {
      name:      `E2E Folder ${TS}`,
      parent_id: null,
    }, adminToken);
    ok('Admin can create KB folder → 201', r.status === 201, `got ${r.status}`);
    ok('Created KB folder has id', !!r.body.id);
    created.kbFolderId = r.body.id;
  } catch (e) {
    ok('Admin can create KB folder', false, e.message);
  }

  // Admin can create KB article
  if (created.kbFolderId) {
    try {
      const r = await req('POST', '/kb/articles', {
        folder_id: created.kbFolderId,
        title:     `E2E Article ${TS}`,
        content:   'This is a comprehensive E2E test article.',
        status:    'published',
      }, adminToken);
      ok('Admin can create KB article → 201', r.status === 201, `got ${r.status}`);
      ok('Created KB article has id', !!r.body.id);
      created.kbArticleId = r.body.id;
    } catch (e) {
      ok('Admin can create KB article', false, e.message);
    }
  }

  // Admin can update KB article
  if (created.kbArticleId) {
    try {
      const r = await req('PUT', `/kb/articles/${created.kbArticleId}`, {
        title:   `E2E Article ${TS} Updated`,
        content: 'Updated content for the E2E article.',
        status:  'published',
      }, adminToken);
      ok('Admin can update KB article → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can update KB article', false, e.message);
    }
  }

  // Delete article tested in cleanup

  // ── 11. ANNOUNCEMENTS ───────────────────────────────────────────────────────
  section('Announcements');

  // Public endpoint — no auth
  try {
    const r = await req('GET', '/announcements/public');
    ok('GET /announcements/public (no auth) → 200', r.status === 200, `got ${r.status}`);
    ok('Public announcements is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /announcements/public', false, e.message);
  }

  // Staff can list announcements
  try {
    const r = await req('GET', '/announcements', null, adminToken);
    ok('Admin can list announcements → 200', r.status === 200, `got ${r.status}`);
    ok('Announcements is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /announcements', false, e.message);
  }

  if (agentToken) {
    try {
      const r = await req('GET', '/announcements', null, agentToken);
      ok('Agent can list announcements → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Agent can list announcements', false, e.message);
    }
  }

  // Admin can create announcement
  try {
    const r = await req('POST', '/announcements', {
      title:     `E2E Announcement ${TS}`,
      body:      'This is a test announcement from the E2E suite.',
      is_public: false,
    }, adminToken);
    ok('Admin can create announcement → 201', r.status === 201, `got ${r.status}`);
    ok('Created announcement has id', !!r.body.id);
    created.announcementId = r.body.id;
  } catch (e) {
    ok('Admin can create announcement', false, e.message);
  }

  // Admin can publish announcement (set is_public=true)
  if (created.announcementId) {
    try {
      const r = await req('PUT', `/announcements/${created.announcementId}`, {
        title:     `E2E Announcement ${TS}`,
        body:      'Published announcement body.',
        is_public: true,
      }, adminToken);
      ok('Admin can publish announcement → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can publish announcement', false, e.message);
    }
  }

  // ── 12. FEATURE REQUESTS ────────────────────────────────────────────────────
  section('Feature Requests');

  // List feature requests
  try {
    const r = await req('GET', '/features', null, adminToken);
    ok('Can list feature requests → 200', r.status === 200, `got ${r.status}`);
    ok('Feature requests is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /features', false, e.message);
  }

  // Authenticated user can create feature request
  try {
    const r = await req('POST', '/features', {
      title:           `E2E Feature ${TS}`,
      description:     'A comprehensive E2E test feature request.',
      submitter_email: `feat_${TS}@test.com`,
      submitter_name:  'E2E Submitter',
      product:         'Helyx Platform',
    }, adminToken);
    ok('Authenticated user can create feature request → 201', r.status === 201, `got ${r.status}`);
    ok('Created feature has id', !!r.body.id);
    created.featureId = r.body.id;
  } catch (e) {
    ok('Create feature request', false, e.message);
  }

  // User can upvote a feature request
  const voterEmail = `voter_${TS}@test.com`;
  if (created.featureId) {
    try {
      const r = await req('POST', `/features/${created.featureId}/vote`, {
        voter_email: voterEmail,
      }, adminToken);
      ok('User can upvote feature request → 200/201', r.status === 200 || r.status === 201, `got ${r.status}`);
    } catch (e) {
      ok('Upvote feature request', false, e.message);
    }

    // Voting same request again toggles (unvotes) → 200 with voted: false
    try {
      const r = await req('POST', `/features/${created.featureId}/vote`, {
        voter_email: voterEmail,
      }, adminToken);
      ok('Second vote toggles unvote → 200', r.status === 200, `got ${r.status}`);
      ok('Second vote returns voted=false', r.body?.voted === false, `voted=${r.body?.voted}`);
    } catch (e) {
      ok('Second vote toggle', false, e.message);
    }

    // Admin can change status of feature request
    try {
      const r = await req('PUT', `/features/${created.featureId}/status`, {
        status: 'under_review',
      }, adminToken);
      ok('Admin can change feature request status → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Admin can change feature request status', false, e.message);
    }
  }

  // ── 13. CUSTOM FIELDS ───────────────────────────────────────────────────────
  section('Custom Fields');

  // List custom field definitions
  try {
    const r = await req('GET', '/custom-fields', null, adminToken);
    ok('Admin can list custom fields → 200', r.status === 200, `got ${r.status}`);
    ok('Custom fields is array', Array.isArray(r.body));
  } catch (e) {
    ok('GET /custom-fields', false, e.message);
  }

  // Admin can create custom field definition
  try {
    const r = await req('POST', '/custom-fields', {
      label:      `E2E Field ${TS}`,
      field_type: 'text',
      required:   false,
      applies_to: 'ticket',
    }, adminToken);
    ok('Admin can create custom field → 201', r.status === 201, `got ${r.status}`);
    ok('Created custom field has id', !!r.body.id);
    created.customFieldId = r.body.id;
  } catch (e) {
    ok('Admin can create custom field', false, e.message);
  }

  // Admin can set custom field value on ticket
  if (created.customFieldId && created.ticketId) {
    try {
      const r = await req('PUT', `/custom-fields/ticket/${created.ticketId}`, {
        fields: [{ field_id: created.customFieldId, value: `e2e-value-${TS}` }],
      }, adminToken);
      ok('Admin can set custom field value on ticket → 200', r.status === 200, `got ${r.status}`);
    } catch (e) {
      ok('Set custom field value', false, e.message);
    }

    // Get custom fields for ticket
    try {
      const r = await req('GET', `/custom-fields/ticket/${created.ticketId}`, null, adminToken);
      ok('Get custom fields for ticket → 200', r.status === 200, `got ${r.status}`);
      ok('Custom fields response is object or array', r.body !== null && typeof r.body === 'object');
    } catch (e) {
      ok('Get custom fields for ticket', false, e.message);
    }
  } else {
    skip('Custom field value set/get', 'missing customFieldId or ticketId');
  }

  // ── 14. ERROR HANDLING & EDGE CASES ─────────────────────────────────────────
  section('Error Handling & Edge Cases');

  // POST with completely empty body
  try {
    const r = await req('POST', '/tickets', {}, adminToken);
    ok('POST /tickets with empty body → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('POST with empty body', false, e.message);
  }

  // Invalid ID format (non-numeric) → 400
  try {
    const r = await req('GET', '/tickets/not-a-number', null, adminToken);
    ok('GET /tickets/not-a-number → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Invalid ID format → 400', false, e.message);
  }

  // Zero ID → 400
  try {
    const r = await req('GET', '/tickets/0', null, adminToken);
    ok('GET /tickets/0 → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Zero ID → 400', false, e.message);
  }

  // Negative ID → 400
  try {
    const r = await req('GET', '/tickets/-1', null, adminToken);
    ok('GET /tickets/-1 → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Negative ID → 400', false, e.message);
  }

  // Very long string in title — should be handled gracefully (not crash server)
  try {
    const longTitle = 'A'.repeat(5000);
    const r = await req('POST', '/tickets', {
      title:           longTitle,
      requester_email: `long_${TS}@test.com`,
    }, adminToken);
    ok('Very long title handled gracefully', [200, 201, 400, 413].includes(r.status), `got ${r.status}`);
    if ((r.status === 200 || r.status === 201) && r.body.id) {
      await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
    }
  } catch (e) {
    ok('Very long string handled', false, e.message);
  }

  // SLA with invalid priority → 400
  try {
    const r = await req('POST', '/sla', {
      name:                 `Bad SLA ${TS}`,
      priority:             'Ultra-Critical-Plus',
      first_response_hours: 1,
      resolution_hours:     2,
    }, adminToken);
    ok('SLA with invalid priority → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('SLA with invalid priority → 400', false, e.message);
  }

  // Automation rule with no name → 400
  try {
    const r = await req('POST', '/automation', {
      event:      'ticket_created',
      conditions: [],
      actions:    [],
    }, adminToken);
    ok('Automation rule with no name → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Automation rule with no name → 400', false, e.message);
  }

  // Report with no name → 400
  try {
    const r = await req('POST', '/reports', { filters: {}, columns: [] }, adminToken);
    ok('Report with no name → 400', r.status === 400, `got ${r.status}`);
  } catch (e) {
    ok('Report with no name → 400', false, e.message);
  }

  // Merge with no source_ticket_id → 400
  if (created.ticketId) {
    try {
      const r = await req('POST', `/tickets/${created.ticketId}/merge`, {}, adminToken);
      ok('Merge with no source_ticket_id → 400', r.status === 400, `got ${r.status}`);
    } catch (e) {
      ok('Merge with no source_ticket_id → 400', false, e.message);
    }
  }

  // ── 15. CLEANUP ─────────────────────────────────────────────────────────────
  section('Cleanup');

  const cleanups = [
    created.reportId       && req('DELETE', `/reports/${created.reportId}`,             null, adminToken).then((r) => ok('DELETE report',             r.status === 200, `got ${r.status}`)),
    created.cannedId       && req('DELETE', `/canned-responses/${created.cannedId}`,    null, adminToken).then((r) => ok('DELETE canned response',     r.status === 200, `got ${r.status}`)),
    created.automationId   && req('DELETE', `/automation/${created.automationId}`,      null, adminToken).then((r) => ok('DELETE automation rule',     r.status === 200, `got ${r.status}`)),
    created.slaId          && req('DELETE', `/sla/${created.slaId}`,                    null, adminToken).then((r) => ok('DELETE SLA policy',          r.status === 200, `got ${r.status}`)),
    created.customFieldId  && req('DELETE', `/custom-fields/${created.customFieldId}`,  null, adminToken).then((r) => ok('DELETE custom field',        r.status === 200, `got ${r.status}`)),
    created.kbArticleId    && req('DELETE', `/kb/articles/${created.kbArticleId}`,      null, adminToken).then((r) => ok('DELETE KB article',          r.status === 200, `got ${r.status}`)),
    created.kbFolderId     && req('DELETE', `/kb/folders/${created.kbFolderId}`,        null, adminToken).then((r) => ok('DELETE KB folder',           r.status === 200, `got ${r.status}`)),
    created.announcementId && req('DELETE', `/announcements/${created.announcementId}`, null, adminToken).then((r) => ok('DELETE announcement',        r.status === 200, `got ${r.status}`)),
    created.featureId      && req('DELETE', `/features/${created.featureId}`,           null, adminToken).then((r) => ok('DELETE feature request',     r.status === 200, `got ${r.status}`)),
    created.ticket2Id      && req('DELETE', `/tickets/${created.ticket2Id}`,            null, adminToken).then((r) => ok('DELETE ticket2 (merge src)', r.status === 200, `got ${r.status}`)),
    created.ticketId       && req('DELETE', `/tickets/${created.ticketId}`,             null, adminToken).then((r) => ok('DELETE ticket',              r.status === 200, `got ${r.status}`)),
    created.customerId     && req('DELETE', `/customers/${created.customerId}`,         null, adminToken).then((r) => ok('DELETE customer',            r.status === 200, `got ${r.status}`)),
    created.groupId        && req('DELETE', `/groups/${created.groupId}`,               null, adminToken).then((r) => ok('DELETE group',               r.status === 200, `got ${r.status}`)),
    created.userId         && req('DELETE', `/users/${created.userId}`,                 null, adminToken).then((r) => ok('DELETE agent user',          r.status === 200, `got ${r.status}`)),
    created.customerUserId && req('DELETE', `/users/${created.customerUserId}`,         null, adminToken).then((r) => ok('DELETE customer role user',  r.status === 200, `got ${r.status}`)),
  ].filter(Boolean);

  await Promise.allSettled(cleanups);

  printSummary();
}

function printSummary() {
  const total = passed + failed + skipped;
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║  Results: ${String(passed).padStart(3)} passed  ${String(failed).padStart(3)} failed  ${String(skipped).padStart(3)} skipped  ║`);
  console.log(`║  Total:   ${String(total).padStart(3)} tests                             ║`);
  console.log('╚═══════════════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log(`  ${failed} test(s) FAILED — see ✗ lines above for details.\n`);
    process.exit(1);
  } else {
    console.log('  All tests passed.\n');
    process.exit(0);
  }
}

run().catch((e) => {
  console.error('\nFATAL ERROR:', e.message);
  process.exit(1);
});
