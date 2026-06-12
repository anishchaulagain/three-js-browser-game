/** HTTP routes: static frontend + JSON API. Mount future routers here. */
const express = require('express');
const path = require('path');
const { createAuthRouter } = require('./routes/auth');
const { createAdminRouter } = require('./routes/admin');

function registerRoutes(app, players) {
  app.use(express.json());

  // simple health/status endpoint
  app.get('/api/status', (req, res) => {
    res.json({ ok: true, players: players.size, roles: players.takenRoles() });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/admin', createAdminRouter());

  // the admin dashboard lives at a clean, separate route
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'admin.html'));
  });

  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
}

module.exports = { registerRoutes };
