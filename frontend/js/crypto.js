/**
 * End-to-end encryption for chat (TweetNaCl: Curve25519 + XSalsa20-Poly1305).
 *
 * Each client generates a keypair on load and shares only the PUBLIC key via
 * the server. Both sides derive the same shared secret; messages travel as
 * ciphertext the server cannot read. The emoji "love seal" is a fingerprint
 * of both public keys — if it matches on both screens, nobody is in between.
 */
/* global nacl */

const SEAL_EMOJIS = [
  '🦊', '🌙', '🍓', '🌷', '🐻', '⭐', '🍑', '🦋', '🌈', '🍒', '🐰', '🌻',
  '🍯', '🐳', '🔥', '🍀', '🎀', '🦄', '🍇', '🐱', '🌊', '🍩', '🐝', '💎',
  '🍉', '🦜', '🌵', '🥐', '🐠', '🍄', '🎈', '🕊️',
];

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (u8) => btoa(String.fromCharCode(...u8));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class SecureChannel {
  constructor() {
    this.keyPair = nacl.box.keyPair();
    /** peerId → { shared, fingerprint } — one pairwise channel per player */
    this.peers = new Map();
  }

  get publicKeyB64() {
    return toB64(this.keyPair.publicKey);
  }

  hasPeer(id) {
    return this.peers.has(id);
  }

  fingerprintOf(id) {
    const p = this.peers.get(id);
    return p ? p.fingerprint : '';
  }

  /** Derive a shared secret with one peer from their public key. */
  setPeerKey(id, b64) {
    if (!id || !b64 || typeof b64 !== 'string') return false;
    try {
      const pk = fromB64(b64);
      if (pk.length !== nacl.box.publicKeyLength) return false;
      const shared = nacl.box.before(pk, this.keyPair.secretKey);
      // deterministic fingerprint of BOTH public keys (sorted → same on both ends)
      const h = nacl.hash(enc.encode([this.publicKeyB64, b64].sort().join('|')));
      const fingerprint = [h[0], h[1], h[2]].map((b) => SEAL_EMOJIS[b % SEAL_EMOJIS.length]).join('');
      this.peers.set(id, { shared, fingerprint });
      return true;
    } catch {
      return false;
    }
  }

  removePeer(id) {
    this.peers.delete(id);
  }

  /** text → {n: nonce, c: ciphertext} (base64) for ONE peer, or null */
  encryptFor(id, text) {
    const p = this.peers.get(id);
    if (!p) return null;
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const ct = nacl.box.after(enc.encode(text), nonce, p.shared);
    return { n: toB64(nonce), c: toB64(ct) };
  }

  /** {n, c} from a peer → text, or null if missing/tampered/not-for-us */
  decryptFrom(id, e) {
    const p = this.peers.get(id);
    if (!p || !e || !e.n || !e.c) return null;
    try {
      const pt = nacl.box.open.after(fromB64(e.c), fromB64(e.n), p.shared);
      return pt ? dec.decode(pt) : null;
    } catch {
      return null;
    }
  }
}
