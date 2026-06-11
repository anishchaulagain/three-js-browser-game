/** Entry point — boot the game. */
import { Game } from './game.js';

const game = new Game();
game.start();

// debug hook (handy for testing/poking around in devtools)
window.__game = {
  get controller() { return game.controller; },
  get net() { return game.net; },
  get ui() { return game.ui; },
  get world() { return game.world; },
  game,
};
