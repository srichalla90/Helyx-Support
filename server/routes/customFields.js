/**
 * customFields.js — Custom ticket field definitions & values
 *
 * Definitions (admin-managed schema):
 *   GET    /api/custom-fields            — list all active definitions
 *   POST   /api/custom-fields            — create new field (admin)
 *   PUT    /api/custom-fields/:id        — update field (admin)
 *   PATCH  /api/custom-fields/:id/order  — reorder (admin)
 *   DELETE /api/custom-fields/:id        — deactivate (admin)
 *
 * Values (per-ticket):
 *   GET    /api/custom-fields/ticket/:ticketId   — get all values for a ticket
 *   PUT    /api/custom-fields/ticket/:ticketId   — batch-save values { field_id: value, ... }
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const adminOnly    = require('../middleware/adminOnly');
const handleError   = require('../middleware/handleError');

const FIELD_TYPES = ['text', 'number', 'dropdown', 'date', 'checkbox', 'url', 'textarea'];

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// ── GET /api/custom-fields — list all definitions ─────────────────────────────
router.get('/', (req, res) => {
  try {
    const { include_inactive } = req.query;
    const where = include_inactive === '1' ? '' : 'WHERE active = 1';
    const rows = db.prepare(`SELECT * FROM custom_field_definitions ${where} ORDER BY position ASC, id ASC`).all();
    // Parse options JSON
    res.json(rows.map((r) => ({
      ...r,
      options:  r.options  ? JSON.parse(r.options)  : [],
      required: r.required === 1,
      active:   r.active   === 1,
    })));
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/custom-fields — create definition ───────────────────────────────
router.post('/', adminOnly, (req, res) => {
  const { name, label, field_type, options, required, position } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required' });
  if (field_type && !FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `Invalid field_type. Must be one of: ${FIELD_TYPES.join(', ')}` });
  }

  // Auto-generate internal name from label if not provided
  const fieldName = (name || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!fieldName) return res.status(400).json({ error: 'Could not generate field name from label' });

  // Validate dropdown options
  if (field_type === 'dropdown' && (!options || !Array.isArray(options) || options.length === 0)) {
    return res.status(400).json({ error: 'Dropdown fields require at least one option' });
  }

  try {
    // Get next position
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM custom_field_definitions').get().p;
    const pos = position !== undefined ? Number(position) : maxPos + 1;

    const ts = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO custom_field_definitions (name, label, field_type, options, required, position, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      fieldName,
      label.trim(),
      field_type || 'text',
      options ? JSON.stringify(options) : null,
      required ? 1 : 0,
      pos,
      ts,
    );
    const row = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({
      ...row,
      options:  row.options  ? JSON.parse(row.options)  : [],
      required: row.required === 1,
      active:   row.active   === 1,
    });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'A field with this name already exists' });
    return handleError(res, e);
  }
});

// ── PUT /api/custom-fields/:id — update definition ───────────────────────────
router.put('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Field not found' });

  const { label, field_type, options, required, position, active } = req.body;

  const newLabel     = label     !== undefined ? label.trim()                               : existing.label;
  const newType      = field_type !== undefined ? field_type                                : existing.field_type;
  const newOptions   = options   !== undefined ? JSON.stringify(options)                    : existing.options;
  const newRequired  = required  !== undefined ? (required ? 1 : 0)                        : existing.required;
  const newPosition  = position  !== undefined ? Number(position)                          : existing.position;
  const newActive    = active    !== undefined ? (active ? 1 : 0)                          : existing.active;

  if (!newLabel) return res.status(400).json({ error: 'Label is required' });
  if (!FIELD_TYPES.includes(newType)) return res.status(400).json({ error: 'Invalid field_type' });

  try {
    db.prepare(`
      UPDATE custom_field_definitions
      SET label = ?, field_type = ?, options = ?, required = ?, position = ?, active = ?
      WHERE id = ?
    `).run(newLabel, newType, newOptions, newRequired, newPosition, newActive, id);

    const row = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(id);
    res.json({
      ...row,
      options:  row.options  ? JSON.parse(row.options)  : [],
      required: row.required === 1,
      active:   row.active   === 1,
    });
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/custom-fields/:id — deactivate (soft delete) ─────────────────
router.delete('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Field not found' });
  try {
    db.prepare('UPDATE custom_field_definitions SET active = 0 WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/custom-fields/ticket/:ticketId — get values for a ticket ─────────
router.get('/ticket/:ticketId', (req, res) => {
  const ticketId = Number(req.params.ticketId);
  try {
    const rows = db.prepare(`
      SELECT tcf.field_id, tcf.value, cfd.name, cfd.label, cfd.field_type, cfd.options, cfd.required, cfd.position
      FROM ticket_custom_fields tcf
      JOIN custom_field_definitions cfd ON cfd.id = tcf.field_id
      WHERE tcf.ticket_id = ?
      ORDER BY cfd.position ASC
    `).all(ticketId);

    // Also include definitions with no values (so UI knows all fields)
    const allDefs = db.prepare('SELECT * FROM custom_field_definitions WHERE active = 1 ORDER BY position ASC').all();
    const valueMap = {};
    for (const r of rows) valueMap[r.field_id] = r.value;

    res.json({
      values: valueMap,  // { field_id → value }
      definitions: allDefs.map((d) => ({
        ...d,
        options:  d.options  ? JSON.parse(d.options)  : [],
        required: d.required === 1,
        active:   d.active   === 1,
        value:    valueMap[d.id] ?? null,
      })),
    });
  } catch (e) { return handleError(res, e); }
});

// ── PUT /api/custom-fields/ticket/:ticketId — batch save values ───────────────
// Body: { "field_id": "value", ... } — field_id as numeric keys, values as strings
router.put('/ticket/:ticketId', (req, res) => {
  const ticketId = Number(req.params.ticketId);
  const ticket = db.prepare('SELECT id FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const updates = req.body; // { "3": "BUG-123", "4": "" }
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Body must be an object of { field_id: value }' });
  }

  try {
    for (const [fieldIdStr, value] of Object.entries(updates)) {
      const fieldId = Number(fieldIdStr);
      if (!fieldId) continue;
      const fieldDef = db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(fieldId);
      if (!fieldDef) continue;

      if (value === null || value === undefined || value === '') {
        // Delete the value if empty
        db.prepare('DELETE FROM ticket_custom_fields WHERE ticket_id = ? AND field_id = ?').run(ticketId, fieldId);
      } else {
        db.prepare(`
          INSERT INTO ticket_custom_fields (ticket_id, field_id, value) VALUES (?, ?, ?)
          ON CONFLICT(ticket_id, field_id) DO UPDATE SET value = excluded.value
        `).run(ticketId, fieldId, String(value));
      }
    }

    // Return updated values
    const allDefs = db.prepare('SELECT * FROM custom_field_definitions WHERE active = 1 ORDER BY position ASC').all();
    const rows = db.prepare('SELECT field_id, value FROM ticket_custom_fields WHERE ticket_id = ?').all(ticketId);
    const valueMap = {};
    for (const r of rows) valueMap[r.field_id] = r.value;

    res.json({
      values: valueMap,
      definitions: allDefs.map((d) => ({
        ...d,
        options:  d.options  ? JSON.parse(d.options)  : [],
        required: d.required === 1,
        active:   d.active   === 1,
        value:    valueMap[d.id] ?? null,
      })),
    });
  } catch (e) { return handleError(res, e); }
});

// ── PATCH /api/custom-fields/:id/order — reorder field ───────────────────────
router.patch('/:id/order', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid ID' });
  const { position } = req.body;
  if (position === undefined) return res.status(400).json({ error: 'position is required' });
  const existing = db.prepare('SELECT id FROM custom_field_definitions WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Field not found' });
  try {
    db.prepare('UPDATE custom_field_definitions SET position = ? WHERE id = ?').run(Number(position), id);
    const row = db.prepare('SELECT * FROM custom_field_definitions WHERE id = ?').get(id);
    res.json({
      ...row,
      options:  row.options  ? JSON.parse(row.options)  : [],
      required: row.required === 1,
      active:   row.active   === 1,
    });
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
