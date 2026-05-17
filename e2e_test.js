const http = require('http');

const BASE = 'http://localhost:3001/api';
let passed = 0, failed = 0, skipped = 0;
let adminToken = '';
let testTicketId, testGroupId, testUserId, testCustomerId;
let testKbFolderId, testKbArticleId;
let testAnnouncementId, testFeatureId;
let testSlaId, testAutomationId, testCustomFieldId;
let testCannedId, testTemplateId, testDeploymentId, testForumId;
let testProductId = 'helyx-platform-e2e'; // use a known product_id for deployments test

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001,
      path: '/api' + path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function ok(name, cond, details) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${details ? ' — ' + details : ''}`); failed++; }
}

function skip(name) { console.log(`  - ${name} (skipped)`); skipped++; }

async function run() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Helyx Support — Full E2E Test Suite');
  console.log('═══════════════════════════════════════════\n');

  // ── Health ─────────────────────────────────────────────────────────────────
  console.log('▶ Health');
  try {
    const r = await req('GET', '/health');
    ok('GET /health → 200', r.status === 200);
    ok('returns status:ok', r.body.status === 'ok');
  } catch(e) { ok('GET /health', false, e.message); }

  // ── Auth ───────────────────────────────────────────────────────────────────
  console.log('\n▶ Auth');
  try {
    const r = await req('POST', '/auth/dev-login', { email: 'admin@helyxtech.com' });
    ok('POST /auth/dev-login → 200', r.status === 200);
    ok('returns token', !!r.body.token);
    adminToken = r.body.token || '';
  } catch(e) { ok('dev-login', false, e.message); }
  try {
    const r = await req('POST', '/auth/dev-login', { email: 'nobody@nowhere.com' });
    ok('dev-login with unknown email → 403', r.status === 403);
  } catch(e) { skip('dev-login bad email'); }

  // ── Security: unauthenticated access blocked ───────────────────────────────
  console.log('\n▶ Security — Auth Enforcement');
  try {
    const r = await req('GET', '/tickets');
    ok('GET /tickets without token → 401', r.status === 401);
  } catch(e) { ok('unauth /tickets', false, e.message); }
  try {
    const r = await req('GET', '/users');
    ok('GET /users without token → 401', r.status === 401);
  } catch(e) { ok('unauth /users', false, e.message); }
  try {
    const r = await req('GET', '/deployments');
    ok('GET /deployments without token → 401', r.status === 401);
  } catch(e) { ok('unauth /deployments', false, e.message); }

  // ── Stats ──────────────────────────────────────────────────────────────────
  console.log('\n▶ Stats');
  try {
    const r = await req('GET', '/stats', null, adminToken);
    ok('GET /stats → 200', r.status === 200);
    ok('has total', typeof r.body.total === 'number');
    ok('has by_status', Array.isArray(r.body.by_status));
    ok('has by_priority', Array.isArray(r.body.by_priority));
  } catch(e) { ok('stats', false, e.message); }

  // ── Settings ───────────────────────────────────────────────────────────────
  console.log('\n▶ Settings');
  try {
    const r = await req('GET', '/settings', null, adminToken);
    ok('GET /settings → 200', r.status === 200);
    ok('has products key', 'products' in r.body);
    ok('has company_name', 'company_name' in r.body);
  } catch(e) { ok('settings GET', false, e.message); }
  try {
    const r = await req('PUT', '/settings', { company_name: 'Helyx E2E', products: JSON.stringify([]) }, adminToken);
    ok('PUT /settings → 200', r.status === 200);
  } catch(e) { ok('settings PUT', false, e.message); }

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log('\n▶ Users');
  try {
    const r = await req('GET', '/users', null, adminToken);
    ok('GET /users → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET users', false, e.message); }
  try {
    const r = await req('POST', '/users', { name: 'Test Agent', email: 'testagent_e2e@helyx.com', role: 'agent' }, adminToken);
    ok('POST /users → 201', r.status === 201);
    ok('has id', !!r.body.id);
    testUserId = r.body.id;
  } catch(e) { ok('POST users', false, e.message); }
  if (testUserId) {
    try {
      const r = await req('PUT', `/users/${testUserId}`, { name: 'Test Agent Updated', email: 'testagent_e2e@helyx.com', role: 'agent' }, adminToken);
      ok('PUT /users/:id → 200', r.status === 200);
    } catch(e) { ok('PUT users', false, e.message); }
    try {
      const r = await req('PATCH', `/users/${testUserId}/status`, { active: false }, adminToken);
      ok('PATCH /users/:id/status → 200', r.status === 200);
    } catch(e) { ok('PATCH users status', false, e.message); }
  }

  // ── Groups ─────────────────────────────────────────────────────────────────
  console.log('\n▶ Groups');
  try {
    const r = await req('GET', '/groups', null, adminToken);
    ok('GET /groups → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET groups', false, e.message); }
  try {
    const r = await req('POST', '/groups', { name: 'E2E Group', description: 'Test group' }, adminToken);
    ok('POST /groups → 201', r.status === 201);
    testGroupId = r.body.id;
  } catch(e) { ok('POST groups', false, e.message); }
  if (testGroupId) {
    try {
      const r = await req('PUT', `/groups/${testGroupId}`, { name: 'E2E Group Updated', description: 'x' }, adminToken);
      ok('PUT /groups/:id → 200', r.status === 200);
    } catch(e) { ok('PUT groups', false, e.message); }
    if (testUserId) {
      try {
        const r = await req('POST', `/groups/${testGroupId}/members`, { user_id: testUserId }, adminToken);
        ok('POST /groups/:id/members → 200/201', r.status <= 201);
      } catch(e) { ok('add group member', false, e.message); }
      try {
        const r = await req('DELETE', `/groups/${testGroupId}/members/${testUserId}`, null, adminToken);
        ok('DELETE /groups/:id/members/:uid → 200', r.status === 200);
      } catch(e) { ok('remove group member', false, e.message); }
    }
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  console.log('\n▶ Customers');
  try {
    const r = await req('GET', '/customers', null, adminToken);
    ok('GET /customers → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET customers', false, e.message); }
  try {
    const r = await req('POST', '/customers', {
      name: 'E2E Corp', email: 'e2ecorp@test.com',
      lifecycle_status: 'Potential', industry: 'Tech'
    }, adminToken);
    ok('POST /customers → 201', r.status === 201);
    testCustomerId = r.body.id;
  } catch(e) { ok('POST customers', false, e.message); }
  if (testCustomerId) {
    try {
      const r = await req('PUT', `/customers/${testCustomerId}`, {
        name: 'E2E Corp Updated', email: 'e2ecorp@test.com',
        lifecycle_status: 'Active', industry: 'Tech'
      }, adminToken);
      ok('PUT /customers/:id → 200', r.status === 200);
    } catch(e) { ok('PUT customers', false, e.message); }
    try {
      const r = await req('PATCH', `/customers/${testCustomerId}/status`, { active: false }, adminToken);
      ok('PATCH /customers/:id/status → 200', r.status === 200);
    } catch(e) { ok('PATCH customers status', false, e.message); }
  }
  // Bulk import
  try {
    const r = await req('POST', '/customers/bulk-import', {
      rows: [{ name: 'Bulk Corp', email: 'bulk_e2e@test.com' }]
    }, adminToken);
    ok('POST /customers/bulk-import → 200', r.status === 200);
    // Clean up bulk import customer
    const all = await req('GET', '/customers', null, adminToken);
    const bulk = (all.body || []).find(c => c.email === 'bulk_e2e@test.com');
    if (bulk) await req('DELETE', `/customers/${bulk.id}`, null, adminToken);
  } catch(e) { ok('bulk import customers', false, e.message); }

  // Lifecycle statuses check
  for (const [label, status] of [['Pilot', 'Pilot'], ['Onboarding', 'Onboarding'], ['Declined', 'Declined']]) {
    try {
      const r = await req('POST', '/customers', {
        name: `${label} Customer`, email: `${label.toLowerCase()}_e2e@test.com`, lifecycle_status: status
      }, adminToken);
      ok(`lifecycle_status ${label} accepted → 201`, r.status === 201);
      if (r.body.id) await req('DELETE', `/customers/${r.body.id}`, null, adminToken);
    } catch(e) { ok(`lifecycle ${label}`, false, e.message); }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────
  console.log('\n▶ Tickets');
  try {
    const r = await req('GET', '/tickets', null, adminToken);
    ok('GET /tickets → 200', r.status === 200);
    const body = r.body;
    ok('has tickets array', Array.isArray(body.tickets || body));
  } catch(e) { ok('GET tickets', false, e.message); }
  try {
    const r = await req('POST', '/tickets', {
      title: 'E2E Test Ticket',             // API field is "title" not "subject"
      description: 'Created by E2E suite',
      requester_email: 'e2e@test.com',
      requester_name: 'E2E Tester',
      priority: 'Medium',
      type: 'Bug / Incident',
    }, adminToken);
    ok('POST /tickets → 201', r.status === 201);
    testTicketId = r.body.id;
  } catch(e) { ok('POST tickets', false, e.message); }

  if (testTicketId) {
    try {
      const r = await req('GET', `/tickets/${testTicketId}`, null, adminToken);
      ok('GET /tickets/:id → 200', r.status === 200);
      ok('correct ticket', r.body.id === testTicketId);
    } catch(e) { ok('GET ticket by id', false, e.message); }
    try {
      const r = await req('PUT', `/tickets/${testTicketId}`, {
        status: 'In Investigation', priority: 'High'
      }, adminToken);
      ok('PUT /tickets/:id → 200', r.status === 200);
    } catch(e) { ok('PUT ticket', false, e.message); }

    // Comments
    try {
      const r = await req('POST', `/tickets/${testTicketId}/comments`, {
        author: 'E2E Agent', body: 'Test comment', is_public: false
      }, adminToken);
      ok('POST /tickets/:id/comments → 201', r.status === 201);
    } catch(e) { ok('POST comment', false, e.message); }

    // Tags
    try {
      const r = await req('POST', `/tickets/${testTicketId}/tags`, { tag: 'e2e-test' }, adminToken);
      ok('POST /tickets/:id/tags → 200', r.status === 200 || r.status === 201);
    } catch(e) { ok('POST tags', false, e.message); }
    try {
      const r = await req('GET', `/tickets/${testTicketId}/tags`, null, adminToken);
      ok('GET /tickets/:id/tags → 200', r.status === 200);
      ok('tag present', Array.isArray(r.body) && r.body.includes('e2e-test'));
    } catch(e) { ok('GET tags', false, e.message); }
    try {
      const r = await req('DELETE', `/tickets/${testTicketId}/tags/e2e-test`, null, adminToken);
      ok('DELETE /tickets/:id/tags/:tag → 200', r.status === 200);
    } catch(e) { ok('DELETE tag', false, e.message); }

    // Activity
    try {
      const r = await req('GET', `/tickets/${testTicketId}/activity`, null, adminToken);
      ok('GET /tickets/:id/activity → 200', r.status === 200);
      ok('activity is array', Array.isArray(r.body));
    } catch(e) { ok('GET activity', false, e.message); }

    // Ticket filter by email
    try {
      const r = await req('GET', `/tickets?requester_email=e2e%40test.com`, null, adminToken);
      ok('GET /tickets?requester_email → 200', r.status === 200);
    } catch(e) { ok('tickets by email', false, e.message); }

    // Ticket merge — nonexistent source returns 404 or 400
    try {
      const r = await req('POST', `/tickets/${testTicketId}/merge`, { source_ticket_id: 99999 }, adminToken);
      ok('merge with nonexistent source → 404/400', r.status === 404 || r.status === 400);
    } catch(e) { ok('merge nonexistent', false, e.message); }
  }

  // ── Knowledge Base ─────────────────────────────────────────────────────────
  console.log('\n▶ Knowledge Base');
  try {
    const r = await req('GET', '/kb/tree', null, adminToken);
    ok('GET /kb/tree → 200', r.status === 200);
    // Returns { folders: [...], files: [...], articles: [...] } or similar object
    ok('tree has folders key', r.body && typeof r.body === 'object' && ('folders' in r.body || Array.isArray(r.body)));
  } catch(e) { ok('GET kb tree', false, e.message); }
  try {
    const r = await req('POST', '/kb/folders', { name: 'E2E Folder', parent_id: null }, adminToken);
    ok('POST /kb/folders → 201', r.status === 201);
    testKbFolderId = r.body.id;
  } catch(e) { ok('POST kb folder', false, e.message); }
  if (testKbFolderId) {
    try {
      const r = await req('PUT', `/kb/folders/${testKbFolderId}`, { name: 'E2E Folder Updated' }, adminToken);
      ok('PUT /kb/folders/:id → 200', r.status === 200);
    } catch(e) { ok('PUT kb folder', false, e.message); }
    try {
      const r = await req('POST', '/kb/articles', {
        folder_id: testKbFolderId,
        title: 'E2E Article',
        content: 'This is a test article for E2E.',
        status: 'published'
      }, adminToken);
      ok('POST /kb/articles → 201', r.status === 201);
      testKbArticleId = r.body.id;
    } catch(e) { ok('POST kb article', false, e.message); }
    if (testKbArticleId) {
      try {
        const r = await req('GET', `/kb/articles/${testKbArticleId}`, null, adminToken);
        ok('GET /kb/articles/:id → 200', r.status === 200);
      } catch(e) { ok('GET kb article', false, e.message); }
      try {
        const r = await req('PUT', `/kb/articles/${testKbArticleId}`, {
          title: 'E2E Article Updated', content: 'Updated content.', status: 'published'
        }, adminToken);
        ok('PUT /kb/articles/:id → 200', r.status === 200);
      } catch(e) { ok('PUT kb article', false, e.message); }
    }
    try {
      const r = await req('GET', '/kb/articles/search?q=E2E', null, adminToken);
      ok('GET /kb/articles/search → 200', r.status === 200);
      ok('search returns array', Array.isArray(r.body));
    } catch(e) { ok('kb search', false, e.message); }
  }

  // ── Announcements ──────────────────────────────────────────────────────────
  console.log('\n▶ Announcements');
  try {
    const r = await req('GET', '/announcements/public');
    ok('GET /announcements/public (no auth) → 200', r.status === 200);
    ok('public returns array', Array.isArray(r.body));
  } catch(e) { ok('public announcements', false, e.message); }
  try {
    const r = await req('GET', '/announcements', null, adminToken);
    ok('GET /announcements → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET announcements', false, e.message); }
  try {
    const r = await req('POST', '/announcements', {
      title: 'E2E Announcement', body: 'Test announcement body.', is_public: true
    }, adminToken);
    ok('POST /announcements → 201', r.status === 201);
    testAnnouncementId = r.body.id;
  } catch(e) { ok('POST announcement', false, e.message); }
  if (testAnnouncementId) {
    try {
      const r = await req('PUT', `/announcements/${testAnnouncementId}`, {
        title: 'E2E Announcement Updated', body: 'Updated.', is_public: true
      }, adminToken);
      ok('PUT /announcements/:id → 200', r.status === 200);
    } catch(e) { ok('PUT announcement', false, e.message); }
  }

  // ── Feature Requests ───────────────────────────────────────────────────────
  console.log('\n▶ Feature Requests / Ideas Board');
  try {
    const r = await req('GET', '/features', null, adminToken);
    ok('GET /features → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET features', false, e.message); }
  try {
    const r = await req('POST', '/features', {
      title: 'E2E Feature Request',
      description: 'A test feature request.',
      submitter_email: 'e2e@test.com',
      product: 'Helyx Platform',
    }, adminToken);
    ok('POST /features → 201', r.status === 201);
    ok('has product field', !!r.body.product);
    testFeatureId = r.body.id;
  } catch(e) { ok('POST feature', false, e.message); }
  if (testFeatureId) {
    try {
      const r = await req('GET', `/features/${testFeatureId}`, null, adminToken);
      ok('GET /features/:id → 200', r.status === 200);
    } catch(e) { ok('GET feature', false, e.message); }
    try {
      // Valid statuses are: submitted, under_review, planned, in_progress, shipped, declined
      const r = await req('PUT', `/features/${testFeatureId}/status`, { status: 'under_review' }, adminToken);
      ok('PUT /features/:id/status → 200', r.status === 200);
    } catch(e) { ok('PUT feature status', false, e.message); }
    try {
      const r = await req('POST', `/features/${testFeatureId}/vote`, {}, adminToken);
      ok('POST /features/:id/vote → 200/201', r.status <= 201);
    } catch(e) { ok('vote feature', false, e.message); }
    try {
      const r = await req('POST', `/features/${testFeatureId}/comments`, {
        author: 'E2E', body: 'Test comment', author_email: 'e2e@test.com'
      }, adminToken);
      ok('POST /features/:id/comments → 201', r.status === 201);
    } catch(e) { ok('POST feature comment', false, e.message); }
  }

  // ── Deployments ────────────────────────────────────────────────────────────
  console.log('\n▶ Deployments');
  try {
    const r = await req('GET', '/deployments', null, adminToken);
    ok('GET /deployments → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET deployments', false, e.message); }
  try {
    // API shape: product_id (string), product_name, environment, version, status, notes
    const r = await req('POST', '/deployments', {
      product_id:   'helyx-platform',
      product_name: 'Helyx Platform',
      environment:  'UAT',
      version:      '1.0.0-e2e',
      status:       'Planned',
      notes:        'E2E test deployment',
      deployed_at:  new Date().toISOString(),
    }, adminToken);
    ok('POST /deployments → 201', r.status === 201);
    testDeploymentId = r.body.id;
  } catch(e) { ok('POST deployment', false, e.message); }
  if (testDeploymentId) {
    try {
      const r = await req('PUT', `/deployments/${testDeploymentId}`, {
        product_id:   'helyx-platform',
        product_name: 'Helyx Platform',
        environment:  'UAT',
        version:      '1.0.0-e2e',
        status:       'Completed',
        notes:        'Updated',
      }, adminToken);
      ok('PUT /deployments/:id → 200', r.status === 200);
    } catch(e) { ok('PUT deployment', false, e.message); }
    // Filter by product_id
    try {
      const r = await req('GET', '/deployments?product_id=helyx-platform', null, adminToken);
      ok('GET /deployments?product_id filter → 200', r.status === 200);
      ok('filter returns array', Array.isArray(r.body));
    } catch(e) { ok('deployment filter', false, e.message); }
  }

  // ── SLA Policies ───────────────────────────────────────────────────────────
  console.log('\n▶ SLA Policies');
  try {
    const r = await req('GET', '/sla', null, adminToken);
    ok('GET /sla → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET sla', false, e.message); }
  try {
    const r = await req('POST', '/sla', {
      name: 'E2E SLA',
      priority: 'High',
      first_response_hours: 4,
      resolution_hours: 24,
    }, adminToken);
    ok('POST /sla → 201', r.status === 201);
    testSlaId = r.body.id;
  } catch(e) { ok('POST sla', false, e.message); }
  if (testSlaId) {
    try {
      const r = await req('PUT', `/sla/${testSlaId}`, {
        name: 'E2E SLA Updated', priority: 'Medium',
        first_response_hours: 8, resolution_hours: 48
      }, adminToken);
      ok('PUT /sla/:id → 200', r.status === 200);
    } catch(e) { ok('PUT sla', false, e.message); }
    if (testTicketId) {
      try {
        const r = await req('GET', `/sla/ticket/${testTicketId}`, null, adminToken);
        ok('GET /sla/ticket/:id → 200', r.status === 200);
      } catch(e) { ok('GET ticket sla', false, e.message); }
    }
  }

  // ── Automation Rules ───────────────────────────────────────────────────────
  console.log('\n▶ Automation Rules');
  try {
    const r = await req('GET', '/automation', null, adminToken);
    ok('GET /automation → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET automation', false, e.message); }
  try {
    const r = await req('POST', '/automation', {
      name: 'E2E Rule',
      trigger_event: 'ticket.created',
      conditions: [],
      actions: [{ type: 'set_priority', value: 'High' }],
      active: 1,
    }, adminToken);
    ok('POST /automation → 201', r.status === 201);
    testAutomationId = r.body.id;
  } catch(e) { ok('POST automation', false, e.message); }
  if (testAutomationId) {
    try {
      const r = await req('PATCH', `/automation/${testAutomationId}/toggle`, { active: false }, adminToken);
      ok('PATCH /automation/:id/toggle → 200', r.status === 200);
    } catch(e) { ok('toggle automation', false, e.message); }
    try {
      const r = await req('PUT', `/automation/${testAutomationId}`, {
        name: 'E2E Rule Updated',
        trigger_event: 'ticket.created',
        conditions: [],
        actions: [],
        active: 0,
      }, adminToken);
      ok('PUT /automation/:id → 200', r.status === 200);
    } catch(e) { ok('PUT automation', false, e.message); }
  }

  // ── Custom Fields ──────────────────────────────────────────────────────────
  console.log('\n▶ Custom Fields');
  try {
    const r = await req('GET', '/custom-fields', null, adminToken);
    ok('GET /custom-fields → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET custom fields', false, e.message); }
  try {
    const r = await req('POST', '/custom-fields', {
      label: 'E2E Field ' + Date.now(), field_type: 'text', required: false, applies_to: 'ticket'
    }, adminToken);
    ok('POST /custom-fields → 201', r.status === 201);
    testCustomFieldId = r.body.id;
  } catch(e) { ok('POST custom field', false, e.message); }
  if (testCustomFieldId && testTicketId) {
    try {
      const r = await req('PUT', `/custom-fields/ticket/${testTicketId}`, {
        fields: [{ field_id: testCustomFieldId, value: 'test-value' }]
      }, adminToken);
      ok('PUT /custom-fields/ticket/:id → 200', r.status === 200);
    } catch(e) { ok('save ticket custom fields', false, e.message); }
    try {
      const r = await req('GET', `/custom-fields/ticket/${testTicketId}`, null, adminToken);
      ok('GET /custom-fields/ticket/:id → 200', r.status === 200);
    } catch(e) { ok('GET ticket custom fields', false, e.message); }
  }

  // ── Canned Responses ───────────────────────────────────────────────────────
  console.log('\n▶ Canned Responses');
  try {
    const r = await req('GET', '/canned-responses', null, adminToken);
    ok('GET /canned-responses → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET canned responses', false, e.message); }
  try {
    const r = await req('POST', '/canned-responses', {
      title: 'E2E Canned', body: 'This is a canned response.'
    }, adminToken);
    ok('POST /canned-responses → 201', r.status === 201);
    testCannedId = r.body.id;
  } catch(e) { ok('POST canned response', false, e.message); }
  if (testCannedId) {
    try {
      const r = await req('PUT', `/canned-responses/${testCannedId}`, {
        title: 'E2E Canned Updated', body: 'Updated.'
      }, adminToken);
      ok('PUT /canned-responses/:id → 200', r.status === 200);
    } catch(e) { ok('PUT canned response', false, e.message); }
  }

  // ── Ticket Templates ───────────────────────────────────────────────────────
  console.log('\n▶ Ticket Templates');
  try {
    const r = await req('GET', '/ticket-templates', null, adminToken);
    ok('GET /ticket-templates → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET ticket templates', false, e.message); }
  try {
    const r = await req('POST', '/ticket-templates', {
      name: 'E2E Template',
      subject: 'Test template subject',
      description: 'Test template desc',
      type: 'Bug / Incident',
      priority: 'Medium',
    }, adminToken);
    ok('POST /ticket-templates → 201', r.status === 201);
    testTemplateId = r.body.id;
  } catch(e) { ok('POST ticket template', false, e.message); }
  if (testTemplateId) {
    try {
      const r = await req('PUT', `/ticket-templates/${testTemplateId}`, {
        name: 'E2E Template Updated', subject: 'Updated subject',
        type: 'Question / How-To', priority: 'Low'
      }, adminToken);
      ok('PUT /ticket-templates/:id → 200', r.status === 200);
    } catch(e) { ok('PUT ticket template', false, e.message); }
  }

  // ── Email Templates ────────────────────────────────────────────────────────
  console.log('\n▶ Email Templates');
  try {
    const r = await req('GET', '/email-templates', null, adminToken);
    ok('GET /email-templates → 200', r.status === 200);
    ok('is object or array', typeof r.body === 'object');
  } catch(e) { ok('GET email templates', false, e.message); }

  // ── CSAT ───────────────────────────────────────────────────────────────────
  console.log('\n▶ CSAT');
  try {
    const r = await req('GET', '/csat/stats', null, adminToken);
    ok('GET /csat/stats → 200', r.status === 200);
  } catch(e) { ok('GET csat stats', false, e.message); }
  if (testTicketId) {
    try {
      const r = await req('GET', `/csat/ticket/${testTicketId}`, null, adminToken);
      ok('GET /csat/ticket/:id → 200', r.status === 200);
    } catch(e) { ok('GET csat ticket', false, e.message); }
  }

  // ── System Status ──────────────────────────────────────────────────────────
  console.log('\n▶ System Status');
  try {
    const r = await req('GET', '/status');
    ok('GET /status (public) → 200', r.status === 200);
    ok('has body', r.body && typeof r.body === 'object');
  } catch(e) { ok('GET status', false, e.message); }

  // ── Downloads ──────────────────────────────────────────────────────────────
  console.log('\n▶ Downloads');
  try {
    const r = await req('GET', '/downloads');
    ok('GET /downloads (public) → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET downloads public', false, e.message); }
  try {
    const r = await req('GET', '/downloads/all', null, adminToken);
    ok('GET /downloads/all (auth) → 200', r.status === 200);
    ok('returns array', Array.isArray(r.body));
  } catch(e) { ok('GET downloads all', false, e.message); }

  // ── Forum ──────────────────────────────────────────────────────────────────
  console.log('\n▶ Community Forum');
  try {
    const r = await req('GET', '/forum', null, adminToken);
    ok('GET /forum → 200', r.status === 200);
    const body = r.body;
    ok('has questions', Array.isArray(body) || (body && Array.isArray(body.questions)));
  } catch(e) { ok('GET forum', false, e.message); }
  try {
    const r = await req('POST', '/forum', {
      title: 'E2E Forum Question',
      body: 'Is this a test?',
      author: 'E2E Tester',
      author_email: 'e2e@test.com',
    }, adminToken);
    ok('POST /forum → 201', r.status === 201);
    testForumId = r.body.id;
  } catch(e) { ok('POST forum question', false, e.message); }
  if (testForumId) {
    try {
      const r = await req('GET', `/forum/${testForumId}`, null, adminToken);
      ok('GET /forum/:id → 200', r.status === 200);
    } catch(e) { ok('GET forum question', false, e.message); }
    try {
      const r = await req('POST', `/forum/${testForumId}/answers`, {
        body: 'Yes, it is!', author: 'Agent', author_email: 'agent@helyx.com'
      }, adminToken);
      ok('POST /forum/:id/answers → 201', r.status === 201);
      if (r.body.id || r.body.answer_id) {
        const answerId = r.body.id || r.body.answer_id;
        try {
          const ar = await req('PATCH', `/forum/answers/${answerId}/accept`, {}, adminToken);
          ok('PATCH /forum/answers/:id/accept → 200', ar.status === 200);
        } catch(e) { ok('accept forum answer', false, e.message); }
      }
    } catch(e) { ok('POST forum answer', false, e.message); }
  }

  // ── Security Edge Cases ────────────────────────────────────────────────────
  console.log('\n▶ Security Edge Cases');
  try {
    const r = await req('POST', `/tickets/${testTicketId || 1}/tags`, { tag: 'hack' });
    ok('POST tags without auth → 401', r.status === 401);
  } catch(e) { ok('unauth tags', false, e.message); }
  try {
    const r = await req('GET', '/tickets/99999', null, adminToken);
    ok('GET /tickets/99999 → 404', r.status === 404);
  } catch(e) { ok('ticket 404', false, e.message); }


  // ── Cleanup ────────────────────────────────────────────────────────────────
  console.log('\n▶ Cleanup');
  const cleanups = [
    testForumId     && req('DELETE', `/forum/${testForumId}`, null, adminToken).then(r => ok(`DELETE forum`, r.status === 200)),
    testDeploymentId && req('DELETE', `/deployments/${testDeploymentId}`, null, adminToken).then(r => ok(`DELETE deployment`, r.status === 200)),
    testFeatureId   && req('DELETE', `/features/${testFeatureId}`, null, adminToken).then(r => ok(`DELETE feature`, r.status === 200)),
    testAnnouncementId && req('DELETE', `/announcements/${testAnnouncementId}`, null, adminToken).then(r => ok(`DELETE announcement`, r.status === 200)),
    testKbArticleId && req('DELETE', `/kb/articles/${testKbArticleId}`, null, adminToken).then(r => ok(`DELETE kb article`, r.status === 200)),
    testKbFolderId  && req('DELETE', `/kb/folders/${testKbFolderId}`, null, adminToken).then(r => ok(`DELETE kb folder`, r.status === 200)),
    testTemplateId  && req('DELETE', `/ticket-templates/${testTemplateId}`, null, adminToken).then(r => ok(`DELETE ticket template`, r.status === 200)),
    testCannedId    && req('DELETE', `/canned-responses/${testCannedId}`, null, adminToken).then(r => ok(`DELETE canned response`, r.status === 200)),
    testAutomationId && req('DELETE', `/automation/${testAutomationId}`, null, adminToken).then(r => ok(`DELETE automation`, r.status === 200)),
    testCustomFieldId && req('DELETE', `/custom-fields/${testCustomFieldId}`, null, adminToken).then(r => ok(`DELETE custom field`, r.status === 200)),
    testSlaId       && req('DELETE', `/sla/${testSlaId}`, null, adminToken).then(r => ok(`DELETE sla`, r.status === 200)),
    testTicketId    && req('DELETE', `/tickets/${testTicketId}`, null, adminToken).then(r => ok(`DELETE ticket`, r.status === 200)),
    testCustomerId  && req('DELETE', `/customers/${testCustomerId}`, null, adminToken).then(r => ok(`DELETE customer`, r.status === 200)),
    testGroupId     && req('DELETE', `/groups/${testGroupId}`, null, adminToken).then(r => ok(`DELETE group`, r.status === 200)),
    testUserId      && req('DELETE', `/users/${testUserId}`, null, adminToken).then(r => ok(`DELETE user`, r.status === 200)),
  ].filter(Boolean);
  await Promise.all(cleanups);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('═══════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
