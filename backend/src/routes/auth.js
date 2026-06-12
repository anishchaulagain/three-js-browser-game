/**
 * /api/auth — login, first-sign-in flow (password change + character setup).
 * All responses with a user use publicUser() — the hash never leaves the DB.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth } = require('../jwt');

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  role: u.role,
  gender: u.gender,
  displayName: u.displayName,
  outfit: u.outfit,
  mustChangePassword: u.mustChangePassword,
  firstLoginDone: u.firstLoginDone,
});

const PASSWORD_MIN = 6;

function createAuthRouter() {
  const router = express.Router();

  /** whether accounts are enabled at all — the client adapts its boot flow */
  router.get('/mode', (req, res) => res.json({ auth: db.enabled }));

  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'username and password required' });
    }
    const user = await db.findByUsername(username.trim());
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'wrong username or password' });
    }
    res.json({ token: sign(user), user: publicUser(user) });
  });

  /** who am I (used to resume a stored session) */
  router.get('/me', requireAuth, async (req, res) => {
    const user = await db.findById(req.auth.sub);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    res.json({ user: publicUser(user) });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = await db.findById(req.auth.sub);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (typeof newPassword !== 'string' || newPassword.length < PASSWORD_MIN || newPassword.length > 72) {
      return res.status(400).json({ error: `new password must be ${PASSWORD_MIN}–72 characters` });
    }
    if (!(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
      return res.status(401).json({ error: 'current password is wrong' });
    }
    const updated = await db.updateUser(user.id, {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
    });
    res.json({ user: publicUser(updated) });
  });

  /** first-sign-in character setup (also reusable later from the closet) */
  router.post('/profile', requireAuth, async (req, res) => {
    const { displayName, outfit } = req.body || {};
    const user = await db.findById(req.auth.sub);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const fields = { firstLoginDone: true };
    if (displayName !== undefined) fields.displayName = String(displayName).trim().slice(0, 16) || null;
    if (outfit !== undefined) fields.outfit = Math.max(0, Math.min(11, outfit | 0));
    const updated = await db.updateUser(user.id, fields);
    res.json({ user: publicUser(updated) });
  });

  return router;
}

module.exports = { createAuthRouter, publicUser };
