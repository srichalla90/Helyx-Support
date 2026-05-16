const express = require('express');
const router  = express.Router();
const db      = require('../db');
const adminOnly    = require('../middleware/adminOnly');
const handleError   = require('../middleware/handleError');

// ── Inline adminOnly middleware ────────────────────────────────────────────────
// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// ── GET / — list all rules ordered by position ASC, active DESC ───────────────
router.get('/', (req, res) => {
  try {
    const rules = db.prepare(
      'SELECT * FROM automation_rules ORDER BY position ASC, active DESC'
    ).all();
    const parsed = rules.map((r) => ({
      ...r,
      conditions: JSON.parse(r.conditions || '[]'),
      actions:    JSON.parse(r.actions    || '[]'),
      active:     r.active === 1,
    }));
    res.json(parsed);
  } catch (err) {
    console.error('GET /automation', err);
    res.status(500).json({ error: 'Failed to fetch automation rules' });
  }
});

// ── POST / — create rule ──────────────────────────────────────────────────────
router.post('/', adminOnly, (req, res) => {
  try {
    const { name, event, conditions, actions, active } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const eventValue      = event      || 'ticket_created';
    const conditionsJson  = JSON.stringify(conditions || []);
    const actionsJson     = JSON.stringify(actions    || []);
    const activeValue     = active !== undefined ? (active ? 1 : 0) : 1;
    const createdAt       = new Date().toISOString();

    // Determine next position
    const maxRow  = db.prepare('SELECT MAX(position) AS maxPos FROM automation_rules').get();
    const position = (maxRow && maxRow.maxPos != null) ? maxRow.maxPos + 1 : 0;

    const result = db.prepare(
      `INSERT INTO automation_rules (name, event, conditions, actions, active, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(name.trim(), eventValue, conditionsJson, actionsJson, activeValue, position, createdAt);

    const rule = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      ...rule,
      conditions: JSON.parse(rule.conditions || '[]'),
      actions:    JSON.parse(rule.actions    || '[]'),
      active:     rule.active === 1,
    });
  } catch (err) {
    console.error('POST /automation', err);
    res.status(500).json({ error: 'Failed to create automation rule' });
  }
});

// ── PUT /:id — update rule ────────────────────────────────────────────────────
router.put('/:id', adminOnly, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const { name, event, conditions, actions, active, position } = req.body;

    const newName       = name       !== undefined ? name.trim()                   : existing.name;
    const newEvent      = event      !== undefined ? event                          : existing.event;
    const newConditions = conditions !== undefined ? JSON.stringify(conditions)     : existing.conditions;
    const newActions    = actions    !== undefined ? JSON.stringify(actions)        : existing.actions;
    const newActive     = active     !== undefined ? (active ? 1 : 0)              : existing.active;
    const newPosition   = position   !== undefined ? parseInt(position, 10)        : existing.position;

    if (!newName) {
      return res.status(400).json({ error: 'name is required' });
    }

    db.prepare(
      `UPDATE automation_rules
       SET name = ?, event = ?, conditions = ?, actions = ?, active = ?, position = ?
       WHERE id = ?`
    ).run(newName, newEvent, newConditions, newActions, newActive, newPosition, id);

    const rule = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id);
    res.json({
      ...rule,
      conditions: JSON.parse(rule.conditions || '[]'),
      actions:    JSON.parse(rule.actions    || '[]'),
      active:     rule.active === 1,
    });
  } catch (err) {
    console.error('PUT /automation/:id', err);
    res.status(500).json({ error: 'Failed to update automation rule' });
  }
});

// ── DELETE /:id — delete rule ─────────────────────────────────────────────────
router.delete('/:id', adminOnly, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id FROM automation_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    db.prepare('DELETE FROM automation_rules WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /automation/:id', err);
    res.status(500).json({ error: 'Failed to delete automation rule' });
  }
});

// ── PATCH /:id/toggle — toggle active ────────────────────────────────────────
router.patch('/:id/toggle', adminOnly, (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const { active } = req.body;
    const newActive = active !== undefined ? (active ? 1 : 0) : (existing.active === 1 ? 0 : 1);

    db.prepare('UPDATE automation_rules SET active = ? WHERE id = ?').run(newActive, id);

    const rule = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id);
    res.json({
      ...rule,
      conditions: JSON.parse(rule.conditions || '[]'),
      actions:    JSON.parse(rule.actions    || '[]'),
      active:     rule.active === 1,
    });
  } catch (err) {
    console.error('PATCH /automation/:id/toggle', err);
    res.status(500).json({ error: 'Failed to toggle automation rule' });
  }
});

// ── applyAutomationRules ──────────────────────────────────────────────────────

function evaluateCondition(condition, ticket) {
  const { field, operator, value } = condition;

  // Resolve ticket field value
  let ticketValue = ticket[field];
  if (ticketValue === null || ticketValue === undefined) {
    ticketValue = '';
  }
  const ticketStr = String(ticketValue);
  const valueStr  = String(value || '');

  switch (operator) {
    case 'is':
      return ticketStr.toLowerCase() === valueStr.toLowerCase();
    case 'is_not':
      return ticketStr.toLowerCase() !== valueStr.toLowerCase();
    case 'contains':
      return ticketStr.toLowerCase().includes(valueStr.toLowerCase());
    case 'not_contains':
      return !ticketStr.toLowerCase().includes(valueStr.toLowerCase());
    default:
      return false;
  }
}

function applyAutomationRules(ticket, event) {
  try {
    const rules = db.prepare(
      `SELECT * FROM automation_rules WHERE active = 1 AND event = ? ORDER BY position ASC`
    ).all(event);

    for (const rule of rules) {
      let conditions = [];
      let actions    = [];

      try {
        conditions = JSON.parse(rule.conditions || '[]');
      } catch (_) {
        conditions = [];
      }
      try {
        actions = JSON.parse(rule.actions || '[]');
      } catch (_) {
        actions = [];
      }

      // Evaluate ALL conditions (AND logic)
      const allPass = conditions.every((cond) => evaluateCondition(cond, ticket));
      if (!allPass) continue;

      // Apply actions
      const now = new Date().toISOString();
      for (const action of actions) {
        const { type, value } = action;

        try {
          switch (type) {
            case 'set_priority':
              db.prepare(
                'UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ?'
              ).run(value, now, ticket.id);
              break;

            case 'set_status':
              db.prepare(
                'UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?'
              ).run(value, now, ticket.id);
              break;

            case 'set_group':
              db.prepare(
                'UPDATE tickets SET group_id = ?, updated_at = ? WHERE id = ?'
              ).run(parseInt(value, 10), now, ticket.id);
              break;

            case 'set_assignee':
              db.prepare(
                'UPDATE tickets SET assigned_to = ?, updated_at = ? WHERE id = ?'
              ).run(parseInt(value, 10), now, ticket.id);
              break;

            case 'add_tag':
              db.prepare(
                'INSERT OR IGNORE INTO ticket_tags (ticket_id, tag) VALUES (?, ?)'
              ).run(ticket.id, value);
              break;

            default:
              console.warn(`applyAutomationRules: unknown action type "${type}"`);
              continue;
          }

          // Log to ticket_activity
          db.prepare(
            `INSERT INTO ticket_activity (ticket_id, actor, action, field, old_value, new_value, created_at)
             VALUES (?, 'automation', 'automation_rule', ?, NULL, ?, ?)`
          ).run(ticket.id, type, value, now);
        } catch (actionErr) {
          console.error(`applyAutomationRules: error applying action "${type}" on ticket ${ticket.id}:`, actionErr);
        }
      }
    }

    // Return the updated ticket
    const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
    return updated || ticket;
  } catch (err) {
    console.error('applyAutomationRules error:', err);
    return ticket;
  }
}

module.exports = router;
module.exports.applyAutomationRules = applyAutomationRules;
