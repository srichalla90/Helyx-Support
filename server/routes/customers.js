const express = require('express');
const router  = express.Router();
const db      = require('../db');

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only admins can perform this action' });
  next();
}

// Validate numeric :id params before any handler runs
router.param('id', (req, res, next, val) => {
  const n = Number(val);
  if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: 'Invalid ID' });
  next();
});

// List all customers
router.get('/', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  res.json(customers);
});

// Create customer
router.post('/', adminOnly, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = db.prepare('INSERT INTO customers (name) VALUES (?)').run(name);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(customer);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Customer already exists' });
    throw e;
  }
});

// Edit customer (name)
router.put('/:id', adminOnly, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const info = db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(name, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(customer);
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Customer name already exists' });
    throw e;
  }
});

// Toggle active status (deactivate / reactivate)
router.patch('/:id/status', adminOnly, (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  const val = active ? 1 : 0;
  const info = db.prepare('UPDATE customers SET active = ? WHERE id = ?').run(val, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json(customer);
});

// Delete customer
router.delete('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });
  db.prepare('UPDATE tickets SET customer_id = NULL WHERE customer_id = ?').run(id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
