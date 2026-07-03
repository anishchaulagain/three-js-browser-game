/**
 * 🎵 Kitchen radio — an audio-only YouTube player for the house.
 *
 * Same sync idea as the theater (the chosen song + play/pause/time relay
 * through the server and late joiners catch up), but on its own channel so a
 * movie in the theater and music in the kitchen never fight. The YouTube
 * iframe is parked off-screen — we only want its audio — and the volume
 * fades with your distance from the radio, so the music fills the house and
 * trails off outside.
 */
import { loadYouTubeAPI, parseYouTubeId } from './ytapi.js';

export class Radio {
  /** spot = { x, z } world position of the radio (for distance volume) */
  constructor({ net, ui, spot }) {
    this.net = net;
    this.ui = ui;
    this.spot = spot || { x: 0, z: 0 };
    this.state = null;        // {v, playing, t, at(serverMs)}
    this.player = null;
    this.playerReady = false;
    this.currentV = null;
    this.playing = false;
    this._volTimer = 0;

    // off-screen host — audio only, never shown
    this.host = document.createElement('div');
    Object.assign(this.host.style, {
      position: 'fixed', left: '-10000px', top: '0', width: '320px', height: '180px',
    });
    document.body.appendChild(this.host);

    this._wireDialog();
  }

  /* ============ YouTube ============ */
  async _ensurePlayer(videoId) {
    if (this.player || this._creating) return;
    this._creating = true;
    await loadYouTubeAPI();
    this.player = new YT.Player(this.host, {
      width: 320, height: 180, videoId,
      playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, disablekb: 1 },
      events: {
        onReady: () => { this.playerReady = true; this.currentV = videoId; this._sync(); },
      },
    });
  }

  /* ============ shared state ============ */
  apply(state, fromRemote = false) {
    if (!state || !state.v) return;
    const newSong = this.state?.v !== state.v;
    this.state = state;
    if (fromRemote && newSong && state.playing) this.ui.toast('🎵 Music is playing in the kitchen', 3000);
    this._ensurePlayer(state.v);
    if (this.playerReady) this._sync();
  }

  _targetTime() {
    const s = this.state;
    return s.playing ? s.t + Math.max(0, this.net.serverNow() - s.at) / 1000 : s.t;
  }

  _sync() {
    const s = this.state, p = this.player;
    if (!s || !p || !this.playerReady) return;
    const target = this._targetTime();
    if (this.currentV !== s.v) {
      this.currentV = s.v;
      p.loadVideoById(s.v, target);
      if (!s.playing) setTimeout(() => this.playerReady && p.pauseVideo(), 600);
    } else {
      if (Math.abs((p.getCurrentTime() || 0) - target) > 1.5) p.seekTo(target, true);
      if (s.playing) p.playVideo();
      else p.pauseVideo();
    }
    this.playing = s.playing;
    if (s.playing) this._verifyPlaying();
    else this._hideJoin();
  }

  /** unmuted audio needs a gesture — if blocked, offer one tap to hear it */
  _verifyPlaying() {
    clearTimeout(this._verifyTimer);
    this._verifyTimer = setTimeout(() => {
      if (this.state?.playing && this.playerReady && this.player.getPlayerState() !== 1) {
        document.getElementById('radio-join').classList.remove('hidden');
      }
    }, 1500);
  }

  _hideJoin() { document.getElementById('radio-join').classList.add('hidden'); }

  _send(v, playing, t) {
    if (!v) return;
    this.net.sendRadio({ v, playing, t });
    this.apply({ v, playing, t, at: this.net.serverNow() });
  }

  /* ============ dialog ============ */
  _wireDialog() {
    const $ = (id) => document.getElementById(id);
    const input = $('radio-input');

    $('radio-play').onclick = () => {
      const id = parseYouTubeId(input.value);
      if (id) {
        this._send(id, true, 0); // a fresh song from the start
        input.value = '';
        this.closeDialog();
      } else if (input.value.trim()) {
        this.ui.toast("That doesn't look like a YouTube link 🤔", 2400);
      } else if (this.state) {
        this._send(this.state.v, true, this.playerReady ? this.player.getCurrentTime() || 0 : this.state.t);
        this.closeDialog();
      } else {
        this.ui.toast('Paste a YouTube link first 🎵', 2200);
      }
    };
    $('radio-pause').onclick = () => {
      if (this.state?.playing && this.playerReady) this._send(this.state.v, false, this.player.getCurrentTime() || 0);
      this.closeDialog();
    };
    $('radio-close').onclick = () => this.closeDialog();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') $('radio-play').click();
      if (e.key === 'Escape') this.closeDialog();
    });
    $('radio-join').onclick = () => {
      this._hideJoin();
      if (this.playerReady && this.state) {
        this.player.seekTo(this._targetTime(), true);
        this.player.playVideo(); // real gesture — always allowed
      }
    };
  }

  openDialog() {
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('radio-popup').classList.remove('hidden');
    document.getElementById('radio-input').focus();
  }

  closeDialog() {
    document.getElementById('radio-input').blur();
    document.getElementById('radio-popup').classList.add('hidden');
  }

  get dialogOpen() {
    return !document.getElementById('radio-popup').classList.contains('hidden');
  }

  /* ============ per-frame ============ */
  update(dt, playerPos) {
    this._volTimer += dt;
    if (this._volTimer > 0.4 && this.playerReady && this.player.setVolume) {
      this._volTimer = 0;
      const d = Math.hypot(playerPos.x - this.spot.x, playerPos.z - this.spot.z);
      // full volume in the kitchen, trailing off across the house and outside
      const vol = Math.max(0, Math.min(1, 1 - (d - 4) / 16));
      this.player.setVolume(Math.round(vol * 100));
    }
  }
}
