/**
 * 🍿 Home theater — a real YouTube player living on the screen in the house's
 * theater annex, watched together in perfect sync.
 *
 * How the video gets "into" the 3D world: the YouTube iframe sits in a
 * CSS3DRenderer layer BEHIND the WebGL canvas, transformed with the same
 * camera. The WebGL scene draws a screen-shaped "hole" mesh whose shader
 * writes vec4(0) with NoBlending — punching transparent pixels in the canvas
 * exactly where the screen is, so the iframe shows through with correct wall
 * occlusion (anything drawn in front of the hole covers it).
 *
 * Sync: whoever acts (set link / play / pause / stand up) broadcasts
 * {v, playing, t} through the server, which timestamps and relays it (and
 * hands it to late joiners). Each client seeks/plays/pauses to match;
 * clock offset comes from the existing world-clock sync.
 *
 * House rule: when anyone on the sofa stands up, the movie pauses for both.
 */
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const PX_W = 800, PX_H = 450; // iframe pixels (16:9), scaled down to world size

const parseYouTubeId = (input) => {
  const s = String(input || '').trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/) ||
            s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
};

export class Theater {
  constructor({ scene, screen, net, ui }) {
    this.net = net;
    this.ui = ui;
    this.screen = screen;
    this.state = null;        // {v, playing, t, at(serverMs)} — the shared truth
    this.player = null;
    this.playerReady = false;
    this.currentV = null;
    this._volTimer = 0;
    this._verifyTimer = null;

    /* ---- CSS3D layer behind the WebGL canvas ---- */
    this.cssScene = new THREE.Scene();
    this.cssRenderer = new CSS3DRenderer();
    Object.assign(this.cssRenderer.domElement.style, {
      position: 'fixed', top: '0', left: '0', zIndex: '0', pointerEvents: 'none',
    });
    this.cssRenderer.setSize(window.innerWidth, window.innerHeight);
    document.body.prepend(this.cssRenderer.domElement);
    window.addEventListener('resize', () =>
      this.cssRenderer.setSize(window.innerWidth, window.innerHeight));

    const el = document.createElement('div');
    Object.assign(el.style, { width: `${PX_W}px`, height: `${PX_H}px`, background: '#0a0a10' });
    this.host = document.createElement('div');
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    el.appendChild(this.host);
    const cssObj = new CSS3DObject(el);
    cssObj.position.set(screen.x, screen.y, screen.z);
    cssObj.rotation.y = screen.ry;
    cssObj.scale.setScalar(screen.w / PX_W);
    this.cssScene.add(cssObj);

    // the alpha hole in the WebGL canvas, exactly where the screen is
    const hole = new THREE.Mesh(
      new THREE.PlaneGeometry(screen.w, screen.h),
      new THREE.ShaderMaterial({
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }',
        blending: THREE.NoBlending,
        side: THREE.DoubleSide,
      })
    );
    hole.position.set(screen.x, screen.y, screen.z);
    hole.rotation.y = screen.ry;
    scene.add(hole);

    this._wireDialog();
  }

  /* ============ YouTube IFrame API ============ */
  _api() {
    if (this._apiPromise) return this._apiPromise;
    this._apiPromise = new Promise((resolve) => {
      if (window.YT && window.YT.Player) return resolve();
      window.onYouTubeIframeAPIReady = () => resolve();
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return this._apiPromise;
  }

  async _ensurePlayer(videoId) {
    if (this.player || this._creating) return; // guard the async gap — one player only
    this._creating = true;
    await this._api();
    this.player = new YT.Player(this.host, {
      width: PX_W, height: PX_H, videoId,
      playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, disablekb: 1, iv_load_policy: 3 },
      events: {
        onReady: () => {
          this.playerReady = true;
          this.currentV = videoId;
          this._sync();
        },
      },
    });
  }

  /* ============ shared state ============ */
  /** incoming state (from the server, a peer, or ourselves) */
  apply(state, fromRemote = false) {
    if (!state || !state.v) return;
    const newVideo = this.state?.v !== state.v;
    this.state = state;
    if (fromRemote && newVideo) this.ui.toast('Movie night is starting 🍿', 3000);
    this._ensurePlayer(state.v);
    if (this.playerReady) this._sync();
  }

  /** where the shared playhead is right now (seconds) */
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
    if (s.playing) this._verifyPlaying();
    else this._hideJoin();
  }

  /**
   * Browsers block un-gestured playback with sound — but MUTED autoplay is
   * always allowed. If play didn't take, start the movie silently (so the
   * partner sees it in sync immediately) and offer one tap for sound.
   */
  _verifyPlaying() {
    clearTimeout(this._verifyTimer);
    this._verifyTimer = setTimeout(() => {
      if (!this.state?.playing || !this.playerReady) return;
      const st = this.player.getPlayerState();
      if (st === 1 || st === 3) return; // playing or buffering — all good
      this.player.mute();
      this._muted = true;
      this.player.seekTo(this._targetTime(), true);
      this.player.playVideo();
      const btn = document.getElementById('theater-join');
      btn.textContent = '🔊 Tap for sound';
      btn.classList.remove('hidden');
    }, 1500);
  }

  _hideJoin() {
    document.getElementById('theater-join').classList.add('hidden');
  }

  /** broadcast an action and apply it locally */
  _send(playing, t, v = this.state && this.state.v) {
    if (!v) return;
    this.net.sendTheater({ v, playing, t });
    this.apply({ v, playing, t, at: this.net.serverNow() });
  }

  /** house rule: leaving the sofa pauses the movie for everyone */
  userStood() {
    if (this.state?.playing && this.playerReady) {
      this._send(false, this.player.getCurrentTime() || 0);
      this.ui.toast('Movie paused — someone got up 🍿', 2200);
    }
  }

  /* ============ dialog ============ */
  _wireDialog() {
    const $ = (id) => document.getElementById(id);
    const popup = $('theater-popup');
    const input = $('theater-input');

    $('theater-play').onclick = () => {
      const id = parseYouTubeId(input.value);
      if (id) {
        this._send(true, 0, id); // fresh movie from the start
        input.value = '';
        this.closeDialog();
      } else if (input.value.trim()) {
        this.ui.toast("That doesn't look like a YouTube link 🤔", 2400);
      } else if (this.state) {
        this._send(true, this.playerReady ? this.player.getCurrentTime() || 0 : this.state.t);
        this.closeDialog();
      } else {
        this.ui.toast('Paste a YouTube link first 🎬', 2200);
      }
    };
    $('theater-pause').onclick = () => {
      if (this.state?.playing && this.playerReady) {
        this._send(false, this.player.getCurrentTime() || 0);
      }
      this.closeDialog();
    };
    $('theater-close').onclick = () => this.closeDialog();
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') $('theater-play').click();
      if (e.key === 'Escape') this.closeDialog();
    });
    $('theater-join').onclick = () => {
      this._hideJoin();
      if (!this.playerReady || !this.state) return;
      if (this._muted) {
        this.player.unMute(); // the movie is already rolling silently
        this._muted = false;
        return;
      }
      this.player.seekTo(this._targetTime(), true);
      this.player.playVideo(); // a real user gesture — always allowed
    };
  }

  openDialog() {
    if (document.exitPointerLock) document.exitPointerLock();
    document.getElementById('theater-popup').classList.remove('hidden');
    document.getElementById('theater-input').focus();
  }

  closeDialog() {
    const input = document.getElementById('theater-input');
    input.blur();
    document.getElementById('theater-popup').classList.add('hidden');
  }

  get dialogOpen() {
    return !document.getElementById('theater-popup').classList.contains('hidden');
  }

  /* ============ per-frame ============ */
  update(dt, playerPos) {
    this._volTimer += dt;
    if (this._volTimer > 0.5 && this.playerReady && this.player.setVolume) {
      this._volTimer = 0;
      const d = Math.hypot(playerPos.x - this.screen.x, playerPos.z - this.screen.z);
      this.player.setVolume(Math.round(THREE.MathUtils.clamp(1 - (d - 5) / 18, 0, 1) * 100));
    }
    // gentle drift correction during long movies (buffering, tab naps…)
    this._driftTimer = (this._driftTimer || 0) + dt;
    if (this._driftTimer > 10) {
      this._driftTimer = 0;
      if (this.state?.playing && this.playerReady && this.player.getPlayerState() === 1) {
        const drift = Math.abs((this.player.getCurrentTime() || 0) - this._targetTime());
        if (drift > 2.5) this.player.seekTo(this._targetTime(), true);
      }
    }
  }

  render(camera) {
    this.cssRenderer.render(this.cssScene, camera);
  }
}
