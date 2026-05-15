import { useState, useEffect } from 'react';
import { api } from '../api';
import { useUser } from '../context/UserContext';
import { useToast } from '../components/Toast';

const TEMPLATE_META = {
  ticket_created_customer:  { label: 'Ticket Created — Customer',   desc: 'Sent to the customer when a new ticket is received.' },
  ticket_assigned_agent:    { label: 'Ticket Assigned — Agent',     desc: 'Sent to the agent when a ticket is assigned to them.' },
  ticket_resolved_customer: { label: 'Ticket Resolved — Customer',  desc: 'Sent to the customer when their ticket is marked Resolved.' },
  ticket_closed_customer:   { label: 'Ticket Closed — Customer',    desc: 'Sent to the customer when their ticket is closed.' },
  announcement_published:   { label: 'Announcement — Email Blast',  desc: 'Sent to customers (and optionally agents) when an announcement is published. Supports full HTML. The {{body}} variable embeds the announcement content.' },
  new_ticket_agent:         { label: 'New Inbound Ticket — Agent',  desc: 'Sent to all Helyx Support group members when a new ticket arrives via email.' },
  csat_survey:              { label: 'CSAT Survey',                 desc: 'Sent to the customer when a CSAT survey is requested. Use {{rating_url_1}} through {{rating_url_5}} for one-click rating links.' },
  agent_mentioned: { label: 'Agent Mentioned in Comment', desc: 'Sent to an agent when they are @mentioned in a ticket comment.' },
};

// Variables available per template
const TEMPLATE_VARS = {
  ticket_created_customer:  ['{{ticket_id}}','{{ticket_title}}','{{requester_email}}','{{company_name}}','{{support_email}}','{{priority}}','{{type}}','{{portal_url}}'],
  ticket_assigned_agent:    ['{{ticket_id}}','{{ticket_title}}','{{requester_email}}','{{company_name}}','{{agent_name}}','{{status}}','{{priority}}','{{type}}'],
  ticket_resolved_customer: ['{{ticket_id}}','{{ticket_title}}','{{requester_email}}','{{company_name}}','{{support_email}}','{{portal_url}}'],
  ticket_closed_customer:   ['{{ticket_id}}','{{ticket_title}}','{{requester_email}}','{{company_name}}','{{support_email}}'],
  announcement_published:   ['{{company_name}}','{{title}}','{{type_label}}','{{body}}','{{portal_url}}'],
  new_ticket_agent:         ['{{ticket_id}}','{{ticket_title}}','{{requester_email}}','{{company_name}}','{{body_preview}}','{{app_url}}'],
  csat_survey:              ['{{ticket_id}}','{{ticket_title}}','{{company_name}}','{{rating_url_1}}','{{rating_url_2}}','{{rating_url_3}}','{{rating_url_4}}','{{rating_url_5}}'],
  agent_mentioned: ['{{ticket_id}}','{{ticket_title}}','{{agent_name}}','{{mentioned_by}}','{{comment_preview}}','{{company_name}}','{{app_url}}'],
};

export default function EmailTemplatesPage() {
  const user    = useUser();
  const toast   = useToast();
  const isAdmin = user?.role === 'admin';

  const [templates, setTemplates] = useState([]);
  const [active,    setActive]    = useState('ticket_created_customer');
  const [saving,    setSaving]    = useState(false);
  const [local,     setLocal]     = useState({}); // key → { subject, body, enabled }

  useEffect(() => {
    api.getEmailTemplates().then((rows) => {
      setTemplates(rows);
      const map = {};
      for (const r of rows) map[r.key] = { subject: r.subject, body: r.body, enabled: r.enabled === 1 || r.enabled === true };
      setLocal(map);
    }).catch(() => toast('Failed to load templates', 'error'));
  }, []);

  async function save(key) {
    setSaving(true);
    try {
      const updated = await api.updateEmailTemplate(key, {
        subject: local[key]?.subject || '',
        body:    local[key]?.body    || '',
        enabled: local[key]?.enabled !== false,
      });
      setTemplates((prev) => prev.map((t) => t.key === key ? updated : t));
      toast('Template saved', 'success');
    } catch (e) {
      toast(e.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function setField(key, field, value) {
    setLocal((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [field]: value } }));
  }

  const cur = local[active] || {};

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%' }}>
      {/* Sidebar */}
      <div style={{ width: 240, flexShrink: 0 }}>
        {Object.entries(TEMPLATE_META).map(([key, meta]) => {
          const tpl = templates.find((t) => t.key === key);
          return (
            <button
              key={key}
              onClick={() => setActive(key)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', marginBottom: 4,
                borderRadius: 8, cursor: 'pointer', border: 'none',
                background: active === key ? '#EFF6FF' : '#F9FAFB',
                color: active === key ? '#1D4ED8' : '#374151',
                fontSize: 13, fontWeight: active === key ? 700 : 500,
              }}
            >
              <div>{meta.label}</div>
              {tpl && (
                <div style={{ fontSize: 11, marginTop: 2, color: local[key]?.enabled !== false ? '#10B981' : '#9CA3AF' }}>
                  {local[key]?.enabled !== false ? '● Enabled' : '○ Disabled'}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{TEMPLATE_META[active]?.label}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{TEMPLATE_META[active]?.desc}</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: cur.enabled !== false ? '#059669' : '#9CA3AF' }}>
            <div
              onClick={() => isAdmin && setField(active, 'enabled', cur.enabled === false)}
              style={{ width: 36, height: 20, borderRadius: 10, background: cur.enabled !== false ? '#10B981' : '#E5E7EB', position: 'relative', cursor: isAdmin ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
            >
              <div style={{ position: 'absolute', top: 2, left: cur.enabled !== false ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </div>
            {cur.enabled !== false ? 'Enabled' : 'Disabled'}
          </label>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Variables hint */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#6B7280' }}>
            <strong style={{ color: '#374151' }}>Available variables:</strong>{' '}
            {(TEMPLATE_VARS[active] || []).map((v) => (
              <code key={v} style={{ background: '#E5E7EB', borderRadius: 4, padding: '1px 5px', marginRight: 4, fontSize: 11 }}>{v}</code>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Subject</label>
            <input
              value={cur.subject || ''}
              onChange={(e) => setField(active, 'subject', e.target.value)}
              disabled={!isAdmin}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', fontFamily: 'inherit', background: !isAdmin ? '#F9FAFB' : '#fff', color: '#111827' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Body (HTML)</label>
            <textarea
              value={cur.body || ''}
              onChange={(e) => setField(active, 'body', e.target.value)}
              disabled={!isAdmin}
              rows={16}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none', fontFamily: 'monospace', background: !isAdmin ? '#F9FAFB' : '#fff', color: '#111827', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {isAdmin ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => save(active)}
                disabled={saving}
                style={{ padding: '9px 24px', fontSize: 14, fontWeight: 600, background: saving ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          ) : (
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E' }}>
              🔒 Only admins can modify email templates.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
