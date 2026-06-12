/**
 * Frontend deployment config — plain script, loaded before everything else.
 *
 * API_BASE_URL points at the backend (Express + Socket.io).
 *
 *   ''                                → same origin (the backend serves this
 *                                       frontend itself — local dev, or a
 *                                       single Render Web Service)
 *   'https://your-app.onrender.com'   → backend hosted separately (e.g. the
 *                                       frontend on a static host) — no
 *                                       trailing slash
 *
 * When the frontend is hosted separately, also set FRONTEND_ORIGIN in the
 * backend's .env to that site's origin so CORS lets the requests through.
 */
window.API_BASE_URL = '';
