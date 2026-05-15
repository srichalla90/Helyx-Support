import { STATUS_COLORS, PRIORITY_COLORS } from '../api';

export function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' };
  return (
    <span
      className="status-badge"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const dotColors = { Low: '#9CA3AF', Medium: '#D97706', High: '#EA580C', Critical: '#DC2626' };
  const c = PRIORITY_COLORS[priority] || { text: '#6B7280' };
  return (
    <span className="priority-badge" style={{ color: c.text, borderColor: 'transparent', background: 'transparent', padding: '2px 0' }}>
      <span className="priority-dot" style={{ background: dotColors[priority] || '#9CA3AF' }} />
      {priority}
    </span>
  );
}
