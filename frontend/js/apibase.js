/** Where the backend lives — configured in /env.js (empty = same origin). */
export const API_BASE = (window.API_BASE_URL || '').replace(/\/+$/, '');

/** prefix an API path ('/api/…') with the configured backend base */
export const apiUrl = (path) => API_BASE + path;
