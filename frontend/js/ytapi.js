/**
 * Shared YouTube IFrame API loader + link parser.
 *
 * The API script and its single `onYouTubeIframeAPIReady` global must be set
 * up exactly once, even though both the theater and the kitchen radio create
 * players. This module loads it lazily and resolves a shared promise.
 */
let apiPromise = null;

export function loadYouTubeAPI() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

/** any YouTube URL / id → the 11-char video id, or null */
export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) ||
            s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
