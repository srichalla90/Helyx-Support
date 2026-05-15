const express = require('express');
const router  = express.Router();
const db      = require('../db');

// List all customers
router.get('/', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  res.json(customers);
});

// Create customer
router.post('/', (req, res) => {
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
router.put('/:id', (req, res) => {
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
router.patch('/:id/status', (req, res) => {
  const { active } = req.body;
  if (active === undefined) return res.status(400).json({ error: 'active is required' });
  const val = active ? 1 : 0;
  const info = db.prepare('UPDATE customers SET active = ? WHERE id = ?').run(val, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json(customer);
});

// Delete customer
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  res.json({ success: true });
});

module.exports = router;
