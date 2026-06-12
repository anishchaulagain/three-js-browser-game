/**
 * Interaction handlers — one entry per interactable `type`.
 *
 * To add a new interaction:
 *   1. Push an interactable ({x, z, radius, label, type, data}) from a world module.
 *   2. Add a handler here with the same `type`. It receives the Game instance
 *      and the interactable. Done.
 */
import { OUTFITS } from './avatar/outfits.js';
import { SNACKS, FLOWERS, POCKET_MAX } from './config.js';

export const interactionHandlers = {
  closet(game) {
    game.ui.openCloset(OUTFITS[game.self.role], game.self.outfit, (i) => {
      game.self.outfit = i;
      game.selfAvatar.applyOutfit(i);
      game.net.sendOutfit(i);
      game.selfAvatar.emote('✨');
      game.net.sendEmote('✨');
    });
  },

  bed(game, it) {
    const slot = it.data.slots[game.self.role === 'male' ? 0 : 1];
    game.controller.sitAt({ x: slot.x, z: slot.z, y: it.data.y, ry: slot.ry, exit: slot.exit }, 'sleep');
    game.ui.toast('So cozy… 💤 (move to get up)', 2200);
  },

  seat(game, it) {
    game.controller.sitAt(it.data, 'sit');
  },

  /** the home-theater media console — pick a movie */
  theater(game) {
    game.theater.openDialog();
  },

  cook(game) {
    game.selfAvatar.emote('🍳');
    game.net.sendEmote('🍳');
    const together = game.partner && game.distanceToPartner() < 5;
    game.ui.toast(together ? 'Dinner for two, coming up 🍝❤️' : 'You cooked a lovely meal 🍝', 2600);
  },

  fridge(game) {
    const snack = SNACKS[Math.floor(Math.random() * SNACKS.length)];
    game.selfAvatar.emote(snack);
    game.net.sendEmote(snack);
    game.ui.toast(`You grabbed a snack ${snack}`, 2000);
  },

  /** hop into the couple car (first one in drives) */
  car(game) {
    game.enterCar();
  },

  /** pluck a flower from the picking garden into your pocket */
  pick(game, it) {
    const { plant } = it.data;
    if (!plant.isUp()) return;
    if (game.pocket.length >= POCKET_MAX) {
      game.ui.toast('Your pocket is already full of flowers 💐', 2200);
      return;
    }
    plant.pick();
    const f = FLOWERS[plant.flower];
    game.addToPocket(plant.flower);
    game.selfAvatar.emote(f.emoji);
    game.net.sendEmote(f.emoji);
    game.ui.toast(`Picked a ${f.name} ${f.emoji} — press F near your love to give it`, 2400);
  },

  /** generic little moment: emote + toast, driven entirely by interactable data
      (fountain wishes, cinema, bakery, chapel bell, secret places, …) */
  moment(game, it) {
    const d = it.data || {};
    if (d.emoji) {
      game.selfAvatar.emote(d.emoji);
      game.net.sendEmote(d.emoji);
    }
    if (d.toast) game.ui.toast(d.toast, 2800);
  },
};
