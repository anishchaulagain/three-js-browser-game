/**
 * /api/admin — user management, admin role only.
 * The admin assigns username, a starting password, and the character gender;
 * every account they create must change its password on first sign-in.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../jwt');
const { publicUser } = require('./auth');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
const GENDERS = ['male', 'female'];

function createAdminRouter() {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/users', async (req, res) => {
    res.json({ users: (await db.listUsers()).map(publicUser) });
  });

  router.post('/users', async (req, res) => {
    const { username, password, gender, displayName } = req.body || {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'username: 3–16 letters, digits or _' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return res.status(400).json({ error: 'password must be 6–72 characters' });
    }
    if (!GENDERS.includes(gender)) {
      return res.status(400).json({ error: 'gender must be male or female' });
    }
    if (await db.findByUsername(username)) {
      return res.status(409).json({ error: 'username already exists' });
    }
    const user = await db.createUser({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'player',
      gender,
      displayName: displayName ? String(displayName).trim().slice(0, 16) : null,
    });
    res.status(201).json({ user: publicUser(user) });
  });

  router.put('/users/:id', async (req, res) => {
    const user = await db.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'no such user' });
    const { password, gender, displayName } = req.body || {};
    const fields = {};
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
        return res.status(400).json({ error: 'password must be 6–72 characters' });
      }
      fields.passwordHash = await bcrypt.hash(password, 10);
      fields.mustChangePassword = true; // a reset is always temporary
    }
    if (gender !== undefined) {
      if (!GENDERS.includes(gender)) return res.status(400).json({ error: 'gender must be male or female' });
      fields.gender = gender;
    }
    if (displayName !== undefined) fields.displayName = String(displayName).trim().slice(0, 16) || null;
    res.json({ user: publicUser(await db.updateUser(user.id, fields)) });
  });

  router.delete('/users/:id', async (req, res) => {
    const user = await db.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'no such user' });
    if (user.id === req.auth.sub) return res.status(400).json({ error: 'you cannot delete yourself' });
    await db.deleteUser(user.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAdminRouter };
