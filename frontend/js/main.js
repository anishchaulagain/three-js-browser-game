/** Entry point — sign in (when accounts are on), then boot the game. */
import { runAuthFlow } from './authclient.js';
import { Game } from './game.js';

(async () => {
  let auth = null;
  try {
    auth = await runAuthFlow(); // null in open mode
  } catch (e) {
    console.error('auth flow failed — falling back to open mode:', e);
  }

  const game = new Game(auth);
  game.start();

  // debug hook (handy for testing/poking around in devtools)
  window.__game = {
    get controller() { return game.controller; },
    get net() { return game.net; },
    get ui() { return game.ui; },
    get world() { return game.world; },
    game,
  };
})();
