/**
 * server/routes/devops.js — Azure DevOps integration
 *
 * POST /api/devops/create-work-item
 *   Creates a Bug or Task in the specified ADO project and links the returned
 *   work-item ID back to the Helyx ticket's "ADO Bug ID" custom field.
 *
 * Environment variables required in server/.env:
 *   ADO_ORG_URL          e.g. https://dev.azure.com/yourorg
 *   ADO_PAT              Personal Access Token (Work Items: Read & Write)
 *   ADO_PROJECT_HELYX_PLATFORM   "Quality System"
 *   ADO_PROJECT_HELYX_DATA       "HelyxData"
 */

'use strict';

const express  = require('express');
const https    = require('https');
const db = require('../db');

const router     = express.Router();
const requireAuth = require('../middleware/requireAuth');
const staffOnly   = require('../middleware/staffOnly');

// ── ADO config ────────────────────────────────────────────────────────────────
const ADO_ORG_URL            = (process.env.ADO_ORG_URL || '').replace(/\/$/, '');
const ADO_PAT                = process.env.ADO_PAT || '';
const ADO_PROJECT_HELYX_PLATFORM = process.env.ADO_PROJECT_HELYX_PLATFORM || 'Quality System';
const ADO_PROJECT_HELYX_DATA     = process.env.ADO_PROJECT_HELYX_DATA     || 'HelyxData';

// Product name → ADO project mapping (case-insensitive contains)
const PROJECT_MAP = [
  { match: 'helyx platform', adoProject: ADO_PROJECT_HELYX_PLATFORM, label: 'Helyx Platform' },
  { match: 'helyx data',     adoProject: ADO_PROJECT_HELYX_DATA,     label: 'Helyx Data'     },
];

/** Suggest ADO project from ticket's product field */
function suggestProject(product) {
  if (!product) return null;
  const p = product.toLowerCase();
  for (const entry of PROJECT_MAP) {
    if (p.includes(entry.match)) return entry.adoProject;
  }
  return null;
}

/** Low-level HTTP helper — accepts any full URL string */
function adoFetch(method, fullUrl, body) {
  return new Promise((resolve, reject) => {
    const token  = Buffer.from(':' + ADO_PAT).toString('base64');
    const data   = body ? JSON.stringify(body) : null;
    const url    = new URL(fullUrl);

    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        Authorization:  'Basic ' + token,
        'Content-Type': method === 'PATCH'
          ? 'application/json-patch+json'
          : 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.message || parsed.errorMessage || `ADO API error ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`ADO API returned non-JSON (status ${res.statusCode})`));
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** Call the ADO REST API (dev.azure.com) — delegates to adoFetch */
function adoRequest(method, path, body) {
  return adoFetch(method, `${ADO_ORG_URL}/${path}`, body);
}

/** Extract org name from ADO_ORG_URL (https://dev.azure.com/MyOrg → MyOrg) */
function getOrgName() {
  return ADO_ORG_URL.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
}

/** Call the ADO Release Management API (vsrm.dev.azure.com) */
function adoVsrmRequest(project, relPath) {
  const org = getOrgName();
  const encodedProject = encodeURIComponent(project);
  const url = `https://vsrm.dev.azure.com/${org}/${encodedProject}/_apis/${relPath}`;
  return adoFetch('GET', url, null);
}

// ── GET /api/devops/work-item-state/:workItemId ───────────────────────────────
// Fetches the live state of an ADO work item (org-scoped, works across all projects).
router.get('/work-item-state/:workItemId', requireAuth, staffOnly, async (req, res) => {
  const { workItemId } = req.params;
  if (!workItemId || !/^\d+$/.test(workItemId)) {
    return res.status(400).json({ error: 'Invalid workItemId' });
  }
  if (!ADO_ORG_URL || !ADO_PAT) {
    return res.status(503).json({ error: 'Azure DevOps is not configured' });
  }
  try {
    // Org-level endpoint — works across all projects without needing the project name
    const apiPath = `_apis/wit/workitems/${workItemId}?api-version=7.1&$select=System.State,System.WorkItemType,System.Title,System.TeamProject`;
    const workItem = await adoRequest('GET', apiPath, null);
    const project  = workItem.fields?.['System.TeamProject'] || null;
    const encodedProject = project ? encodeURIComponent(project) : '';
    const workItemUrl = workItem._links?.html?.href
      || (project ? `${ADO_ORG_URL}/${encodedProject}/_workitems/edit/${workItemId}` : null);
    res.json({
      state:        workItem.fields?.['System.State']       || null,
      workItemType: workItem.fields?.['System.WorkItemType'] || null,
      title:        workItem.fields?.['System.Title']        || null,
      project,
      workItemUrl,
      workItemId:   String(workItemId),
    });
  } catch (err) {
    console.error('[ADO] work-item-state error:', err.message);
    res.status(502).json({ error: `ADO error: ${err.message}` });
  }
});

// ── GET /api/devops/releases ──────────────────────────────────────────────────
// Fetches Classic Releases from both ADO projects, merged and sorted newest-first.
// Query params:
//   top        (default 30) — max releases per project
//   definition (optional)   — filter by release definition ID
router.get('/releases', requireAuth, staffOnly, async (req, res) => {
  if (!ADO_ORG_URL || !ADO_PAT) {
    return res.status(503).json({ error: 'Azure DevOps is not configured' });
  }

  // Fetch a larger batch since we filter to keepForever=true server-side.
  // ADO doesn't support keepForever as a query param, so we over-fetch and filter.
  const top = Math.min(Number(req.query.top) || 100, 200);
  const projects = [
    { name: ADO_PROJECT_HELYX_PLATFORM, label: 'Helyx Platform' },
    { name: ADO_PROJECT_HELYX_DATA,     label: 'Helyx Data'     },
  ];

  const results = await Promise.allSettled(
    projects.map(async ({ name, label }) => {
      const qs = `release/releases?api-version=7.1&$top=${top}&$expand=environments,artifacts&$orderby=createdOn desc`;
      const data = await adoVsrmRequest(name, qs);
      return { project: name, projectLabel: label, releases: data.value || [] };
    })
  );

  const releases = [];
  const errors   = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const rel of r.value.releases) {
        // Only include releases marked "Retain Indefinitely" in ADO.
        // Strict === true check: undefined / false / null all excluded.
        if (rel.keepForever !== true) continue;

        releases.push({
          id:           rel.id,
          name:         rel.name,
          status:       rel.status,        // Active | Abandoned
          keepForever:  true,              // always true here (we filtered above)
          createdOn:    rel.createdOn,
          createdBy:    rel.createdBy?.displayName || null,
          definition:   rel.releaseDefinition?.name || null,
          definitionId: rel.releaseDefinition?.id || null,
          webUrl:       rel._links?.web?.href
                          || rel.releaseDefinition?._links?.web?.href
                          || null,
          project:      r.value.project,
          projectLabel: r.value.projectLabel,
          // Environments — name + deploymentStatus
          environments: (rel.environments || []).map((e) => ({
            id:         e.id,
            name:       e.name,
            status:     e.status,          // notStarted | inProgress | succeeded | rejected | canceled | etc.
            deployedOn: e.deploySteps?.[e.deploySteps.length - 1]?.lastModifiedOn || null,
          })),
          // First artifact's build number as the version string
          buildVersion: rel.artifacts?.[0]?.definitionReference?.version?.name
                          || rel.artifacts?.[0]?.definitionReference?.buildId?.name
                          || null,
          buildBranch:  rel.artifacts?.[0]?.definitionReference?.branch?.name || null,
        });
      }
    } else {
      errors.push(r.reason?.message || 'Unknown error');
    }
  }

  // Sort combined list newest-first
  releases.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

  res.json({ releases, errors: errors.length ? errors : undefined });
});

// ── GET /api/devops/release-definitions ───────────────────────────────────────
// Returns release pipeline definitions for populating a filter dropdown.
router.get('/release-definitions', requireAuth, staffOnly, async (req, res) => {
  if (!ADO_ORG_URL || !ADO_PAT) {
    return res.status(503).json({ error: 'Azure DevOps is not configured' });
  }
  const projects = [
    { name: ADO_PROJECT_HELYX_PLATFORM, label: 'Helyx Platform' },
    { name: ADO_PROJECT_HELYX_DATA,     label: 'Helyx Data'     },
  ];
  const results = await Promise.allSettled(
    projects.map(async ({ name, label }) => {
      const data = await adoVsrmRequest(name, 'release/definitions?api-version=7.1&$top=50');
      return { project: name, projectLabel: label, definitions: data.value || [] };
    })
  );
  const definitions = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const d of r.value.definitions) {
        definitions.push({ id: d.id, name: d.name, project: r.value.project, projectLabel: r.value.projectLabel });
      }
    }
  }
  res.json({ definitions });
});

// ── GET /api/devops/config ────────────────────────────────────────────────────
// Returns the two available ADO projects so the frontend can populate the dropdown.
router.get('/config', requireAuth, staffOnly, (req, res) => {
  const configured = Boolean(ADO_ORG_URL && ADO_PAT);
  res.json({
    configured,
    projects: [
      { label: 'Helyx Platform', value: ADO_PROJECT_HELYX_PLATFORM },
      { label: 'Helyx Data',     value: ADO_PROJECT_HELYX_DATA     },
    ],
    workItemTypes: ['Bug', 'Task'],
  });
});

// ── GET /api/devops/suggest/:ticketId ─────────────────────────────────────────
// Returns the suggested ADO project based on the ticket's product field.
router.get('/suggest/:ticketId', requireAuth, staffOnly, (req, res) => {

  const id     = Number(req.params.ticketId);
  if (!id || id < 1) return res.status(400).json({ error: 'Invalid ticket ID' });

  const ticket = db.prepare('SELECT product, type FROM tickets WHERE id = ?').get(id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const suggested = suggestProject(ticket.product);
  const suggestedType = ticket.type === 'bug' ? 'Bug' : 'Task';

  res.json({ suggested, suggestedType, product: ticket.product });
});

// ── POST /api/devops/create-work-item ─────────────────────────────────────────
router.post('/create-work-item', requireAuth, staffOnly, async (req, res) => {
  const { ticketId, adoProject, workItemType } = req.body;

  // ── Validate inputs ────────────────────────────────────────────────────────
  if (!ticketId)    return res.status(400).json({ error: 'ticketId is required' });
  if (!adoProject)  return res.status(400).json({ error: 'adoProject is required' });
  if (!workItemType) return res.status(400).json({ error: 'workItemType is required' });

  const validProjects = [ADO_PROJECT_HELYX_PLATFORM, ADO_PROJECT_HELYX_DATA];
  if (!validProjects.includes(adoProject)) {
    return res.status(400).json({ error: `Invalid ADO project. Must be one of: ${validProjects.join(', ')}` });
  }

  const validTypes = ['Bug', 'Task'];
  if (!validTypes.includes(workItemType)) {
    return res.status(400).json({ error: 'workItemType must be Bug or Task' });
  }

  if (!ADO_ORG_URL || !ADO_PAT) {
    return res.status(503).json({ error: 'Azure DevOps is not configured. Set ADO_ORG_URL and ADO_PAT in server/.env' });
  }

  // ── Load ticket ────────────────────────────────────────────────────────────

  const ticket = db.prepare(`
    SELECT t.*, c.name AS customer_name
    FROM tickets t
    LEFT JOIN customers c ON c.id = t.customer_id
    WHERE t.id = ?
  `).get(Number(ticketId));

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  // ── Map priority to ADO Microsoft.VSTS.Common.Priority (1–4) ─────────────
  const priorityMap = { urgent: 1, high: 2, medium: 3, low: 4 };
  const adoPriority = priorityMap[ticket.priority] || 2;

  // ── Build description HTML ─────────────────────────────────────────────────
  const descHtml = [
    `<b>Helyx Ticket #${ticket.id}</b><br>`,
    ticket.description
      ? `<p>${ticket.description.replace(/\n/g, '<br>')}</p>`
      : '',
    `<br><b>Source:</b> ${ticket.source || 'N/A'}`,
    `<br><b>Priority:</b> ${ticket.priority || 'N/A'}`,
    `<br><b>Type:</b> ${ticket.type || 'N/A'}`,
    ticket.customer_name ? `<br><b>Customer:</b> ${ticket.customer_name}` : '',
    ticket.requester_email ? `<br><b>Requester:</b> ${ticket.requester_email}` : '',
  ].join('');

  // ── ADO PATCH body (JSON Patch format) ────────────────────────────────────
  const patchDoc = [
    { op: 'add', path: '/fields/System.Title',                      value: `[Helyx #${ticket.id}] ${ticket.title}` },
    { op: 'add', path: '/fields/System.Description',                value: descHtml },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority',    value: adoPriority },
    { op: 'add', path: '/fields/System.Tags',                       value: `helyx;helyx-${ticket.id}` },
  ];

  // ── Call ADO API ───────────────────────────────────────────────────────────
  try {
    const encodedProject  = encodeURIComponent(adoProject);
    const encodedType     = encodeURIComponent(workItemType);
    // No leading slash — adoRequest prepends ADO_ORG_URL + '/' so the org is preserved
    const apiPath = `${encodedProject}/_apis/wit/workitems/$${encodedType}?api-version=7.1`;

    const workItem = await adoRequest('PATCH', apiPath, patchDoc);

    const workItemId  = workItem.id;
    const workItemUrl = workItem._links?.html?.href || `${ADO_ORG_URL}/${encodedProject}/_workitems/edit/${workItemId}`;

    // ── Save work item ID into the ticket's ADO Bug ID custom field ───────
    // Find the field definition for ado_bug_id
    const fieldDef = db.prepare(`SELECT id FROM custom_field_definitions WHERE name = 'ado_bug_id' LIMIT 1`).get();
    if (fieldDef) {
      db.prepare(`
        INSERT INTO ticket_custom_fields (ticket_id, field_id, value)
        VALUES (?, ?, ?)
        ON CONFLICT(ticket_id, field_id) DO UPDATE SET value = excluded.value
      `).run(Number(ticketId), fieldDef.id, String(workItemId));
    }

    // Persist work item ID, URL, and type onto the ticket row so they survive page refresh
    try {
      db.prepare('UPDATE tickets SET ado_bug_id = ?, ado_work_item_url = ?, ado_work_item_type = ? WHERE id = ?')
        .run(String(workItemId), workItemUrl, workItemType, Number(ticketId));
    } catch (_) { /* columns may not exist yet — safe to ignore */ }

    // Log activity on the ticket
    try {
      const actorName = req.user?.name || req.user?.email || 'System';
      db.prepare(`
        INSERT INTO ticket_activity (ticket_id, actor, field, old_value, new_value, created_at)
        VALUES (?, ?, 'ado_work_item', NULL, ?, datetime('now'))
      `).run(Number(ticketId), actorName, `${workItemType} #${workItemId} in ${adoProject}`);
    } catch (_) { /* activity log is non-critical */ }

    return res.json({
      workItemId,
      workItemUrl,
      workItemType,
      adoProject,
      title: `[Helyx #${ticket.id}] ${ticket.title}`,
    });

  } catch (err) {
    console.error('[ADO] create-work-item error:', err.message);
    return res.status(502).json({ error: `Azure DevOps error: ${err.message}` });
  }
});

// ── GET /api/devops/releases-debug ───────────────────────────────────────────
// Returns raw keepForever + id + name for the last 20 releases per project.
// Useful for verifying what ADO actually sends for the keepForever field.
router.get('/releases-debug', requireAuth, staffOnly, async (req, res) => {
  if (!ADO_ORG_URL || !ADO_PAT) return res.status(503).json({ error: 'ADO not configured' });
  const projects = [
    { name: ADO_PROJECT_HELYX_PLATFORM, label: 'Helyx Platform' },
    { name: ADO_PROJECT_HELYX_DATA,     label: 'Helyx Data'     },
  ];
  const out = {};
  await Promise.allSettled(projects.map(async ({ name, label }) => {
    try {
      const data = await adoVsrmRequest(name, 'release/releases?api-version=7.1&$top=20&$orderby=createdOn desc');
      out[label] = (data.value || []).map((r) => ({
        id: r.id, name: r.name, keepForever: r.keepForever, status: r.status, createdOn: r.createdOn,
      }));
    } catch (e) { out[label] = { error: e.message }; }
  }));
  res.json(out);
});

module.exports = router;
