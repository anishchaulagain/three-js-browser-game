/**
 * Secret cheat codes — press ` (backquote) in-game, type a code, hit Enter.
 * Add a new cheat by adding an entry here; it receives the Game instance.
 */
export const CHEATS = {
  /** BEAST — summon the couple car right in front of you, ready to drive */
  beast(game) {
    if (game.carSeat) {
      game.ui.toast("You're already in the Beast 😉", 2200);
      return;
    }
    if (game.partnerCarSeat) {
      game.ui.toast('Your love is using the car right now 😅', 2400);
      return;
    }
    const c = game.controller;
    // within the car's interact radius so E works immediately
    const x = c.pos.x + Math.sin(c.ry) * 2.4;
    const z = c.pos.z + Math.cos(c.ry) * 2.4;
    game.world.car.snapTo({ x, z, ry: c.ry, v: 0 });
    game.net.sendCarState({ x, z, ry: c.ry, v: 0 }); // partner sees it arrive too
    game.selfAvatar.emote('🚗');
    game.net.sendEmote('🚗');
    game.ui.toast('🚗 BEAST! Your ride has arrived', 2800);
  },
};
