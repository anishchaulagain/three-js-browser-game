# Our Little World 💕

A cozy browser-based 3D open world built with **Three.js** — made for exactly **two people**.
A Roblox-style world where a couple can spend their days together: explore, change outfits,
cook dinner, sit by the pond, and fall asleep side by side while the sun sets.

## Features

- 🔒 **Two players only** — the server hard-caps the world at 2 connections. A third visitor sees "World is full 💔".
- 🧑‍🤝‍🧑 **Roblox-style avatars** — blocky him & her characters with walking, running, jumping, sitting and sleeping animations.
- ⏰ **2-minute day cycle** — a clock at the top of the screen runs from morning to night (one full day = 2 real minutes), with a moving sun and moon, sunrise/sunset skies, stars, and fireflies after dark.
- 🏡 **A house of your own** — bedroom (double bed, closet, lamp) and kitchen (stove, fridge, dinner table for two).
- 👗 **Closet with outfits** — 6 outfits per character (casual, date night, cozy, beach/sundress, adventurer, formal/princess).
- 🌍 **Open world** — forest, pond with a bench, picnic blanket, a heart-shaped flower garden, stone path, drifting clouds.
- 💬 **Chat & emotes** — speech bubbles, ❤️ / 👋 / 😘 emotes, and floating hearts when you stand close together.

## Run it

```bash
cd backend
npm install
npm start
```

Then open **http://localhost:3000** in two browser windows (or two devices on the
same network using `http://<your-ip>:3000`). One of you picks *Him*, the other *Her*.

## Controls

| Key | Action |
|---|---|
| W A S D / arrows | Move |
| Shift | Run |
| Space | Jump |
| E | Interact (closet, bed, chairs, stove, fridge…) |
| Enter | Chat |
| H / G / K | ❤️ / 👋 / 😘 emotes |
| Mouse drag | Look around |
| Scroll | Zoom camera |

## Project layout

```
backend/
  server.js            entry point — wires routes + sockets together
  src/
    config.js          all server constants (port, day length, player cap, limits)
    auth.js            ★ authentication hook (currently allow-all; plug JWT/etc. here)
    players.js         PlayerManager — who is in the world, role conflict resolution
    sockets.js         realtime traffic: join, state relay, outfits, emotes, chat
    routes.js          ★ HTTP/API routes (mount /api/auth, /api/profiles, … here)
    worldclock.js      shared world clock both clients sync from
  tests/
    two-players.js     socket-layer test (npm run test:net)
    browser-smoke.js   headless browser end-to-end test (npm run test:browser)

frontend/
  index.html, style.css
  js/
    main.js            entry point — boots the Game
    game.js            orchestrator: loop + wiring between subsystems
    config.js          client constants (spawns, emote keys, snack list, …)
    network.js         socket wrapper + world-time sync
    controls.js        movement, physics, collisions, third-person camera
    ui.js              all DOM/HUD: select screen, clock, closet, chat, toasts
    interactions.js    ★ one handler per interactable type (closet, bed, stove, …)
    effects.js         floating-hearts particle effects
    avatar/
      outfits.js       ★ outfit/skin/hair data — character customization lives here
      avatar.js        blocky avatar build + animation
      sprites.js       name tags, chat bubbles, emote sprites
    world/
      index.js         world composition root (shared colliders/interactables ctx)
      sky.js           day/night cycle: sun, moon, sky colors, stars, clouds
      house.js         ★ the house: walls, furniture, indoor lights, interactables
      nature.js        ★ outdoors: pond, picnic, trees, fireflies
      helpers.js, rng.js
```

★ = the files you'll most likely touch when adding features.

## Adding features

- **Authentication** — implement `backend/src/auth.js` (verify `socket.handshake.auth.token`)
  and add login routes in `backend/src/routes.js`; pass the token from the client via
  `io({ auth: { token } })` in `frontend/js/network.js`.
- **New outfits / characters** — add entries to `frontend/js/avatar/outfits.js`;
  the closet UI and sync pick them up automatically.
- **New interactions** — push an interactable from a world module, then add a
  same-named handler in `frontend/js/interactions.js`.
- **New areas** — create a module like `world/house.js` and call it from `world/index.js`.

## Tests

Start the server, then in another terminal:

```bash
npm run test:net       # socket layer: 2-player cap, role conflicts, chat/outfit relay
npm run test:browser   # headless Chrome: join, walk through door, closet UI
```
