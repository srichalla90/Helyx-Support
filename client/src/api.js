const BASE = '/api';

// Read the app JWT from localStorage (set after successful Azure login exchange)
function getAuthHeader() {
  const token = localStorage.getItem('helyx_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...options.headers,
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth — exchange Microsoft ID token for our app JWT
  // Called once after Microsoft SSO completes
  azureLogin: (idToken) => request('/auth/azure', {
    method: 'POST',
    body: { idToken },
  }),

  // Dev-only — bypass SSO with a plain email (blocked in production)
  devLogin: (email) => request('/auth/dev-login', {
    method: 'POST',
    body: { email },
  }),

  // Tickets
  getTickets:  (params = {}) => request('/tickets?' + new URLSearchParams(params)),
  getTicket:   (id, params = {}) => request(`/tickets/${id}` + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  createTicket:(body) => request('/tickets', { method: 'POST', body }),
  updateTicket:(id, body) => request(`/tickets/${id}`, { method: 'PUT', body }),
  deleteTicket:(id) => request(`/tickets/${id}`, { method: 'DELETE' }),
  addComment:  (id, body) => request(`/tickets/${id}/comments`, { method: 'POST', body }),
  // body shape: { author, body, is_public }  (is_public: true = reply to customer, false = internal note)

  // Groups
  getGroups:        () => request('/groups'),
  createGroup:      (body) => request('/groups', { method: 'POST', body }),
  updateGroup:      (id, body) => request(`/groups/${id}`, { method: 'PUT', body }),
  setGroupActive:   (id, active) => request(`/groups/${id}/status`, { method: 'PATCH', body: { active } }),
  deleteGroup:      (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  getGroupMembers:  (id) => request(`/groups/${id}/members`),
  addGroupMember:   (id, user_id) => request(`/groups/${id}/members`, { method: 'POST', body: { user_id } }),
  removeGroupMember:(id, uid) => request(`/groups/${id}/members/${uid}`, { method: 'DELETE' }),

  // Users
  getUsers:      () => request('/users'),
  createUser:    (body) => request('/users', { method: 'POST', body }),
  updateUser:    (id, body) => request(`/users/${id}`, { method: 'PUT', body }),
  setUserActive: (id, active) => request(`/users/${id}/status`, { method: 'PATCH', body: { active } }),
  deleteUser:    (id) => request(`/users/${id}`, { method: 'DELETE' }),

  // Customers
  getCustomers:       () => request('/customers'),
  createCustomer:     (body) => request('/customers', { method: 'POST', body }),
  updateCustomer:     (id, body) => request(`/customers/${id}`, { method: 'PUT', body }),
  setCustomerActive:  (id, active) => request(`/customers/${id}/status`, { method: 'PATCH', body: { active } }),
  deleteCustomer:     (id) => request(`/customers/${id}`, { method: 'DELETE' }),

  // Stats
  getStats: () => request('/stats'),

  // Knowledge Base
  getKbTree:       () => request('/kb/tree'),
  createKbFolder:  (body) => request('/kb/folders', { method: 'POST', body }),
  renameKbFolder:  (id, body) => request(`/kb/folders/${id}`, { method: 'PUT', body }),
  deleteKbFolder:  (id) => request(`/kb/folders/${id}`, { method: 'DELETE' }),
  deleteKbFile:    (id) => request(`/kb/files/${id}`, { method: 'DELETE' }),
  // File upload uses FormData — can't go through the JSON `request` helper
  uploadKbFiles: (folderId, formData) =>
    fetch(`/api/kb/folders/${folderId}/files`, { method: 'POST', body: formData, headers: getAuthHeader() })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data;
      }),
  kbDownloadUrl: (fileId) => `/api/kb/files/${fileId}/download`,

  // Ticket activity
  getTicketActivity: (id) => request(`/tickets/${id}/activity`),

  // Ticket attachments
  deleteTicketAttachment: (id) => request(`/tickets/attachments/${id}`, { method: 'DELETE' }),
  ticketAttachmentDownloadUrl: (id) => `/api/tickets/attachments/${id}/download`,
  uploadTicketAttachments: (ticketId, formData) =>
    fetch(`/api/tickets/${ticketId}/attachments`, { method: 'POST', body: formData, headers: getAuthHeader() })
      .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Upload failed'); return data; }),

  // Customer ticket history
  getTicketsByEmail: (email) => request(`/tickets?requester_email=${encodeURIComponent(email)}`),

  // Email templates
  getEmailTemplates: () => request('/email-templates'),
  updateEmailTemplate: (key, body) => request(`/email-templates/${key}`, { method: 'PUT', body }),

  // Settings
  getSettings:    () => request('/settings'),
  updateSettings: (body) => request('/settings', { method: 'PUT', body }),

  // Announcements
  getAnnouncements:       () => request('/announcements'),
  getPublicAnnouncements: () => request('/announcements/public'),
  createAnnouncement:     (body) => request('/announcements', { method: 'POST', body }),
  updateAnnouncement:     (id, body) => request(`/announcements/${id}`, { method: 'PUT', body }),
  deleteAnnouncement:     (id) => request(`/announcements/${id}`, { method: 'DELETE' }),

  // Feature Requests / Ideas Board
  getFeatureRequests:   (params = {}) => request('/features?' + new URLSearchParams(params)),
  getFeatureRequest:    (id, params = {}) => request(`/features/${id}` + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  submitFeatureRequest: (body) => request('/features', { method: 'POST', body }),
  voteFeatureRequest:   (id, body) => request(`/features/${id}/vote`, { method: 'POST', body }),
  getFeatureVoters:     (id) => request(`/features/${id}/voters`),
  updateFeatureStatus:  (id, status) => request(`/features/${id}/status`, { method: 'PUT', body: { status } }),
  addFeatureComment:    (id, body) => request(`/features/${id}/comments`, { method: 'POST', body }),
  deleteFeatureComment: (featureId, commentId) => request(`/features/${featureId}/comments/${commentId}`, { method: 'DELETE' }),
  deleteFeatureRequest: (id) => request(`/features/${id}`, { method: 'DELETE' }),

  // KB Articles  (body may include { folder_id, title, content, status:'draft'|'published' })
  createKbArticle:   (body) => request('/kb/articles', { method: 'POST', body }),
  getKbArticle:      (id)   => request(`/kb/articles/${id}`),
  updateKbArticle:   (id, body) => request(`/kb/articles/${id}`, { method: 'PUT', body }),
  deleteKbArticle:   (id)   => request(`/kb/articles/${id}`, { method: 'DELETE' }),
  deleteArticleFile: (id)   => request(`/kb/article-files/${id}`, { method: 'DELETE' }),
  articleFileDownloadUrl: (fileId) => `/api/kb/article-files/${fileId}/download`,
  uploadArticleFiles: (articleId, formData) =>
    fetch(`/api/kb/articles/${articleId}/files`, { method: 'POST', body: formData, headers: getAuthHeader() })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        return data;
      }),

  // Ticket Tags
  getTicketTags:    (ticketId) => request(`/tickets/${ticketId}/tags`),
  addTicketTag:     (ticketId, tag) => request(`/tickets/${ticketId}/tags`, { method: 'POST', body: { tag } }),
  removeTicketTag:  (ticketId, tag) => request(`/tickets/${ticketId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }),

  // Canned Responses
  getCannedResponses:   () => request('/canned-responses'),
  createCannedResponse: (body) => request('/canned-responses', { method: 'POST', body }),
  updateCannedResponse: (id, body) => request(`/canned-responses/${id}`, { method: 'PUT', body }),
  deleteCannedResponse: (id) => request(`/canned-responses/${id}`, { method: 'DELETE' }),

  // CSAT
  sendCsatSurvey:  (ticketId) => request(`/csat/send/${ticketId}`, { method: 'POST' }),
  getCsatStats:    () => request('/csat/stats'),
  getCsatForTicket:(ticketId) => request(`/csat/ticket/${ticketId}`),

  // SLA Policies
  getSLAPolicies:   () => request('/sla'),
  createSLAPolicy:  (body) => request('/sla', { method: 'POST', body }),
  updateSLAPolicy:  (id, body) => request(`/sla/${id}`, { method: 'PUT', body }),
  deleteSLAPolicy:  (id) => request(`/sla/${id}`, { method: 'DELETE' }),
  getTicketSLA:     (ticketId) => request(`/sla/ticket/${ticketId}`),

  // Automation Rules
  getAutomationRules:   () => request('/automation'),
  createAutomationRule: (body) => request('/automation', { method: 'POST', body }),
  updateAutomationRule: (id, body) => request(`/automation/${id}`, { method: 'PUT', body }),
  deleteAutomationRule: (id) => request(`/automation/${id}`, { method: 'DELETE' }),
  toggleAutomationRule: (id, active) => request(`/automation/${id}/toggle`, { method: 'PATCH', body: { active } }),

  // Custom Fields
  getCustomFields:        (params = {}) => request('/custom-fields' + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')),
  createCustomField:      (body) => request('/custom-fields', { method: 'POST', body }),
  updateCustomField:      (id, body) => request(`/custom-fields/${id}`, { method: 'PUT', body }),
  reorderCustomField:     (id, position) => request(`/custom-fields/${id}/order`, { method: 'PATCH', body: { position } }),
  deleteCustomField:      (id) => request(`/custom-fields/${id}`, { method: 'DELETE' }),
  getTicketCustomFields:  (ticketId) => request(`/custom-fields/ticket/${ticketId}`),
  saveTicketCustomFields: (ticketId, body) => request(`/custom-fields/ticket/${ticketId}`, { method: 'PUT', body }),

  // Ticket Merge
  mergeTicket: (targetId, sourceId) => request(`/tickets/${targetId}/merge`, { method: 'POST', body: { source_ticket_id: sourceId } }),
};

// ── Constants ─────────────────────────────────────────────────────────────────
export const TICKET_TYPES = [
  'Bug / Incident',
  'Feature Request',
  'Question / How-To',
  'Access / Onboarding',
  'Feedback',
  'Alert',
];

export const PRODUCTS = ['Helyx Platform', 'Helyx Data'];

export const STATUSES = [
  'Open',
  'Pending',
  'In Investigation',
  'Pending Engineering',
  'Waiting on Customer',
  'Pending Release',
  'Resolved',
  'Closed',
  'Canceled',
];

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export const STATUS_COLORS = {
  'Open':                 { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'Pending':              { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  'In Investigation':     { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  'Pending Engineering':  { bg: '#F3E8FF', text: '#7E22CE', border: '#E9D5FF' },
  'Waiting on Customer':  { bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },
  'Pending Release':      { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
  'Resolved':             { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  'Closed':               { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB' },
  'Canceled':             { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
};

export const PRIORITY_COLORS = {
  'Low':      { text: '#6B7280' },
  'Medium':   { text: '#D97706' },
  'High':     { text: '#EA580C' },
  'Critical': { text: '#DC2626' },
};
