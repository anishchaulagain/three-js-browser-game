/* global io */

export class Network {
  constructor() {
    this.socket = io();
    this.offset = 0;        // serverNow - clientNow
    this.worldStart = 0;
    this.dayLength = 2 * 60 * 60 * 1000; // fallback only — the server's value overrides this

    this.onWelcome = null;
    this.onJoined = null;
    this.onPlayerJoined = null;
    this.onState = null;
    this.onOutfit = null;
    this.onEmote = null;
    this.onGift = null;
    this.onCarState = null;
    this.onCarSeat = null;
    this.onChat = null;
    this.onLeft = null;
    this.onFull = null;
    this.onRoles = null;

    this.socket.on('welcome', (d) => {
      this._syncTime(d);
      this.onWelcome && this.onWelcome(d);
    });
    this.socket.on('joined', (d) => {
      this._syncTime(d);
      this.onJoined && this.onJoined(d);
    });
    this.socket.on('player_joined', (p) => this.onPlayerJoined && this.onPlayerJoined(p));
    this.socket.on('player_state', (s) => this.onState && this.onState(s));
    this.socket.on('outfit', (d) => this.onOutfit && this.onOutfit(d));
    this.socket.on('emote', (d) => this.onEmote && this.onEmote(d));
    this.socket.on('gift', (d) => this.onGift && this.onGift(d));
    this.socket.on('car_state', (d) => this.onCarState && this.onCarState(d));
    this.socket.on('car_seat', (d) => this.onCarSeat && this.onCarSeat(d));
    this.socket.on('chat', (d) => this.onChat && this.onChat(d));
    this.socket.on('player_left', (d) => this.onLeft && this.onLeft(d));
    this.socket.on('world_full', () => this.onFull && this.onFull());
    this.socket.on('roles', (d) => this.onRoles && this.onRoles(d));
  }

  _syncTime(d) {
    if (typeof d.serverNow === 'number') this.offset = d.serverNow - Date.now();
    if (typeof d.worldStart === 'number') this.worldStart = d.worldStart;
    if (typeof d.dayLength === 'number') this.dayLength = d.dayLength;
  }

  /** ms elapsed since the world began (server-synced) */
  elapsed() {
    return Date.now() + this.offset - this.worldStart;
  }

  /** 0..1 through the current in-game day (0 = 6 AM) */
  timeOfDay() {
    const e = this.elapsed();
    return ((e % this.dayLength) + this.dayLength) % this.dayLength / this.dayLength;
  }

  dayNumber() {
    return Math.floor(Math.max(0, this.elapsed()) / this.dayLength) + 1;
  }

  join(role, name, x, z, pubkey) { this.socket.emit('join', { role, name, x, z, pubkey }); }
  sendState(s) { this.socket.emit('state', s); }
  sendOutfit(i) { this.socket.emit('outfit', i); }
  sendEmote(e) { this.socket.emit('emote', e); }
  sendGift(flower) { this.socket.emit('gift', flower); }
  sendCarState(s) { this.socket.emit('car_state', s); }
  sendCarSeat(seat) { this.socket.emit('car_seat', seat); }
  /** envelope = {n, c} — already encrypted; plaintext never goes on the wire */
  sendChat(envelope) { this.socket.emit('chat', envelope); }
}
