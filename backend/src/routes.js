/** HTTP routes: static frontend + JSON API. Mount future routers here. */
const express = require('express');
const path = require('path');

function registerRoutes(app, players) {
  app.use(express.json());

  // simple health/status endpoint
  app.get('/api/status', (req, res) => {
    res.json({ ok: true, players: players.size, roles: players.takenRoles() });
  });

  // Extension point: mount feature routers here, e.g.
  //   app.use('/api/auth', require('./routes/auth'));
  //   app.use('/api/profiles', require('./routes/profiles'));

  app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
}

module.exports = { registerRoutes };
