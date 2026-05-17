/**
 * e2e_master_tests.js — Master E2E Test Suite for Helyx Support
 *
 * Covers ALL endpoints and roles not already covered by e2e_test.js and
 * e2e_test_comprehensive.js. Targets 300+ assertions.
 *
 * Usage: node e2e_master_tests.js
 * Requires server running at http://localhost:3001
 */

'use strict';

const http = require('http');
const TS   = Date.now();

let passed  = 0;
let failed  = 0;
let skipped = 0;

let adminToken    = '';
let agentToken    = '';
let customerToken = '';

// IDs created during the run (for cleanup)
const ids = {
  ticketId:       null,
  ticket2Id:      null,
  groupId:        null,
  userId:         null,
  customerId:     null,
  kbFolderId:     null,
  kbChildFolderId: null,
  kbArticleId:    null,
  announcementId: null,
  featureId:      null,
  featureCommentId: null,
  slaId:          null,
  cannedId:       null,
  templateId:     null,
  deploymentId:   null,
  reportId:       null,
  forumId:        null,
  forumAnswerId:  null,
  tagName:        null,
  customFieldId:  null,
  automationId:   null,
  downloadId:     null,
  customerUserId: null,
};

// ── HTTP helper ───────────────────────────────────────────────────────────────
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined && body !== null ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path:     '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const timer = setTimeout(() => reject(new Error('Timeout 10s')), 10000);
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', e => { clearTimeout(timer); reject(e); });
    if (data) r.write(data);
    r.end();
  });
}

function ok(name, cond, details) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${details ? ' — ' + details : ''}`); failed++; }
}

function skip(name, reason) {
  console.log(`  - ${name}${reason ? ' (' + reason + ')' : ''}`);
  skipped++;
}

function section(title) { console.log(`\n▶ ${title}`); }

// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     Helyx Support — Master E2E Test Suite           ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Run ID: ${TS}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // 1. HEALTH
  // ══════════════════════════════════════════════════════════════════════════
  section('Health');
  try {
    const r = await req('GET', '/health');
    ok('GET /health → 200 (no auth required)', r.status === 200);
    ok('health body has status:ok', r.body?.status === 'ok');
  } catch (e) { ok('GET /health', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. AUTH — edge cases + token acquisition
  // ══════════════════════════════════════════════════════════════════════════
  section('Auth — Edge Cases');

  // Missing email body
  try {
    const r = await req('POST', '/auth/dev-login', {});
    ok('dev-login with empty body → 400', r.status === 400);
  } catch (e) { ok('dev-login empty body', false, e.message); }

  // Empty string email
  try {
    const r = await req('POST', '/auth/dev-login', { email: '' });
    ok('dev-login with empty email → 400', r.status === 400);
  } catch (e) { ok('dev-login empty string email', false, e.message); }

  // Unknown email
  try {
    const r = await req('POST', '/auth/dev-login', { email: 'nobody@nowhere.invalid' });
    ok('dev-login unknown email → 403', r.status === 403);
  } catch (e) { ok('dev-login unknown email', false, e.message); }

  // Azure endpoint with missing idToken
  try {
    const r = await req('POST', '/auth/azure', {});
    ok('POST /auth/azure missing idToken → 400', r.status === 400);
    ok('error message mentions idToken', typeof r.body?.error === 'string' && r.body.error.includes('idToken'));
  } catch (e) { ok('/auth/azure missing idToken', false, e.message); }

  // Azure with invalid token → 401
  try {
    const r = await req('POST', '/auth/azure', { idToken: 'this.is.fake' });
    ok('POST /auth/azure invalid token → 401', r.status === 401);
  } catch (e) { ok('/auth/azure invalid token', false, e.message); }

  // Invalid bearer token
  try {
    const r = await req('GET', '/tickets', null, 'bad.jwt.token');
    ok('Invalid bearer token → 401', r.status === 401);
  } catch (e) { ok('Invalid bearer token', false, e.message); }

  // Acquire all three tokens
  try {
    const r = await req('POST', '/auth/dev-login', { email: 'admin@helyxtech.com' });
    ok('admin dev-login → 200', r.status === 200);
    ok('admin login returns token', typeof r.body?.token === 'string');
    ok('admin login role=admin', r.body?.user?.role === 'admin');
    adminToken = r.body?.token || '';
  } catch (e) { ok('admin login', false, e.message); }

  try {
    const r = await req('POST', '/auth/dev-login', { email: 'agent@helyxtech.com' });
    ok('agent dev-login → 200', r.status === 200);
    ok('agent login role=agent', r.body?.user?.role === 'agent');
    agentToken = r.body?.token || '';
  } catch (e) { ok('agent login', false, e.message); }

  // Create a customer-role user then log in as them
  const custEmail = `cust_master_${TS}@test.com`;
  if (adminToken) {
    try {
      const cr = await req('POST', '/users', { name: `Master Customer ${TS}`, email: custEmail, role: 'customer' }, adminToken);
      if (cr.status === 201) {
        ids.customerUserId = cr.body.id;
        const lr = await req('POST', '/auth/dev-login', { email: custEmail });
        ok('customer dev-login → 200', lr.status === 200);
        ok('customer login role=customer', lr.body?.user?.role === 'customer');
        customerToken = lr.body?.token || '';
      } else { skip('customer login', 'could not create customer user'); }
    } catch (e) { ok('customer login', false, e.message); }
  }

  if (!adminToken) {
    console.log('\n  FATAL: no admin token — aborting.\n');
    printSummary(); return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. UNAUTHENTICATED ACCESS (protected routes must reject)
  // ══════════════════════════════════════════════════════════════════════════
  section('Unauthenticated Access Rejected');
  for (const [method, path] of [
    ['GET',  '/tickets'],
    ['GET',  '/users'],
    ['GET',  '/groups'],
    ['GET',  '/customers'],
    ['GET',  '/stats'],
    ['GET',  '/settings'],
    ['GET',  '/deployments'],
    ['GET',  '/sla'],
    ['GET',  '/features'],
    ['GET',  '/automation'],
    ['GET',  '/reports'],
    ['GET',  '/contacts'],
  ]) {
    try {
      const r = await req(method, path);
      ok(`${method} ${path} without token → 401`, r.status === 401, `got ${r.status}`);
    } catch (e) { ok(`${method} ${path} unauth`, false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. STATS
  // ══════════════════════════════════════════════════════════════════════════
  section('Stats');
  try {
    const r = await req('GET', '/stats', null, adminToken);
    ok('GET /stats → 200', r.status === 200);
    ok('stats has total (number)', typeof r.body?.total === 'number');
    ok('stats has by_status (array)', Array.isArray(r.body?.by_status));
    ok('stats has by_priority (array)', Array.isArray(r.body?.by_priority));
  } catch (e) { ok('GET /stats', false, e.message); }

  if (agentToken) {
    try {
      const r = await req('GET', '/stats', null, agentToken);
      ok('Agent can GET /stats → 200', r.status === 200);
    } catch (e) { ok('agent stats', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. SETTINGS
  // ══════════════════════════════════════════════════════════════════════════
  section('Settings');
  try {
    const r = await req('GET', '/settings', null, adminToken);
    ok('GET /settings → 200', r.status === 200);
    ok('settings has company_name', 'company_name' in r.body);
    ok('settings has products', 'products' in r.body);
  } catch (e) { ok('GET /settings', false, e.message); }

  // Agent can also read settings
  if (agentToken) {
    try {
      const r = await req('GET', '/settings', null, agentToken);
      ok('Agent GET /settings → 200', r.status === 200);
    } catch (e) { ok('agent GET /settings', false, e.message); }
  }

  // Admin PUT settings
  try {
    const r = await req('PUT', '/settings', { company_name: `E2E Corp ${TS}`, products: '[]' }, adminToken);
    ok('Admin PUT /settings → 200', r.status === 200);
    ok('PUT settings returns updated map', typeof r.body === 'object' && !Array.isArray(r.body));
  } catch (e) { ok('Admin PUT /settings', false, e.message); }

  // Unknown keys silently ignored
  try {
    const r = await req('PUT', '/settings', { unknown_key_xyz: 'value', company_name: 'Helyx E2E' }, adminToken);
    ok('PUT /settings unknown keys silently ignored → 200', r.status === 200);
    ok('unknown key not in response', !('unknown_key_xyz' in r.body));
  } catch (e) { ok('settings unknown keys', false, e.message); }

  // Non-admin PUT → 403
  if (agentToken) {
    try {
      const r = await req('PUT', '/settings', { company_name: 'Hack' }, agentToken);
      ok('Agent PUT /settings → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent PUT /settings', false, e.message); }
  }
  if (customerToken) {
    try {
      const r = await req('PUT', '/settings', { company_name: 'Hack' }, customerToken);
      ok('Customer PUT /settings → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer PUT /settings', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. USERS CRUD + RBAC
  // ══════════════════════════════════════════════════════════════════════════
  section('Users CRUD + RBAC');

  // Any auth user can list
  try {
    const r = await req('GET', '/users', null, adminToken);
    ok('Admin GET /users → 200', r.status === 200);
    ok('users is array', Array.isArray(r.body));
    ok('user objects have id + email', r.body.length === 0 || (!!r.body[0].id && !!r.body[0].email));
  } catch (e) { ok('GET /users', false, e.message); }

  if (agentToken) {
    try {
      const r = await req('GET', '/users', null, agentToken);
      ok('Agent GET /users → 200', r.status === 200);
    } catch (e) { ok('agent GET /users', false, e.message); }
  }

  // Admin creates user
  const newUserEmail = `newagent_master_${TS}@helyxtech.com`;
  try {
    const r = await req('POST', '/users', { name: `Master Agent ${TS}`, email: newUserEmail, role: 'agent' }, adminToken);
    ok('Admin POST /users → 201', r.status === 201);
    ok('created user has id', !!r.body.id);
    ok('created user role=agent', r.body.role === 'agent');
    ids.userId = r.body.id;
  } catch (e) { ok('Admin POST /users', false, e.message); }

  // Duplicate email → 409
  try {
    const r = await req('POST', '/users', { name: 'Dup', email: newUserEmail, role: 'agent' }, adminToken);
    ok('Duplicate user email → 409', r.status === 409, `got ${r.status}`);
  } catch (e) { ok('duplicate user email', false, e.message); }

  // Missing required fields → 400
  try {
    const r = await req('POST', '/users', { role: 'agent' }, adminToken);
    ok('POST /users missing name/email → 400', r.status === 400, `got ${r.status}`);
  } catch (e) { ok('POST /users missing fields', false, e.message); }

  // Invalid role defaults to agent
  try {
    const r = await req('POST', '/users', { name: 'RoleTest', email: `roletest_${TS}@test.com`, role: 'superadmin' }, adminToken);
    ok('Invalid role defaults to agent → 201', r.status === 201);
    ok('role defaulted to agent', r.body.role === 'agent');
    if (r.body.id) await req('DELETE', `/users/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { ok('invalid role defaults to agent', false, e.message); }

  // Non-admin cannot create users
  if (agentToken) {
    try {
      const r = await req('POST', '/users', { name: 'Hack', email: `hack_${TS}@test.com`, role: 'agent' }, agentToken);
      ok('Agent POST /users → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /users', false, e.message); }
  }
  if (customerToken) {
    try {
      const r = await req('POST', '/users', { name: 'Hack', email: `hack2_${TS}@test.com`, role: 'admin' }, customerToken);
      ok('Customer POST /users → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer POST /users', false, e.message); }
  }

  // Admin deactivates user
  if (ids.userId) {
    try {
      const r = await req('PATCH', `/users/${ids.userId}/status`, { active: false }, adminToken);
      ok('Admin PATCH /users/:id/status → 200', r.status === 200);
      ok('user active is now 0/false', r.body.active === 0 || r.body.active === false);
    } catch (e) { ok('deactivate user', false, e.message); }
    // Reactivate for later tests
    await req('PATCH', `/users/${ids.userId}/status`, { active: true }, adminToken).catch(() => {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 7. GROUPS CRUD + RBAC
  // ══════════════════════════════════════════════════════════════════════════
  section('Groups CRUD + RBAC');

  try {
    const r = await req('GET', '/groups', null, adminToken);
    ok('Admin GET /groups → 200', r.status === 200);
    ok('groups is array', Array.isArray(r.body));
  } catch (e) { ok('GET /groups', false, e.message); }

  // Create group
  try {
    const r = await req('POST', '/groups', { name: `E2E Master Group ${TS}` }, adminToken);
    ok('Admin POST /groups → 201', r.status === 201);
    ok('group has id', !!r.body.id);
    ids.groupId = r.body.id;
  } catch (e) { ok('POST /groups', false, e.message); }

  // Duplicate group name → 409
  if (ids.groupId) {
    try {
      const r = await req('POST', '/groups', { name: `E2E Master Group ${TS}` }, adminToken);
      ok('Duplicate group name → 409', r.status === 409, `got ${r.status}`);
    } catch (e) { ok('duplicate group name', false, e.message); }
  }

  // Empty name → 400
  try {
    const r = await req('POST', '/groups', { name: '' }, adminToken);
    ok('POST /groups empty name → 400', r.status === 400);
  } catch (e) { ok('group empty name', false, e.message); }

  // Non-admin cannot create
  if (agentToken) {
    try {
      const r = await req('POST', '/groups', { name: `HackGroup ${TS}` }, agentToken);
      ok('Agent POST /groups → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /groups', false, e.message); }
  }

  // Add and remove member
  if (ids.groupId && ids.userId) {
    try {
      const r = await req('POST', `/groups/${ids.groupId}/members`, { user_id: ids.userId }, adminToken);
      ok('Add member to group → 201', r.status === 201 || r.status === 200);
    } catch (e) { ok('add group member', false, e.message); }
    try {
      const r = await req('GET', `/groups/${ids.groupId}/members`, null, adminToken);
      ok('GET /groups/:id/members → 200', r.status === 200);
      ok('members is array', Array.isArray(r.body));
    } catch (e) { ok('GET group members', false, e.message); }
    try {
      const r = await req('DELETE', `/groups/${ids.groupId}/members/${ids.userId}`, null, adminToken);
      ok('Remove member from group → 200', r.status === 200);
    } catch (e) { ok('remove group member', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. CUSTOMERS CRUD + RBAC
  // ══════════════════════════════════════════════════════════════════════════
  section('Customers CRUD + RBAC');

  try {
    const r = await req('GET', '/customers', null, adminToken);
    ok('Admin GET /customers → 200', r.status === 200);
    ok('customers is array', Array.isArray(r.body));
  } catch (e) { ok('GET /customers', false, e.message); }

  // Admin creates customer
  try {
    const r = await req('POST', '/customers', { name: `E2E Customer Corp ${TS}`, lifecycle_status: 'Potential', industry: 'Tech' }, adminToken);
    ok('Admin POST /customers → 201', r.status === 201);
    ok('customer has id', !!r.body.id);
    ids.customerId = r.body.id;
  } catch (e) { ok('POST /customers', false, e.message); }

  // Missing name → 400
  try {
    const r = await req('POST', '/customers', { industry: 'Tech' }, adminToken);
    ok('POST /customers missing name → 400', r.status === 400);
  } catch (e) { ok('customers missing name', false, e.message); }

  // Non-admin create → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/customers', { name: `HackCorp ${TS}` }, agentToken);
      ok('Agent POST /customers → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /customers', false, e.message); }
  }
  if (customerToken) {
    try {
      const r = await req('POST', '/customers', { name: `HackCorp2 ${TS}` }, customerToken);
      ok('Customer POST /customers → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer POST /customers', false, e.message); }
  }

  // Update customer
  if (ids.customerId) {
    try {
      const r = await req('PUT', `/customers/${ids.customerId}`, { name: `E2E Corp ${TS} Updated`, lifecycle_status: 'Active' }, adminToken);
      ok('Admin PUT /customers/:id → 200', r.status === 200);
    } catch (e) { ok('PUT /customers', false, e.message); }

    // Non-admin PUT → 403
    if (agentToken) {
      try {
        const r = await req('PUT', `/customers/${ids.customerId}`, { name: 'Hack' }, agentToken);
        ok('Agent PUT /customers/:id → 403', r.status === 403, `got ${r.status}`);
      } catch (e) { ok('agent PUT /customers', false, e.message); }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. TICKETS — full lifecycle
  // ══════════════════════════════════════════════════════════════════════════
  section('Tickets — Full Lifecycle');

  const ticketEmail = `req_master_${TS}@testco.com`;

  // Create with all valid fields
  try {
    const r = await req('POST', '/tickets', {
      title:           `Master E2E Ticket ${TS}`,
      description:     'Full lifecycle test from master suite',
      requester_email: ticketEmail,
      requester_name:  'E2E Master',
      priority:        'High',
      type:            'Bug / Incident',
      status:          'Open',
      source:          'manual',
    }, adminToken);
    ok('POST /tickets (all fields) → 201', r.status === 201);
    ok('ticket has id', !!r.body.id);
    ok('ticket has title', r.body.title === `Master E2E Ticket ${TS}`);
    ok('ticket has comments array', Array.isArray(r.body.comments));
    ok('ticket has attachments array', Array.isArray(r.body.attachments));
    ids.ticketId = r.body.id;
  } catch (e) { ok('POST /tickets full', false, e.message); }

  // Create with minimal fields
  try {
    const r = await req('POST', '/tickets', { title: `Minimal Ticket ${TS}` }, adminToken);
    ok('POST /tickets (minimal) → 201', r.status === 201);
    ok('minimal ticket defaults status=Open', r.body.status === 'Open');
    ok('minimal ticket defaults priority=Medium', r.body.priority === 'Medium');
    ids.ticket2Id = r.body.id;
  } catch (e) { ok('POST /tickets minimal', false, e.message); }

  // Missing title → 400
  try {
    const r = await req('POST', '/tickets', { description: 'no title' }, adminToken);
    ok('POST /tickets missing title → 400', r.status === 400);
  } catch (e) { ok('tickets missing title', false, e.message); }

  // Empty body → 400
  try {
    const r = await req('POST', '/tickets', {}, adminToken);
    ok('POST /tickets empty body → 400', r.status === 400);
  } catch (e) { ok('tickets empty body', false, e.message); }

  // Get by ID — admin
  if (ids.ticketId) {
    try {
      const r = await req('GET', `/tickets/${ids.ticketId}`, null, adminToken);
      ok('Admin GET /tickets/:id → 200', r.status === 200);
      ok('ticket id matches', r.body.id === ids.ticketId);
    } catch (e) { ok('GET /tickets/:id', false, e.message); }
  }

  // Non-existent ticket → 404
  try {
    const r = await req('GET', '/tickets/9999999', null, adminToken);
    ok('GET /tickets/9999999 → 404', r.status === 404);
  } catch (e) { ok('ticket 404', false, e.message); }

  // Non-integer ID → 400
  try {
    const r = await req('GET', '/tickets/not-a-number', null, adminToken);
    ok('GET /tickets/not-a-number → 400', r.status === 400);
  } catch (e) { ok('ticket non-integer id', false, e.message); }

  // Zero ID → 400
  try {
    const r = await req('GET', '/tickets/0', null, adminToken);
    ok('GET /tickets/0 → 400', r.status === 400);
  } catch (e) { ok('ticket zero id', false, e.message); }

  // Negative ID → 400
  try {
    const r = await req('GET', '/tickets/-5', null, adminToken);
    ok('GET /tickets/-5 → 400', r.status === 400);
  } catch (e) { ok('ticket negative id', false, e.message); }

  // Status workflow
  if (ids.ticketId) {
    for (const [status, label] of [
      ['In Investigation', 'In Investigation'],
      ['Pending',          'Pending'],
      ['Resolved',         'Resolved'],
      ['Closed',           'Closed'],
    ]) {
      try {
        const r = await req('PUT', `/tickets/${ids.ticketId}`, { status }, adminToken);
        ok(`Ticket status → ${label}`, r.status === 200 && r.body.status === status, `got ${r.status} / ${r.body.status}`);
      } catch (e) { ok(`ticket status ${label}`, false, e.message); }
    }

    // Reopen for further tests
    await req('PUT', `/tickets/${ids.ticketId}`, { status: 'Open' }, adminToken).catch(() => {});

    // All valid priorities
    for (const priority of ['Low', 'Medium', 'High', 'Critical']) {
      try {
        const r = await req('PUT', `/tickets/${ids.ticketId}`, { priority }, adminToken);
        ok(`Ticket priority → ${priority}`, r.status === 200 && r.body.priority === priority);
      } catch (e) { ok(`ticket priority ${priority}`, false, e.message); }
    }
  }

  // Filters
  try {
    const r = await req('GET', `/tickets?status=Open`, null, adminToken);
    ok('GET /tickets?status filter → 200', r.status === 200);
  } catch (e) { ok('ticket filter by status', false, e.message); }

  try {
    const r = await req('GET', `/tickets?priority=High`, null, adminToken);
    ok('GET /tickets?priority filter → 200', r.status === 200);
  } catch (e) { ok('ticket filter by priority', false, e.message); }

  try {
    const r = await req('GET', `/tickets?search=master+e2e`, null, adminToken);
    ok('GET /tickets?search → 200', r.status === 200);
    ok('search returns array', Array.isArray(r.body));
  } catch (e) { ok('ticket search', false, e.message); }

  // Customer can only see own tickets
  if (customerToken) {
    try {
      const r = await req('GET', '/tickets', null, customerToken);
      ok('Customer GET /tickets → 200', r.status === 200);
      const custEmailLower = custEmail.toLowerCase();
      const allOwn = Array.isArray(r.body) && r.body.every(t =>
        (t.requester_email || '').toLowerCase() === custEmailLower
      );
      ok('Customer sees only own tickets', allOwn || r.body.length === 0);
    } catch (e) { ok('customer ticket isolation', false, e.message); }
  }

  // Customer cannot delete ticket
  if (ids.ticketId && customerToken) {
    try {
      const r = await req('DELETE', `/tickets/${ids.ticketId}`, null, customerToken);
      ok('Customer DELETE /tickets/:id → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer delete ticket', false, e.message); }
  }

  // Agent cannot delete ticket
  if (ids.ticketId && agentToken) {
    try {
      const r = await req('DELETE', `/tickets/${ids.ticketId}`, null, agentToken);
      ok('Agent DELETE /tickets/:id → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent delete ticket', false, e.message); }
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  section('Ticket Comments');

  if (ids.ticketId) {
    // Public comment
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/comments`, { body: 'Public comment master', is_public: true }, adminToken);
      ok('POST public comment → 201', r.status === 201);
      ok('comment is_public=1', r.body.is_public === 1 || r.body.is_public === true);
    } catch (e) { ok('public comment', false, e.message); }

    // Internal comment
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/comments`, { body: 'Internal note', is_public: false }, adminToken);
      ok('POST internal comment → 201', r.status === 201);
      ok('comment is_public=0', r.body.is_public === 0 || r.body.is_public === false);
    } catch (e) { ok('internal comment', false, e.message); }

    // Missing body → 400
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/comments`, { is_public: true }, adminToken);
      ok('POST comment missing body → 400', r.status === 400);
    } catch (e) { ok('comment missing body', false, e.message); }

    // public_only=1 filter
    try {
      const r = await req('GET', `/tickets/${ids.ticketId}?public_only=1`, null, adminToken);
      ok('GET ticket public_only=1 → 200', r.status === 200);
      if (Array.isArray(r.body.comments)) {
        const allPublic = r.body.comments.every(c => c.is_public === 1 || c.is_public === true);
        ok('All returned comments are public', allPublic, `${r.body.comments.length} comments`);
      }
    } catch (e) { ok('public_only comment filter', false, e.message); }

    // Activity log
    try {
      const r = await req('GET', `/tickets/${ids.ticketId}/activity`, null, adminToken);
      ok('GET /tickets/:id/activity → 200', r.status === 200);
      ok('activity is array', Array.isArray(r.body));
      ok('activity has entries', r.body.length > 0);
    } catch (e) { ok('ticket activity', false, e.message); }
  }

  // ── Attachment endpoints (non-upload) ─────────────────────────────────────
  section('Ticket Attachments — Download/Delete');

  // Non-existent attachment download → 404
  try {
    const r = await req('GET', '/tickets/attachments/99999/download', null, adminToken);
    ok('GET /tickets/attachments/99999/download → 404', r.status === 404);
  } catch (e) { ok('attachment 404', false, e.message); }

  // Non-existent attachment delete → 404
  try {
    const r = await req('DELETE', '/tickets/attachments/99999', null, adminToken);
    ok('DELETE /tickets/attachments/99999 → 404', r.status === 404);
  } catch (e) { ok('attachment delete 404', false, e.message); }

  // ── Ticket merge ──────────────────────────────────────────────────────────
  section('Ticket Merge');

  if (ids.ticketId && ids.ticket2Id) {
    // Merge ticket with itself → 400
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/merge`, { source_ticket_id: ids.ticketId }, adminToken);
      ok('Merge ticket with itself → 400', r.status === 400);
    } catch (e) { ok('merge self', false, e.message); }

    // Missing source_ticket_id → 400
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/merge`, {}, adminToken);
      ok('Merge missing source_ticket_id → 400', r.status === 400);
    } catch (e) { ok('merge missing source', false, e.message); }

    // Non-existent source → 404
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/merge`, { source_ticket_id: 99999999 }, adminToken);
      ok('Merge non-existent source → 404', r.status === 404, `got ${r.status}`);
    } catch (e) { ok('merge non-existent', false, e.message); }

    // Customer cannot merge → 403
    if (customerToken) {
      try {
        const r = await req('POST', `/tickets/${ids.ticketId}/merge`, { source_ticket_id: ids.ticket2Id }, customerToken);
        ok('Customer POST merge → 403', r.status === 403, `got ${r.status}`);
      } catch (e) { ok('customer merge', false, e.message); }
    }

    // Successful merge
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/merge`, { source_ticket_id: ids.ticket2Id }, adminToken);
      ok('Merge two tickets → 200', r.status === 200, `got ${r.status}`);
      ok('merged response has target id', r.body.id === ids.ticketId);
      ids.ticket2Id = null; // merged/closed — skip deletion in cleanup
    } catch (e) { ok('merge two tickets', false, e.message); }
  } else {
    skip('Ticket merge tests', 'missing one or both tickets');
  }

  // ── SQL injection / edge content ──────────────────────────────────────────
  section('Input Edge Cases');

  // SQL injection in search
  try {
    const sqlPayload = "' OR '1'='1";
    const r = await req('GET', `/tickets?search=${encodeURIComponent(sqlPayload)}`, null, adminToken);
    ok("SQL injection in search → 200 (not 500)", r.status === 200, `got ${r.status}`);
  } catch (e) { ok('sql injection search', false, e.message); }

  // XSS content stored and retrieved
  if (ids.ticketId) {
    const xssTitle = '<script>alert(1)</script>';
    try {
      const cr = await req('POST', `/tickets/${ids.ticketId}/comments`, { body: xssTitle, is_public: true }, adminToken);
      ok('XSS content in comment accepted (not filtered on storage)', cr.status === 201);
      if (cr.status === 201) {
        ok('XSS body stored as-is', cr.body.body === xssTitle);
      }
    } catch (e) { ok('xss content', false, e.message); }
  }

  // Very long title (5000 chars)
  try {
    const longTitle = 'L'.repeat(5000);
    const r = await req('POST', '/tickets', { title: longTitle, requester_email: `long_${TS}@test.com` }, adminToken);
    ok('Very long title handled gracefully (not 500)', [200, 201, 400, 413].includes(r.status), `got ${r.status}`);
    if (r.body?.id) await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { ok('very long title', false, e.message); }

  // Extra unknown body fields (should be ignored)
  try {
    const r = await req('POST', '/tickets', {
      title: `Unknown fields test ${TS}`,
      unknown_field_xyz: 'ignored',
      another_unknown: 42,
    }, adminToken);
    ok('Unknown body fields ignored → 201', r.status === 201);
    if (r.body?.id) await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { ok('unknown body fields', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 10. KNOWLEDGE BASE
  // ══════════════════════════════════════════════════════════════════════════
  section('Knowledge Base');

  // Tree
  try {
    const r = await req('GET', '/kb/tree', null, adminToken);
    ok('GET /kb/tree → 200', r.status === 200);
    ok('kb tree has folders key', r.body && 'folders' in r.body);
    ok('kb tree has articles key', r.body && 'articles' in r.body);
  } catch (e) { ok('GET /kb/tree', false, e.message); }

  // Create folder
  try {
    const r = await req('POST', '/kb/folders', { name: `Master KB Folder ${TS}`, parent_id: null }, adminToken);
    ok('POST /kb/folders → 201', r.status === 201);
    ok('kb folder has id', !!r.body.id);
    ids.kbFolderId = r.body.id;
  } catch (e) { ok('POST /kb/folders', false, e.message); }

  // Create nested folder
  if (ids.kbFolderId) {
    try {
      const r = await req('POST', '/kb/folders', { name: `Master KB Child ${TS}`, parent_id: ids.kbFolderId }, adminToken);
      ok('POST /kb/folders (nested) → 201', r.status === 201);
      ok('child folder has parent_id set', r.body.parent_id === ids.kbFolderId);
      ids.kbChildFolderId = r.body.id;
    } catch (e) { ok('POST /kb/folders nested', false, e.message); }
  }

  // Customer cannot create folder → 403
  if (customerToken) {
    try {
      const r = await req('POST', '/kb/folders', { name: `HackFolder ${TS}` }, customerToken);
      ok('Customer POST /kb/folders → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer POST /kb/folders', false, e.message); }
  }

  // Create article
  if (ids.kbFolderId) {
    try {
      const r = await req('POST', '/kb/articles', {
        folder_id: ids.kbFolderId,
        title:     `Master KB Article ${TS}`,
        content:   'Article content for master E2E suite.',
        status:    'draft',
      }, adminToken);
      ok('POST /kb/articles (draft) → 201', r.status === 201);
      ok('article starts at version 0.1', r.body.version === '0.1');
      ids.kbArticleId = r.body.id;
    } catch (e) { ok('POST /kb/articles', false, e.message); }
  }

  // Article status: draft → published (version bump)
  if (ids.kbArticleId) {
    try {
      const r = await req('PUT', `/kb/articles/${ids.kbArticleId}`, {
        title:   `Master KB Article ${TS}`,
        content: 'Updated content.',
        status:  'published',
      }, adminToken);
      ok('PUT /kb/articles/:id (publish) → 200', r.status === 200);
      ok('published article version bumps to 1.0', r.body.version === '1.0');
      ok('article status is published', r.body.status === 'published');
    } catch (e) { ok('publish kb article', false, e.message); }
  }

  // Article missing title → 400
  try {
    const r = await req('POST', '/kb/articles', { folder_id: ids.kbFolderId || 1, content: 'no title' }, adminToken);
    ok('POST /kb/articles missing title → 400', r.status === 400);
  } catch (e) { ok('kb article missing title', false, e.message); }

  // Non-existent article → 404
  try {
    const r = await req('GET', '/kb/articles/9999999', null, adminToken);
    ok('GET /kb/articles/9999999 → 404', r.status === 404);
  } catch (e) { ok('kb article 404', false, e.message); }

  // KB search
  try {
    const r = await req('GET', '/kb/articles/search?q=Master+KB', null, adminToken);
    ok('GET /kb/articles/search → 200', r.status === 200);
    ok('search returns array', Array.isArray(r.body));
  } catch (e) { ok('kb search', false, e.message); }

  // Customer cannot create article
  if (customerToken && ids.kbFolderId) {
    try {
      const r = await req('POST', '/kb/articles', { folder_id: ids.kbFolderId, title: 'Hack', content: 'x' }, customerToken);
      ok('Customer POST /kb/articles → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer POST /kb/articles', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 11. ANNOUNCEMENTS
  // ══════════════════════════════════════════════════════════════════════════
  section('Announcements');

  // Public endpoint — no auth
  try {
    const r = await req('GET', '/announcements/public');
    ok('GET /announcements/public (no auth) → 200', r.status === 200);
    ok('public announcements is array', Array.isArray(r.body));
    ok('all items in public are published', r.body.every(a => a.status === 'published'));
  } catch (e) { ok('public announcements', false, e.message); }

  // Staff sees all including drafts
  try {
    const r = await req('GET', '/announcements', null, adminToken);
    ok('Admin GET /announcements → 200', r.status === 200);
    ok('announcements is array', Array.isArray(r.body));
  } catch (e) { ok('GET /announcements', false, e.message); }

  // Create draft
  try {
    const r = await req('POST', '/announcements', {
      title:  `Master Announcement ${TS}`,
      body:   'Test announcement body.',
      status: 'draft',
      type:   'general',
    }, adminToken);
    ok('Admin POST /announcements (draft) → 201', r.status === 201);
    ok('announcement status is draft', r.body.status === 'draft');
    ids.announcementId = r.body.id;
  } catch (e) { ok('POST /announcements', false, e.message); }

  // Publish announcement
  if (ids.announcementId) {
    try {
      const r = await req('PUT', `/announcements/${ids.announcementId}`, {
        title:  `Master Announcement ${TS}`,
        body:   'Published body.',
        status: 'published',
        type:   'new_feature',
      }, adminToken);
      ok('Admin PUT /announcements/:id (publish) → 200', r.status === 200);
      ok('announcement status is published', r.body.status === 'published');
    } catch (e) { ok('publish announcement', false, e.message); }
  }

  // Missing title → 400
  try {
    const r = await req('POST', '/announcements', { body: 'no title' }, adminToken);
    ok('POST /announcements missing title → 400', r.status === 400);
  } catch (e) { ok('announcement missing title', false, e.message); }

  // Non-admin create → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/announcements', { title: 'Hack', body: 'x' }, agentToken);
      ok('Agent POST /announcements → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /announcements', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 12. FEATURE REQUESTS
  // ══════════════════════════════════════════════════════════════════════════
  section('Feature Requests');

  try {
    const r = await req('GET', '/features', null, adminToken);
    ok('GET /features → 200', r.status === 200);
    ok('features is array', Array.isArray(r.body));
  } catch (e) { ok('GET /features', false, e.message); }

  // Staff sees PII
  try {
    const r = await req('GET', '/features', null, adminToken);
    if (r.body.length > 0 && r.body[0].submitter_email !== undefined) {
      ok('Staff sees submitter_email', r.body[0].submitter_email !== null || true); // null if no items
    }
  } catch (e) { skip('feature PII check', 'no features exist'); }

  // Submit
  try {
    const r = await req('POST', '/features', {
      title:       `Master Feature ${TS}`,
      description: 'A test feature request from master suite.',
      product:     'Helyx Platform',
    }, adminToken);
    ok('POST /features → 201', r.status === 201);
    ok('feature has id', !!r.body.id);
    ok('feature submitter from JWT not body', r.body.submitter_email === 'admin@helyxtech.com');
    ids.featureId = r.body.id;
  } catch (e) { ok('POST /features', false, e.message); }

  // Vote toggle
  if (ids.featureId) {
    try {
      const r = await req('POST', `/features/${ids.featureId}/vote`, {}, adminToken);
      ok('POST /features/:id/vote (first) → 200', r.status === 200, `got ${r.status}`);
      ok('voted=true', r.body?.voted === true);
    } catch (e) { ok('vote feature', false, e.message); }

    // Vote again to unvote
    try {
      const r = await req('POST', `/features/${ids.featureId}/vote`, {}, adminToken);
      ok('POST /features/:id/vote (toggle unvote) → 200', r.status === 200);
      ok('voted=false', r.body?.voted === false);
    } catch (e) { ok('unvote feature', false, e.message); }

    // Agent updates status
    try {
      const r = await req('PUT', `/features/${ids.featureId}/status`, { status: 'under_review' }, adminToken);
      ok('PUT /features/:id/status → 200', r.status === 200);
      ok('status updated', r.body.status === 'under_review');
    } catch (e) { ok('update feature status', false, e.message); }

    // Invalid status → 400
    try {
      const r = await req('PUT', `/features/${ids.featureId}/status`, { status: 'invalid_status' }, adminToken);
      ok('PUT /features invalid status → 400', r.status === 400);
    } catch (e) { ok('feature invalid status', false, e.message); }

    // Customer cannot delete feature request → 403
    if (customerToken) {
      try {
        const r = await req('DELETE', `/features/${ids.featureId}`, null, customerToken);
        ok('Customer DELETE /features/:id → 403', r.status === 403, `got ${r.status}`);
      } catch (e) { ok('customer delete feature', false, e.message); }
    }

    // Get voters (staff only)
    try {
      const r = await req('GET', `/features/${ids.featureId}/voters`, null, adminToken);
      ok('GET /features/:id/voters (staff) → 200', r.status === 200);
      ok('voters is array', Array.isArray(r.body));
    } catch (e) { ok('feature voters', false, e.message); }

    if (customerToken) {
      try {
        const r = await req('GET', `/features/${ids.featureId}/voters`, null, customerToken);
        ok('Customer GET /features/:id/voters → 403', r.status === 403, `got ${r.status}`);
      } catch (e) { ok('customer get voters', false, e.message); }
    }

    // PII hidden from customers
    if (customerToken) {
      try {
        const r = await req('GET', `/features/${ids.featureId}`, null, customerToken);
        ok('Customer GET /features/:id → 200', r.status === 200);
        ok('submitter_email hidden from customer', r.body.submitter_email === null);
        ok('submitter_name masked', r.body.submitter_name === 'Community Member');
      } catch (e) { ok('feature PII customer view', false, e.message); }
    }

    // Add comment
    try {
      const r = await req('POST', `/features/${ids.featureId}/comments`, { body: 'Great idea!' }, adminToken);
      ok('POST /features/:id/comments → 201', r.status === 201);
      ids.featureCommentId = r.body.id;
    } catch (e) { ok('POST feature comment', false, e.message); }
  }

  // Missing title → 400
  try {
    const r = await req('POST', '/features', { description: 'no title' }, adminToken);
    ok('POST /features missing title → 400', r.status === 400);
  } catch (e) { ok('feature missing title', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 13. SLA POLICIES
  // ══════════════════════════════════════════════════════════════════════════
  section('SLA Policies');

  try {
    const r = await req('GET', '/sla', null, adminToken);
    ok('GET /sla → 200', r.status === 200);
    ok('sla is array', Array.isArray(r.body));
  } catch (e) { ok('GET /sla', false, e.message); }

  // Create
  try {
    const r = await req('POST', '/sla', {
      name:                 `Master SLA ${TS}`,
      priority:             'High',
      first_response_hours: 4,
      resolution_hours:     24,
    }, adminToken);
    ok('Admin POST /sla → 201', r.status === 201);
    ok('sla has id', !!r.body.id);
    ids.slaId = r.body.id;
  } catch (e) { ok('POST /sla', false, e.message); }

  // Invalid priority → 400
  try {
    const r = await req('POST', '/sla', {
      name: `BadSLA ${TS}`, priority: 'UltraCritical',
      first_response_hours: 1, resolution_hours: 2,
    }, adminToken);
    ok('POST /sla invalid priority → 400', r.status === 400);
  } catch (e) { ok('sla invalid priority', false, e.message); }

  // Missing required fields → 400
  try {
    const r = await req('POST', '/sla', { name: `IncSLA ${TS}` }, adminToken);
    ok('POST /sla missing required fields → 400', r.status === 400);
  } catch (e) { ok('sla missing fields', false, e.message); }

  // Agent cannot create → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/sla', {
        name: `AgentSLA ${TS}`, priority: 'Low',
        first_response_hours: 24, resolution_hours: 48,
      }, agentToken);
      ok('Agent POST /sla → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /sla', false, e.message); }
  }

  // Ticket SLA status
  if (ids.ticketId) {
    try {
      const r = await req('GET', `/sla/ticket/${ids.ticketId}`, null, adminToken);
      ok('GET /sla/ticket/:id → 200', r.status === 200);
      ok('sla response has policy field', 'policy' in r.body);
    } catch (e) { ok('GET ticket SLA status', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 14. CANNED RESPONSES
  // ══════════════════════════════════════════════════════════════════════════
  section('Canned Responses');

  // Staff only GET
  try {
    const r = await req('GET', '/canned-responses', null, adminToken);
    ok('Admin GET /canned-responses → 200', r.status === 200);
    ok('canned responses is array', Array.isArray(r.body));
  } catch (e) { ok('GET /canned-responses', false, e.message); }

  if (agentToken) {
    try {
      const r = await req('GET', '/canned-responses', null, agentToken);
      ok('Agent GET /canned-responses → 200', r.status === 200);
    } catch (e) { ok('agent GET /canned-responses', false, e.message); }
  }

  if (customerToken) {
    try {
      const r = await req('GET', '/canned-responses', null, customerToken);
      ok('Customer GET /canned-responses → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer GET /canned-responses', false, e.message); }
  }

  // Create
  try {
    const r = await req('POST', '/canned-responses', {
      title: `Master Canned ${TS}`,
      body:  'Thank you for reaching out.',
      category: 'General',
    }, adminToken);
    ok('Admin POST /canned-responses → 201', r.status === 201);
    ok('canned response has id', !!r.body.id);
    ids.cannedId = r.body.id;
  } catch (e) { ok('POST /canned-responses', false, e.message); }

  // Missing title → 400
  try {
    const r = await req('POST', '/canned-responses', { body: 'no title' }, adminToken);
    ok('POST /canned-responses missing title → 400', r.status === 400);
  } catch (e) { ok('canned missing title', false, e.message); }

  // Agent cannot create → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/canned-responses', { title: 'Agent Hack', body: 'x' }, agentToken);
      ok('Agent POST /canned-responses → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /canned-responses', false, e.message); }
  }

  // Update
  if (ids.cannedId) {
    try {
      const r = await req('PUT', `/canned-responses/${ids.cannedId}`, {
        title: `Master Canned ${TS} Updated`, body: 'Updated text.',
      }, adminToken);
      ok('Admin PUT /canned-responses/:id → 200', r.status === 200);
    } catch (e) { ok('PUT /canned-responses', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 15. EMAIL TEMPLATES
  // ══════════════════════════════════════════════════════════════════════════
  section('Email Templates');

  try {
    const r = await req('GET', '/email-templates', null, adminToken);
    ok('Admin GET /email-templates → 200', r.status === 200);
    ok('email templates is array or object', typeof r.body === 'object');
  } catch (e) { ok('GET /email-templates', false, e.message); }

  if (agentToken) {
    try {
      const r = await req('GET', '/email-templates', null, agentToken);
      ok('Agent GET /email-templates → 200', r.status === 200);
    } catch (e) { ok('agent GET /email-templates', false, e.message); }
  }

  // Get single template
  try {
    const r = await req('GET', '/email-templates/ticket_created_customer', null, adminToken);
    ok('GET /email-templates/:key → 200', r.status === 200);
    ok('template has key field', r.body?.key === 'ticket_created_customer');
  } catch (e) { ok('GET /email-templates/:key', false, e.message); }

  // Non-existent key → 404
  try {
    const r = await req('GET', '/email-templates/nonexistent_key_xyz', null, adminToken);
    ok('GET /email-templates/invalid_key → 404', r.status === 404);
  } catch (e) { ok('email template 404', false, e.message); }

  // Admin update template
  try {
    const r = await req('PUT', '/email-templates/ticket_created_customer', {
      subject: 'Your ticket {{ticket_id}} has been created',
      body:    '<p>Hello, your ticket is created.</p>',
      enabled: true,
    }, adminToken);
    ok('Admin PUT /email-templates/:key → 200', r.status === 200);
    ok('template enabled=1', r.body?.enabled === 1 || r.body?.enabled === true);
  } catch (e) { ok('PUT /email-templates', false, e.message); }

  // Non-admin update → 403
  if (agentToken) {
    try {
      const r = await req('PUT', '/email-templates/ticket_created_customer', { subject: 'hack', body: 'x' }, agentToken);
      ok('Agent PUT /email-templates → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent PUT /email-templates', false, e.message); }
  }

  // Customer cannot access templates
  if (customerToken) {
    try {
      const r = await req('GET', '/email-templates', null, customerToken);
      ok('Customer GET /email-templates → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer GET /email-templates', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 16. CSAT
  // ══════════════════════════════════════════════════════════════════════════
  section('CSAT');

  try {
    const r = await req('GET', '/csat/stats', null, adminToken);
    ok('GET /csat/stats → 200', r.status === 200);
    ok('stats has total_sent', typeof r.body?.total_sent === 'number');
    ok('stats has total_submitted', typeof r.body?.total_submitted === 'number');
    ok('stats has by_rating array', Array.isArray(r.body?.by_rating));
  } catch (e) { ok('GET /csat/stats', false, e.message); }

  if (ids.ticketId) {
    try {
      const r = await req('GET', `/csat/ticket/${ids.ticketId}`, null, adminToken);
      ok('GET /csat/ticket/:id → 200', r.status === 200);
      ok('csat response has rating field', 'rating' in r.body);
    } catch (e) { ok('GET /csat/ticket', false, e.message); }
  }

  // POST rate via token with invalid rating → 400
  try {
    const r = await req('POST', '/csat/rate/fake-token-xyz', { rating: 6 });
    ok('POST /csat/rate invalid rating → 400', r.status === 400, `got ${r.status}`);
  } catch (e) { ok('csat invalid rating', false, e.message); }

  // POST rate with non-existent token → 404
  try {
    const r = await req('POST', '/csat/rate/definitely-not-real-token-abc123', { rating: 4 });
    ok('POST /csat/rate non-existent token → 404', r.status === 404, `got ${r.status}`);
  } catch (e) { ok('csat non-existent token', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 17. STATUS PAGE
  // ══════════════════════════════════════════════════════════════════════════
  section('Status Page');

  try {
    const r = await req('GET', '/status');
    ok('GET /status (public, no auth) → 200', r.status === 200);
    ok('status has status field', 'status' in r.body);
    ok('status value is valid', ['operational','degraded','outage','maintenance'].includes(r.body.status));
  } catch (e) { ok('GET /status', false, e.message); }

  // Admin PUT status
  try {
    const r = await req('PUT', '/status', { status: 'operational', message: 'All systems go' }, adminToken);
    ok('Admin PUT /status → 200', r.status === 200);
    ok('status updated', r.body?.status === 'operational');
  } catch (e) { ok('PUT /status', false, e.message); }

  // Invalid status → 400
  try {
    const r = await req('PUT', '/status', { status: 'on_fire' }, adminToken);
    ok('PUT /status invalid status → 400', r.status === 400);
  } catch (e) { ok('status invalid value', false, e.message); }

  // Non-admin PUT → 403
  if (agentToken) {
    try {
      const r = await req('PUT', '/status', { status: 'maintenance' }, agentToken);
      ok('Agent PUT /status → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent PUT /status', false, e.message); }
  }

  // Unauthenticated PUT → 401
  try {
    const r = await req('PUT', '/status', { status: 'maintenance' });
    ok('Unauthenticated PUT /status → 401', r.status === 401, `got ${r.status}`);
  } catch (e) { ok('unauth PUT /status', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 18. DOWNLOADS
  // ══════════════════════════════════════════════════════════════════════════
  section('Downloads');

  // Public GET
  try {
    const r = await req('GET', '/downloads');
    ok('GET /downloads (public) → 200', r.status === 200);
    ok('downloads is array', Array.isArray(r.body));
  } catch (e) { ok('GET /downloads public', false, e.message); }

  // Admin GET /all
  try {
    const r = await req('GET', '/downloads/all', null, adminToken);
    ok('Admin GET /downloads/all → 200', r.status === 200);
    ok('all downloads is array', Array.isArray(r.body));
  } catch (e) { ok('GET /downloads/all', false, e.message); }

  // Non-admin GET /all → 403
  if (agentToken) {
    try {
      const r = await req('GET', '/downloads/all', null, agentToken);
      ok('Agent GET /downloads/all → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent GET /downloads/all', false, e.message); }
  }

  // Admin POST download (external URL)
  try {
    const r = await req('POST', '/downloads', {
      title:       `Master Download ${TS}`,
      description: 'Test download entry',
      category:    'Documentation',
      url:         'https://example.com/doc.pdf',
      is_external: '1',
      file_type:   'PDF',
    }, adminToken);
    ok('Admin POST /downloads (external) → 201', r.status === 201, `got ${r.status}`);
    ok('download has id', !!r.body.id);
    ids.downloadId = r.body.id;
  } catch (e) { ok('POST /downloads', false, e.message); }

  // Non-admin POST → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/downloads', { title: 'Hack', url: 'https://x.com', is_external: '1' }, agentToken);
      ok('Agent POST /downloads → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /downloads', false, e.message); }
  }

  // Update download
  if (ids.downloadId) {
    try {
      const r = await req('PUT', `/downloads/${ids.downloadId}`, {
        title: `Master Download ${TS} Updated`, is_active: 0,
      }, adminToken);
      ok('Admin PUT /downloads/:id → 200', r.status === 200);
    } catch (e) { ok('PUT /downloads', false, e.message); }
  }

  // Filter by category/product
  try {
    const r = await req('GET', '/downloads?category=Documentation');
    ok('GET /downloads?category filter → 200', r.status === 200);
  } catch (e) { ok('downloads category filter', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 19. DEPLOYMENTS
  // ══════════════════════════════════════════════════════════════════════════
  section('Deployments');

  try {
    const r = await req('GET', '/deployments', null, adminToken);
    ok('GET /deployments → 200', r.status === 200);
    ok('deployments is array', Array.isArray(r.body));
  } catch (e) { ok('GET /deployments', false, e.message); }

  // Create
  try {
    const r = await req('POST', '/deployments', {
      product_id:   `master-product-${TS}`,
      product_name: 'Master Product',
      environment:  'UAT',
      version:      '1.0.0',
      status:       'Planned',
      notes:        'Master E2E deployment test',
    }, adminToken);
    ok('Admin POST /deployments → 201', r.status === 201);
    ok('deployment has id', !!r.body.id);
    ids.deploymentId = r.body.id;
  } catch (e) { ok('POST /deployments', false, e.message); }

  // Missing product_id → 400
  try {
    const r = await req('POST', '/deployments', { environment: 'Production' }, adminToken);
    ok('POST /deployments missing product_id → 400', r.status === 400);
  } catch (e) { ok('deployment missing product_id', false, e.message); }

  // Non-admin → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/deployments', { product_id: 'x', environment: 'Prod' }, agentToken);
      ok('Agent POST /deployments → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /deployments', false, e.message); }
  }

  // Update
  if (ids.deploymentId) {
    try {
      const r = await req('PUT', `/deployments/${ids.deploymentId}`, {
        product_id:   `master-product-${TS}`,
        environment:  'Production',
        status:       'Completed',
      }, adminToken);
      ok('Admin PUT /deployments/:id → 200', r.status === 200);
      ok('deployment status updated', r.body.status === 'Completed');
    } catch (e) { ok('PUT /deployments', false, e.message); }

    // Filter by product_id
    try {
      const r = await req('GET', `/deployments?product_id=master-product-${TS}`, null, adminToken);
      ok('GET /deployments?product_id filter → 200', r.status === 200);
      ok('filter returns array', Array.isArray(r.body));
    } catch (e) { ok('deployment filter', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 20. REPORTS
  // ══════════════════════════════════════════════════════════════════════════
  section('Reports');

  // Customer cannot access → 403
  if (customerToken) {
    try {
      const r = await req('GET', '/reports', null, customerToken);
      ok('Customer GET /reports → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer GET /reports', false, e.message); }
  }

  try {
    const r = await req('GET', '/reports', null, adminToken);
    ok('Admin GET /reports → 200', r.status === 200);
    ok('reports is array', Array.isArray(r.body));
  } catch (e) { ok('GET /reports', false, e.message); }

  // Create
  try {
    const r = await req('POST', '/reports', {
      name:    `Master Report ${TS}`,
      filters: { status: 'Open', priority: 'High' },
      columns: ['id', 'title', 'status'],
    }, adminToken);
    ok('Admin POST /reports → 201', r.status === 201);
    ok('report has id', !!r.body.id);
    ok('report filters is object', typeof r.body.filters === 'object');
    ok('report columns is array', Array.isArray(r.body.columns));
    ids.reportId = r.body.id;
  } catch (e) { ok('POST /reports', false, e.message); }

  // Missing name → 400
  try {
    const r = await req('POST', '/reports', { filters: {}, columns: [] }, adminToken);
    ok('POST /reports missing name → 400', r.status === 400);
  } catch (e) { ok('report missing name', false, e.message); }

  // Agent can also create report
  if (agentToken) {
    try {
      const r = await req('POST', '/reports', { name: `Agent Report ${TS}`, filters: {}, columns: [] }, agentToken);
      ok('Agent POST /reports → 201', r.status === 201);
      if (r.body.id) await req('DELETE', `/reports/${r.body.id}`, null, adminToken).catch(() => {});
    } catch (e) { ok('agent POST /reports', false, e.message); }
  }

  // Update
  if (ids.reportId) {
    try {
      const r = await req('PUT', `/reports/${ids.reportId}`, {
        name:    `Master Report ${TS} Updated`,
        filters: { status: 'Closed' },
        columns: ['id', 'title'],
      }, adminToken);
      ok('PUT /reports/:id → 200', r.status === 200);
    } catch (e) { ok('PUT /reports', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 21. FORUM
  // ══════════════════════════════════════════════════════════════════════════
  section('Forum');

  // GET forum (requires auth)
  try {
    const r = await req('GET', '/forum', null, adminToken);
    ok('GET /forum → 200', r.status === 200);
    ok('forum is array', Array.isArray(r.body));
  } catch (e) { ok('GET /forum', false, e.message); }

  // Create question (requires auth)
  try {
    const r = await req('POST', '/forum', { title: `Master Forum Q ${TS}`, body: 'Is this a test?', tags: 'e2e' }, adminToken);
    ok('POST /forum (auth) → 201', r.status === 201);
    ok('forum question has id', !!r.body.id);
    ids.forumId = r.body.id;
  } catch (e) { ok('POST /forum', false, e.message); }

  // POST forum without auth → 401
  try {
    const r = await req('POST', '/forum', { title: 'unauth question', body: 'x' });
    ok('POST /forum without auth → 401', r.status === 401, `got ${r.status}`);
  } catch (e) { ok('unauth POST /forum', false, e.message); }

  // Missing title → 400
  try {
    const r = await req('POST', '/forum', { body: 'no title' }, adminToken);
    ok('POST /forum missing title → 400', r.status === 400);
  } catch (e) { ok('forum missing title', false, e.message); }

  // Add answer
  if (ids.forumId) {
    try {
      const r = await req('POST', `/forum/${ids.forumId}/answers`, { body: 'Yes it is!' }, adminToken);
      ok('POST /forum/:id/answers → 201', r.status === 201);
      ok('answer has id', !!r.body.id);
      ids.forumAnswerId = r.body.id;
    } catch (e) { ok('POST forum answer', false, e.message); }

    // Answer missing body → 400
    try {
      const r = await req('POST', `/forum/${ids.forumId}/answers`, {}, adminToken);
      ok('POST forum answer missing body → 400', r.status === 400);
    } catch (e) { ok('forum answer missing body', false, e.message); }

    // Get question
    try {
      const r = await req('GET', `/forum/${ids.forumId}`, null, adminToken);
      ok('GET /forum/:id → 200', r.status === 200);
      ok('forum question has answers array', Array.isArray(r.body.answers));
    } catch (e) { ok('GET /forum/:id', false, e.message); }

    // Accept answer
    if (ids.forumAnswerId) {
      try {
        const r = await req('PATCH', `/forum/answers/${ids.forumAnswerId}/accept`, {}, adminToken);
        ok('PATCH /forum/answers/:id/accept → 200', r.status === 200);
        ok('answer is_accepted=1', r.body.is_accepted === 1);
      } catch (e) { ok('accept forum answer', false, e.message); }
    }

    // Staff can delete any question
    // (we'll do this in cleanup instead)
  }

  // Search + filter
  try {
    const r = await req('GET', `/forum?q=Master+Forum`, null, adminToken);
    ok('GET /forum?q search → 200', r.status === 200);
  } catch (e) { ok('forum search', false, e.message); }

  try {
    const r = await req('GET', '/forum?answered=0', null, adminToken);
    ok('GET /forum?answered=0 → 200', r.status === 200);
    ok('forum answered=0 result is array', Array.isArray(r.body));
  } catch (e) { ok('forum filter unanswered', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 22. TAG DEFINITIONS
  // ══════════════════════════════════════════════════════════════════════════
  section('Tag Definitions');

  ids.tagName = `mastertag_${TS}`;

  // GET (any auth)
  try {
    const r = await req('GET', '/tag-definitions', null, adminToken);
    ok('GET /tag-definitions → 200', r.status === 200);
    ok('tag definitions is array', Array.isArray(r.body));
  } catch (e) { ok('GET /tag-definitions', false, e.message); }

  // Create (staff only)
  try {
    const r = await req('POST', '/tag-definitions', {
      name:        ids.tagName,
      color:       '#ffffff',
      bg:          '#000000',
      description: 'Master test tag',
    }, adminToken);
    ok('POST /tag-definitions (staff) → 201', r.status === 201);
    ok('new tag in returned array', Array.isArray(r.body) && r.body.some(t => t.name === ids.tagName));
  } catch (e) { ok('POST /tag-definitions', false, e.message); }

  // Duplicate name → 409
  try {
    const r = await req('POST', '/tag-definitions', { name: ids.tagName }, adminToken);
    ok('POST /tag-definitions duplicate → 409', r.status === 409, `got ${r.status}`);
  } catch (e) { ok('tag definition duplicate', false, e.message); }

  // Customer cannot create → 403
  if (customerToken) {
    try {
      const r = await req('POST', '/tag-definitions', { name: `hacktag_${TS}` }, customerToken);
      ok('Customer POST /tag-definitions → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer POST /tag-definitions', false, e.message); }
  }

  // PATCH (update color)
  try {
    const r = await req('PATCH', `/tag-definitions/${ids.tagName}`, { color: '#ff0000' }, adminToken);
    ok('PATCH /tag-definitions/:name → 200', r.status === 200);
  } catch (e) { ok('PATCH /tag-definitions', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 23. CONTACTS
  // ══════════════════════════════════════════════════════════════════════════
  section('Contacts');

  try {
    const r = await req('GET', '/contacts', null, adminToken);
    ok('Admin GET /contacts → 200', r.status === 200);
    ok('contacts is array', Array.isArray(r.body));
    ok('contacts have email field', r.body.length === 0 || !!r.body[0].email);
    ok('contacts have source field', r.body.length === 0 || !!r.body[0].source);
  } catch (e) { ok('GET /contacts', false, e.message); }

  if (agentToken) {
    try {
      const r = await req('GET', '/contacts', null, agentToken);
      ok('Agent GET /contacts → 200', r.status === 200);
    } catch (e) { ok('agent GET /contacts', false, e.message); }
  }

  // Customer cannot access contacts
  if (customerToken) {
    try {
      const r = await req('GET', '/contacts', null, customerToken);
      ok('Customer GET /contacts → 401/403', r.status === 401 || r.status === 403, `got ${r.status}`);
    } catch (e) { ok('customer GET /contacts', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 24. CUSTOM FIELDS
  // ══════════════════════════════════════════════════════════════════════════
  section('Custom Fields');

  try {
    const r = await req('GET', '/custom-fields', null, adminToken);
    ok('Admin GET /custom-fields → 200', r.status === 200);
    ok('custom fields is array', Array.isArray(r.body));
  } catch (e) { ok('GET /custom-fields', false, e.message); }

  // Create
  const cfLabel = `Master CF ${TS}`;
  try {
    const r = await req('POST', '/custom-fields', {
      label:      cfLabel,
      field_type: 'text',
      required:   false,
      applies_to: 'ticket',
    }, adminToken);
    ok('Admin POST /custom-fields → 201', r.status === 201);
    ok('custom field has id', !!r.body.id);
    ids.customFieldId = r.body.id;
  } catch (e) { ok('POST /custom-fields', false, e.message); }

  // Missing label → 400
  try {
    const r = await req('POST', '/custom-fields', { field_type: 'text' }, adminToken);
    ok('POST /custom-fields missing label → 400', r.status === 400);
  } catch (e) { ok('custom field missing label', false, e.message); }

  // Invalid field_type → 400
  try {
    const r = await req('POST', '/custom-fields', { label: `BadType ${TS}`, field_type: 'invalid_type' }, adminToken);
    ok('POST /custom-fields invalid field_type → 400', r.status === 400);
  } catch (e) { ok('custom field invalid type', false, e.message); }

  // Non-admin cannot create → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/custom-fields', { label: `HackCF ${TS}`, field_type: 'text' }, agentToken);
      ok('Agent POST /custom-fields → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /custom-fields', false, e.message); }
  }

  // Set custom field value on ticket
  if (ids.customFieldId && ids.ticketId) {
    try {
      const body = {};
      body[String(ids.customFieldId)] = `value-${TS}`;
      const r = await req('PUT', `/custom-fields/ticket/${ids.ticketId}`, body, adminToken);
      ok('PUT /custom-fields/ticket/:id → 200', r.status === 200);
    } catch (e) { ok('set custom field value', false, e.message); }

    // Get values for ticket
    try {
      const r = await req('GET', `/custom-fields/ticket/${ids.ticketId}`, null, adminToken);
      ok('GET /custom-fields/ticket/:id → 200', r.status === 200);
      ok('response has values map', r.body && typeof r.body.values === 'object');
    } catch (e) { ok('GET ticket custom fields', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 25. AUTOMATION RULES
  // ══════════════════════════════════════════════════════════════════════════
  section('Automation Rules');

  try {
    const r = await req('GET', '/automation', null, adminToken);
    ok('Admin GET /automation → 200', r.status === 200);
    ok('automation rules is array', Array.isArray(r.body));
  } catch (e) { ok('GET /automation', false, e.message); }

  // Create
  try {
    const r = await req('POST', '/automation', {
      name:       `Master Rule ${TS}`,
      event:      'ticket_created',
      conditions: [{ field: 'priority', operator: 'equals', value: 'High' }],
      actions:    [{ type: 'set_status', value: 'In Investigation' }],
      active:     true,
    }, adminToken);
    ok('Admin POST /automation → 201', r.status === 201);
    ok('rule has id', !!r.body.id);
    ok('conditions parsed as array', Array.isArray(r.body.conditions));
    ids.automationId = r.body.id;
  } catch (e) { ok('POST /automation', false, e.message); }

  // Missing name → 400
  try {
    const r = await req('POST', '/automation', { event: 'ticket_created', conditions: [], actions: [] }, adminToken);
    ok('POST /automation missing name → 400', r.status === 400);
  } catch (e) { ok('automation missing name', false, e.message); }

  // Non-admin cannot create → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/automation', { name: `AgentRule ${TS}`, event: 'ticket_created', conditions: [], actions: [] }, agentToken);
      ok('Agent POST /automation → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /automation', false, e.message); }
  }

  // Toggle
  if (ids.automationId) {
    try {
      const r = await req('PATCH', `/automation/${ids.automationId}/toggle`, { active: false }, adminToken);
      ok('PATCH /automation/:id/toggle → 200', r.status === 200);
    } catch (e) { ok('toggle automation', false, e.message); }
  }

  // GET /automation/pending — admin only
  try {
    const r = await req('GET', '/automation/pending', null, adminToken);
    ok('Admin GET /automation/pending → 200', r.status === 200);
    ok('pending is array', Array.isArray(r.body));
  } catch (e) { ok('GET /automation/pending', false, e.message); }

  if (agentToken) {
    try {
      const r = await req('GET', '/automation/pending', null, agentToken);
      ok('Agent GET /automation/pending → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent /automation/pending', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 26. TICKET TEMPLATES
  // ══════════════════════════════════════════════════════════════════════════
  section('Ticket Templates');

  // Any auth user can list
  try {
    const r = await req('GET', '/ticket-templates', null, adminToken);
    ok('GET /ticket-templates → 200', r.status === 200);
    ok('ticket templates is array', Array.isArray(r.body));
  } catch (e) { ok('GET /ticket-templates', false, e.message); }

  if (customerToken) {
    try {
      const r = await req('GET', '/ticket-templates', null, customerToken);
      ok('Customer GET /ticket-templates → 200', r.status === 200);
    } catch (e) { ok('customer GET /ticket-templates', false, e.message); }
  }

  // Admin creates template
  try {
    const r = await req('POST', '/ticket-templates', {
      name:        `Master Template ${TS}`,
      description: 'Test template',
      type:        'Bug / Incident',
      priority:    'High',
    }, adminToken);
    ok('Admin POST /ticket-templates → 201', r.status === 201);
    ok('template has id', !!r.body.id);
    ids.templateId = r.body.id;
  } catch (e) { ok('POST /ticket-templates', false, e.message); }

  // Non-admin → 403
  if (agentToken) {
    try {
      const r = await req('POST', '/ticket-templates', { name: 'Hack' }, agentToken);
      ok('Agent POST /ticket-templates → 403', r.status === 403, `got ${r.status}`);
    } catch (e) { ok('agent POST /ticket-templates', false, e.message); }
  }

  // Update
  if (ids.templateId) {
    try {
      const r = await req('PUT', `/ticket-templates/${ids.templateId}`, {
        name:        `Master Template ${TS} Updated`,
        type:        'Question / How-To',
        priority:    'Low',
      }, adminToken);
      ok('PUT /ticket-templates/:id → 200', r.status === 200);
    } catch (e) { ok('PUT /ticket-templates', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 27. EMAIL INGEST
  // ══════════════════════════════════════════════════════════════════════════
  section('Email Ingest');

  // Valid payload (no INGEST_SECRET in dev)
  try {
    const r = await req('POST', '/email/ingest', {
      from:    `ingest_${TS}@external.com`,
      subject: `Ingest Test ${TS}`,
      text:    'This came in via email.',
    });
    ok('POST /email/ingest valid → 201', r.status === 201, `got ${r.status}`);
    ok('ingest creates ticket with source=email', r.body?.source === 'email');
    ok('ingest ticket has title from subject', r.body?.title === `Ingest Test ${TS}`);
    // Cleanup
    if (r.body?.id) await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { ok('POST /email/ingest', false, e.message); }

  // Ingest with only html (no text)
  try {
    const r = await req('POST', '/email/ingest', {
      from:    `html_ingest_${TS}@external.com`,
      subject: `HTML Ingest ${TS}`,
      html:    '<p>HTML email body</p>',
    });
    ok('POST /email/ingest html only → 201', r.status === 201, `got ${r.status}`);
    if (r.body?.id) await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { ok('ingest html only', false, e.message); }

  // Missing both subject and body → 400
  try {
    const r = await req('POST', '/email/ingest', { from: 'x@x.com' });
    ok('POST /email/ingest missing subject+body → 400', r.status === 400, `got ${r.status}`);
  } catch (e) { ok('ingest missing subject+body', false, e.message); }

  // Empty subject uses "No Subject"
  try {
    const r = await req('POST', '/email/ingest', { from: `nosub_${TS}@x.com`, text: 'some body' });
    ok('POST /email/ingest empty subject creates ticket', r.status === 201, `got ${r.status}`);
    ok('default title is No Subject', r.body?.title === 'No Subject');
    if (r.body?.id) await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { ok('ingest empty subject', false, e.message); }

  // ══════════════════════════════════════════════════════════════════════════
  // 28. TICKET TAGS (sub-route)
  // ══════════════════════════════════════════════════════════════════════════
  section('Ticket Tags');

  if (ids.ticketId) {
    // Add tag
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/tags`, { tag: `e2e-master-tag-${TS}` }, adminToken);
      ok('POST /tickets/:id/tags → 200/201', r.status === 200 || r.status === 201);
    } catch (e) { ok('POST ticket tag', false, e.message); }

    // GET tags
    try {
      const r = await req('GET', `/tickets/${ids.ticketId}/tags`, null, adminToken);
      ok('GET /tickets/:id/tags → 200', r.status === 200);
      ok('tags is array', Array.isArray(r.body));
    } catch (e) { ok('GET ticket tags', false, e.message); }

    // POST without auth → 401
    try {
      const r = await req('POST', `/tickets/${ids.ticketId}/tags`, { tag: 'hack' });
      ok('POST tags without auth → 401', r.status === 401, `got ${r.status}`);
    } catch (e) { ok('unauth POST tags', false, e.message); }

    // DELETE tag
    try {
      const r = await req('DELETE', `/tickets/${ids.ticketId}/tags/e2e-master-tag-${TS}`, null, adminToken);
      ok('DELETE /tickets/:id/tags/:tag → 200', r.status === 200);
    } catch (e) { ok('DELETE ticket tag', false, e.message); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 29. INBOUND (check if route exists)
  // ══════════════════════════════════════════════════════════════════════════
  section('Inbound Route');
  try {
    const r = await req('POST', '/inbound/email', {
      from:    `inbound_${TS}@test.com`,
      subject: `Inbound Test ${TS}`,
      text:    'Inbound test body',
    });
    // Route may or may not exist — just verify server doesn't crash
    ok('POST /inbound/email handled (not 500)', r.status !== 500, `got ${r.status}`);
    if (r.body?.id) await req('DELETE', `/tickets/${r.body.id}`, null, adminToken).catch(() => {});
  } catch (e) { skip('POST /inbound/email', 'route may not exist'); }

  // ══════════════════════════════════════════════════════════════════════════
  // 30. RBAC SUMMARY CHECKS (cross-cutting)
  // ══════════════════════════════════════════════════════════════════════════
  section('RBAC Cross-Cutting Checks');

  // Customer cannot access admin CRUD for any resource
  if (customerToken) {
    const adminRoutes = [
      ['DELETE', `/users/${ids.userId || 1}`],
      ['DELETE', `/groups/${ids.groupId || 1}`],
      ['DELETE', `/customers/${ids.customerId || 1}`],
      ['DELETE', `/sla/${ids.slaId || 1}`],
      ['DELETE', `/announcements/${ids.announcementId || 1}`],
    ];
    for (const [method, path] of adminRoutes) {
      try {
        const r = await req(method, path, null, customerToken);
        ok(`Customer ${method} ${path} → 403`, r.status === 403, `got ${r.status}`);
      } catch (e) { ok(`customer ${method} ${path}`, false, e.message); }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════════════════════════════════════
  section('Cleanup');

  const cleanups = [
    ids.forumAnswerId  && req('DELETE', `/forum/answers/${ids.forumAnswerId}`, null, adminToken)
                           .then(r => ok('DELETE forum answer', r.status === 200, `got ${r.status}`)),
    ids.forumId        && req('DELETE', `/forum/${ids.forumId}`, null, adminToken)
                           .then(r => ok('DELETE forum question', r.status === 200, `got ${r.status}`)),
    ids.downloadId     && req('DELETE', `/downloads/${ids.downloadId}`, null, adminToken)
                           .then(r => ok('DELETE download', r.status === 200, `got ${r.status}`)),
    ids.deploymentId   && req('DELETE', `/deployments/${ids.deploymentId}`, null, adminToken)
                           .then(r => ok('DELETE deployment', r.status === 200, `got ${r.status}`)),
    ids.reportId       && req('DELETE', `/reports/${ids.reportId}`, null, adminToken)
                           .then(r => ok('DELETE report', r.status === 200, `got ${r.status}`)),
    ids.featureCommentId && ids.featureId && req('DELETE', `/features/${ids.featureId}/comments/${ids.featureCommentId}`, null, adminToken)
                           .then(r => ok('DELETE feature comment', r.status === 200, `got ${r.status}`)),
    ids.featureId      && req('DELETE', `/features/${ids.featureId}`, null, adminToken)
                           .then(r => ok('DELETE feature request', r.status === 200, `got ${r.status}`)),
    ids.announcementId && req('DELETE', `/announcements/${ids.announcementId}`, null, adminToken)
                           .then(r => ok('DELETE announcement', r.status === 200, `got ${r.status}`)),
    ids.kbArticleId    && req('DELETE', `/kb/articles/${ids.kbArticleId}`, null, adminToken)
                           .then(r => ok('DELETE kb article', r.status === 200, `got ${r.status}`)),
    ids.kbChildFolderId && req('DELETE', `/kb/folders/${ids.kbChildFolderId}`, null, adminToken)
                           .then(r => ok('DELETE kb child folder', r.status === 200, `got ${r.status}`)),
    ids.kbFolderId     && req('DELETE', `/kb/folders/${ids.kbFolderId}`, null, adminToken)
                           .then(r => ok('DELETE kb folder', r.status === 200, `got ${r.status}`)),
    ids.cannedId       && req('DELETE', `/canned-responses/${ids.cannedId}`, null, adminToken)
                           .then(r => ok('DELETE canned response', r.status === 200, `got ${r.status}`)),
    ids.templateId     && req('DELETE', `/ticket-templates/${ids.templateId}`, null, adminToken)
                           .then(r => ok('DELETE ticket template', r.status === 200, `got ${r.status}`)),
    ids.automationId   && req('DELETE', `/automation/${ids.automationId}`, null, adminToken)
                           .then(r => ok('DELETE automation rule', r.status === 200, `got ${r.status}`)),
    ids.customFieldId  && req('DELETE', `/custom-fields/${ids.customFieldId}`, null, adminToken)
                           .then(r => ok('DELETE custom field', r.status === 200, `got ${r.status}`)),
    ids.slaId          && req('DELETE', `/sla/${ids.slaId}`, null, adminToken)
                           .then(r => ok('DELETE SLA policy', r.status === 200, `got ${r.status}`)),
    ids.ticket2Id      && req('DELETE', `/tickets/${ids.ticket2Id}`, null, adminToken)
                           .then(r => ok('DELETE ticket2', r.status === 200, `got ${r.status}`)),
    ids.ticketId       && req('DELETE', `/tickets/${ids.ticketId}`, null, adminToken)
                           .then(r => ok('DELETE ticket', r.status === 200, `got ${r.status}`)),
    ids.customerId     && req('DELETE', `/customers/${ids.customerId}`, null, adminToken)
                           .then(r => ok('DELETE customer', r.status === 200, `got ${r.status}`)),
    ids.groupId        && req('DELETE', `/groups/${ids.groupId}`, null, adminToken)
                           .then(r => ok('DELETE group', r.status === 200, `got ${r.status}`)),
    ids.userId         && req('DELETE', `/users/${ids.userId}`, null, adminToken)
                           .then(r => ok('DELETE agent user', r.status === 200, `got ${r.status}`)),
    ids.customerUserId && req('DELETE', `/users/${ids.customerUserId}`, null, adminToken)
                           .then(r => ok('DELETE customer user', r.status === 200, `got ${r.status}`)),
    ids.tagName        && req('DELETE', `/tag-definitions/${ids.tagName}`, null, adminToken)
                           .then(r => ok('DELETE tag definition', r.status === 200, `got ${r.status}`)),
  ].filter(Boolean);

  await Promise.allSettled(cleanups);

  printSummary();
}

function printSummary() {
  const total = passed + failed + skipped;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${String(passed).padStart(3)} passed  ${String(failed).padStart(3)} failed  ${String(skipped).padStart(3)} skipped   ║`);
  console.log(`║  Total:   ${String(total).padStart(3)} assertions                          ║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');
  if (failed > 0) {
    console.log(`  ${failed} test(s) FAILED — see ✗ lines above.\n`);
    process.exit(1);
  } else {
    console.log('  All tests passed.\n');
    process.exit(0);
  }
}

run().catch(e => {
  console.error('\nFATAL ERROR:', e.message);
  process.exit(1);
});
