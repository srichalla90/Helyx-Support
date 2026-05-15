/**
 * emailNotifications.js — Template-based email notification service
 */
const db    = require('../db');
const graph = require('./graph');

function getSetting(key) {
  try {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : null;
  } catch (_) { return null; }
}

function getTemplate(key) {
  try {
    const r = db.prepare('SELECT * FROM email_templates WHERE key = ? AND enabled = 1').get(key);
    return r || null;
  } catch (_) { return null; }
}

function render(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v || '');
  }
  return out;
}

async function send(templateKey, vars) {
  if (!graph.isConfigured()) return; // silently skip if Graph not set up
  const tpl = getTemplate(templateKey);
  if (!tpl) return;

  const companyName  = getSetting('company_name') || 'Helyx';
  const supportEmail = getSetting('support_email') || '';

  const allVars = { company_name: companyName, support_email: supportEmail, ...vars };

  const subject = render(tpl.subject, allVars);
  const htmlBody = render(tpl.body, allVars);

  try {
    await graph.sendNotification({ to: Array.isArray(vars.to) ? vars.to : [vars.to], subject, htmlBody });
  } catch (e) {
    console.warn(`⚠️  Email notification [${templateKey}] failed:`, e.message);
  }
}

// ── Specific notification helpers ─────────────────────────────────────────────

async function notifyTicketCreated(ticket) {
  if (!ticket.requester_email) return;
  await send('ticket_created_customer', {
    to:              ticket.requester_email,
    ticket_id:       String(ticket.id),
    ticket_title:    ticket.title,
    requester_email: ticket.requester_email,
    priority:        ticket.priority || 'Medium',
    type:            ticket.type || '',
    status:          ticket.status || 'Open',
    portal_url:      getSetting('portal_url') || '#',
  });
}

async function notifyTicketAssigned(ticket, agentName, agentEmail) {
  if (!agentEmail) return;
  await send('ticket_assigned_agent', {
    to:              agentEmail,
    ticket_id:       String(ticket.id),
    ticket_title:    ticket.title,
    requester_email: ticket.requester_email || '—',
    priority:        ticket.priority || 'Medium',
    type:            ticket.type || '',
    status:          ticket.status || 'Open',
    agent_name:      agentName,
  });
}

async function notifyTicketResolved(ticket) {
  if (!ticket.requester_email) return;
  await send('ticket_resolved_customer', {
    to:              ticket.requester_email,
    ticket_id:       String(ticket.id),
    ticket_title:    ticket.title,
    requester_email: ticket.requester_email,
    status:          'Resolved',
    portal_url:      getSetting('portal_url') || '#',
  });
}

async function notifyTicketClosed(ticket) {
  if (!ticket.requester_email) return;
  await send('ticket_closed_customer', {
    to:              ticket.requester_email,
    ticket_id:       String(ticket.id),
    ticket_title:    ticket.title,
    requester_email: ticket.requester_email,
    status:          'Closed',
    portal_url:      getSetting('portal_url') || '#',
  });
}

async function notifyNewTicketFromEmail(ticket, agentEmails) {
  if (!agentEmails || agentEmails.length === 0) return;
  const appUrl = process.env.WEBHOOK_BASE_URL || getSetting('portal_url') || '';
  await send('new_ticket_agent', {
    to:              agentEmails,
    ticket_id:       String(ticket.id),
    ticket_title:    ticket.title,
    requester_email: ticket.requester_email || '—',
    body_preview:    (ticket.description || '').slice(0, 300),
    app_url:         appUrl,
  });
}

async function notifyAgentMentioned(ticket, mentionedAgentEmail, mentionedAgentName, mentionedByName, commentPreview) {
  if (!mentionedAgentEmail) return;
  const appUrl = process.env.WEBHOOK_BASE_URL || getSetting('portal_url') || '';
  await send('agent_mentioned', {
    to:              mentionedAgentEmail,
    agent_name:      mentionedAgentName,
    mentioned_by:    mentionedByName,
    ticket_id:       String(ticket.id),
    ticket_title:    ticket.title,
    comment_preview: commentPreview || '',
    app_url:         appUrl,
  });
}

module.exports = {
  notifyTicketCreated,
  notifyTicketAssigned,
  notifyTicketResolved,
  notifyTicketClosed,
  notifyNewTicketFromEmail,
  notifyAgentMentioned,
};
