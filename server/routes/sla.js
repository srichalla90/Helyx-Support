const express = require('express');
const router = express.Router();
const db = require('../db');

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// GET / - return all sla_policies ordered by priority
router.get('/', (req, res) => {
  try {
    const policies = db.prepare(`
      SELECT *
      FROM sla_policies
      ORDER BY
        CASE priority
          WHEN 'Critical' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          ELSE 4
        END
    `).all();
    res.json(policies);
  } catch (err) {
    console.error('GET /sla error:', err);
    res.status(500).json({ error: 'Failed to fetch SLA policies' });
  }
});

// POST / (admin only) - create policy
router.post('/', adminOnly, (req, res) => {
  try {
    const { name, priority, first_response_hours, resolution_hours } = req.body;

    if (!name || !priority || first_response_hours == null || resolution_hours == null) {
      return res.status(400).json({ error: 'name, priority, first_response_hours, and resolution_hours are required' });
    }

    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'priority must be one of: Low, Medium, High, Critical' });
    }

    const created_at = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO sla_policies (name, priority, first_response_hours, resolution_hours, is_default, active, created_at)
      VALUES (?, ?, ?, ?, 0, 1, ?)
    `).run(name, priority, first_response_hours, resolution_hours, created_at);

    const policy = db.prepare('SELECT * FROM sla_policies WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(policy);
  } catch (err) {
    console.error('POST /sla error:', err);
    res.status(500).json({ error: 'Failed to create SLA policy' });
  }
});

// PUT /:id (admin only) - update policy
router.put('/:id', adminOnly, (req, res) => {
  try {
    const { id } = req.params;
    const { name, priority, first_response_hours, resolution_hours, is_default, active } = req.body;

    const existing = db.prepare('SELECT * FROM sla_policies WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'SLA policy not found' });
    }

    if (priority) {
      const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ error: 'priority must be one of: Low, Medium, High, Critical' });
      }
    }

    const updatedName = name !== undefined ? name : existing.name;
    const updatedPriority = priority !== undefined ? priority : existing.priority;
    const updatedFirstResponse = first_response_hours !== undefined ? first_response_hours : existing.first_response_hours;
    const updatedResolution = resolution_hours !== undefined ? resolution_hours : existing.resolution_hours;
    const updatedIsDefault = is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default;
    const updatedActive = active !== undefined ? (active ? 1 : 0) : existing.active;

    db.prepare(`
      UPDATE sla_policies
      SET name = ?, priority = ?, first_response_hours = ?, resolution_hours = ?, is_default = ?, active = ?
      WHERE id = ?
    `).run(updatedName, updatedPriority, updatedFirstResponse, updatedResolution, updatedIsDefault, updatedActive, id);

    const updated = db.prepare('SELECT * FROM sla_policies WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('PUT /sla/:id error:', err);
    res.status(500).json({ error: 'Failed to update SLA policy' });
  }
});

// DELETE /:id (admin only) - delete policy (cannot delete last policy for a priority)
router.delete('/:id', adminOnly, (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM sla_policies WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'SLA policy not found' });
    }

    const countRow = db.prepare(
      'SELECT COUNT(*) as count FROM sla_policies WHERE priority = ?'
    ).get(existing.priority);

    if (countRow.count <= 1) {
      return res.status(400).json({
        error: `Cannot delete the last SLA policy for priority "${existing.priority}"`
      });
    }

    db.prepare('DELETE FROM sla_policies WHERE id = ?').run(id);
    res.json({ message: 'SLA policy deleted successfully' });
  } catch (err) {
    console.error('DELETE /sla/:id error:', err);
    res.status(500).json({ error: 'Failed to delete SLA policy' });
  }
});

// GET /ticket/:ticketId - compute SLA status for a ticket
router.get('/ticket/:ticketId', (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = db.prepare(
      'SELECT id, priority, status, created_at FROM tickets WHERE id = ?'
    ).get(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const policy = db.prepare(
      'SELECT * FROM sla_policies WHERE priority = ? AND active = 1 LIMIT 1'
    ).get(ticket.priority);

    if (!policy) {
      return res.json({ policy: null });
    }

    const createdAt = new Date(ticket.created_at).getTime();
    const now = Date.now();

    const first_response_deadline = new Date(createdAt + policy.first_response_hours * 3600000).toISOString();
    const resolution_deadline = new Date(createdAt + policy.resolution_hours * 3600000).toISOString();

    const firstResponseDeadlineMs = createdAt + policy.first_response_hours * 3600000;
    const resolutionDeadlineMs = createdAt + policy.resolution_hours * 3600000;

    const resolvedStatuses = ['Resolved', 'Closed', 'Canceled'];
    const is_resolved = resolvedStatuses.includes(ticket.status);

    const first_response_breached = now > firstResponseDeadlineMs && !is_resolved;
    const resolution_breached = now > resolutionDeadlineMs && !is_resolved;

    const first_response_remaining_hours = (firstResponseDeadlineMs - now) / 3600000;
    const resolution_remaining_hours = (resolutionDeadlineMs - now) / 3600000;

    res.json({
      policy,
      first_response_deadline,
      resolution_deadline,
      first_response_breached,
      resolution_breached,
      first_response_remaining_hours,
      resolution_remaining_hours,
      is_resolved
    });
  } catch (err) {
    console.error('GET /sla/ticket/:ticketId error:', err);
    res.status(500).json({ error: 'Failed to compute SLA status' });
  }
});

module.exports = router;
