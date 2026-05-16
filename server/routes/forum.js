const express     = require('express');
const router      = express.Router();
const db          = require('../db');
const requireAuth = require('../middleware/requireAuth');
const handleError   = require('../middleware/handleError');

const now = () => new Date().toISOString();

function isStaff(user) {
  return user && (user.role === 'admin' || user.role === 'agent');
}

// ── GET /api/forum — public list of questions ─────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { q, answered } = req.query;
    let sql = `SELECT * FROM forum_questions`;
    const params = [];
    const where  = [];
    if (q?.trim()) {
      where.push(`(title LIKE ? OR body LIKE ?)`);
      const like = `%${q.trim()}%`;
      params.push(like, like);
    }
    if (answered === '1') where.push(`is_answered = 1`);
    if (answered === '0') where.push(`is_answered = 0`);
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY created_at DESC`;
    res.json(db.prepare(sql).all(...params));
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/forum — create question (auth required) ────────────────────────
// author identity is taken from the verified JWT — never from the request body
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, body = '', tags = '' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    const ts = now();
    const result = db.prepare(
      `INSERT INTO forum_questions (title, body, author_email, author_name, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(title.trim(), body, req.user.email, req.user.name, tags, ts, ts);
    res.status(201).json(db.prepare(`SELECT * FROM forum_questions WHERE id = ?`).get(result.lastInsertRowid));
  } catch (e) { return handleError(res, e); }
});

// ── GET /api/forum/:id — question + answers (public) ─────────────────────────
router.get('/:id', (req, res) => {
  try {
    const q = db.prepare(`SELECT * FROM forum_questions WHERE id = ?`).get(req.params.id);
    if (!q) return res.status(404).json({ error: 'Not found' });
    db.prepare(`UPDATE forum_questions SET view_count = view_count + 1 WHERE id = ?`).run(q.id);
    const answers = db.prepare(`SELECT * FROM forum_answers WHERE question_id = ? ORDER BY is_accepted DESC, created_at ASC`).all(q.id);
    res.json({ ...q, view_count: q.view_count + 1, answers });
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/forum/:id — question author or staff only ─────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const q = db.prepare(`SELECT * FROM forum_questions WHERE id = ?`).get(req.params.id);
    if (!q) return res.status(404).json({ error: 'Not found' });
    if (!isStaff(req.user) && q.author_email !== req.user.email) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    db.prepare(`DELETE FROM forum_answers   WHERE question_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM forum_questions WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

// ── POST /api/forum/:id/answers — post an answer (auth required) ──────────────
// is_staff is derived from the JWT role — never trusted from the request body
router.post('/:id/answers', requireAuth, (req, res) => {
  try {
    const q = db.prepare(`SELECT id FROM forum_questions WHERE id = ?`).get(req.params.id);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'body is required' });
    const staff = isStaff(req.user) ? 1 : 0;
    const ts    = now();
    const result = db.prepare(
      `INSERT INTO forum_answers (question_id, body, author_email, author_name, is_staff, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(q.id, body.trim(), req.user.email, req.user.name, staff, ts, ts);
    db.prepare(`UPDATE forum_questions SET answer_count = answer_count + 1, updated_at = ? WHERE id = ?`).run(ts, q.id);
    res.status(201).json(db.prepare(`SELECT * FROM forum_answers WHERE id = ?`).get(result.lastInsertRowid));
  } catch (e) { return handleError(res, e); }
});

// ── PATCH /api/forum/answers/:answerId/accept — question author or staff only ──
router.patch('/answers/:answerId/accept', requireAuth, (req, res) => {
  try {
    const answer   = db.prepare(`SELECT * FROM forum_answers WHERE id = ?`).get(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });
    const question = db.prepare(`SELECT * FROM forum_questions WHERE id = ?`).get(answer.question_id);
    if (!isStaff(req.user) && question.author_email !== req.user.email) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    const ts = now();
    db.prepare(`UPDATE forum_answers SET is_accepted = 0 WHERE question_id = ?`).run(answer.question_id);
    db.prepare(`UPDATE forum_answers SET is_accepted = 1, updated_at = ? WHERE id = ?`).run(ts, answer.id);
    db.prepare(`UPDATE forum_questions SET is_answered = 1, updated_at = ? WHERE id = ?`).run(ts, answer.question_id);
    res.json(db.prepare(`SELECT * FROM forum_answers WHERE id = ?`).get(answer.id));
  } catch (e) { return handleError(res, e); }
});

// ── DELETE /api/forum/answers/:answerId — answer author or staff only ─────────
router.delete('/answers/:answerId', requireAuth, (req, res) => {
  try {
    const answer = db.prepare(`SELECT * FROM forum_answers WHERE id = ?`).get(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Not found' });
    if (!isStaff(req.user) && answer.author_email !== req.user.email) {
      return res.status(403).json({ error: 'Not authorised' });
    }
    db.prepare(`DELETE FROM forum_answers WHERE id = ?`).run(answer.id);
    const remaining     = db.prepare(`SELECT COUNT(*) AS n FROM forum_answers WHERE question_id = ?`).get(answer.question_id).n;
    const stillAnswered = db.prepare(`SELECT COUNT(*) AS n FROM forum_answers WHERE question_id = ? AND is_accepted = 1`).get(answer.question_id).n;
    db.prepare(`UPDATE forum_questions SET answer_count = ?, is_answered = ?, updated_at = ? WHERE id = ?`)
      .run(remaining, stillAnswered > 0 ? 1 : 0, now(), answer.question_id);
    res.json({ success: true });
  } catch (e) { return handleError(res, e); }
});

module.exports = router;
