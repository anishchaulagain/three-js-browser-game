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
backend/    Node.js + Express + Socket.io server (2-player cap, world clock, state relay)
frontend/   Three.js client (world, avatars, day/night cycle, UI)
```
