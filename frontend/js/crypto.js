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
    this.shared = null;
    this.fingerprint = '';
  }

  get publicKeyB64() {
    return toB64(this.keyPair.publicKey);
  }

  get ready() {
    return !!this.shared;
  }

  /** Derive the shared secret from the partner's public key. */
  setPartnerKey(b64) {
    if (!b64 || typeof b64 !== 'string') return false;
    try {
      const pk = fromB64(b64);
      if (pk.length !== nacl.box.publicKeyLength) return false;
      this.shared = nacl.box.before(pk, this.keyPair.secretKey);
      // deterministic fingerprint of BOTH public keys (sorted → same on both ends)
      const h = nacl.hash(enc.encode([this.publicKeyB64, b64].sort().join('|')));
      this.fingerprint = [h[0], h[1], h[2]].map((b) => SEAL_EMOJIS[b % SEAL_EMOJIS.length]).join('');
      return true;
    } catch {
      return false;
    }
  }

  /** text → {n: nonce, c: ciphertext} (base64), or null if no channel yet */
  encrypt(text) {
    if (!this.shared) return null;
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const ct = nacl.box.after(enc.encode(text), nonce, this.shared);
    return { n: toB64(nonce), c: toB64(ct) };
  }

  /** {n, c} → text, or null if missing/tampered/not-for-us */
  decrypt(e) {
    if (!this.shared || !e || !e.n || !e.c) return null;
    try {
      const pt = nacl.box.open.after(fromB64(e.c), fromB64(e.n), this.shared);
      return pt ? dec.decode(pt) : null;
    } catch {
      return null;
    }
  }
}
