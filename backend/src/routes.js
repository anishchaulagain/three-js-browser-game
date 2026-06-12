/** HTTP routes: static frontend + JSON API. Mount future routers here. */
const express = require('express');
const path = require('path');
const { FRONTEND_ORIGIN } = require('./config');
const { createAuthRouter } = require('./routes/auth');
const { createAdminRouter } = require('./routes/admin');

function registerRoutes(app, players) {
  app.use(express.json());

  // CORS — only needed when the frontend is hosted on a different origin
  // (FRONTEND_ORIGIN in .env, comma-separated for several)
  if (FRONTEND_ORIGIN) {
    const allowed = FRONTEND_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, ''));
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && (allowed.includes('*') || allowed.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : origin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

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
