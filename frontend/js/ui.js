/** DOM / HUD manager — no three.js in here. */

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.closetOpen = false;
    this._toastTimer = null;
    this._chatVisible = false;
    this._onChatSend = null;

    $('closet-close').addEventListener('click', () => this.closeCloset());
  }

  /* ===== character select ===== */
  showSelect(taken, onJoin) {
    const screen = $('select-screen');
    screen.classList.remove('hidden');
    let selected = null;
    const cards = [...document.querySelectorAll('.char-card')];
    const btn = $('join-btn');

    const refresh = (takenRoles) => {
      for (const card of cards) {
        const role = card.dataset.role;
        const isTaken = takenRoles.includes(role);
        card.classList.toggle('taken', isTaken);
        card.querySelector('.char-taken').classList.toggle('hidden', !isTaken);
        if (isTaken && selected === role) {
          selected = null;
          card.classList.remove('selected');
        }
      }
      btn.disabled = !selected;
      btn.textContent = selected ? 'Enter our world 💞' : 'Pick a character ↑';
    };

    for (const card of cards) {
      card.onclick = () => {
        if (card.classList.contains('taken')) return;
        selected = card.dataset.role;
        cards.forEach((c) => c.classList.toggle('selected', c === card));
        btn.disabled = false;
        btn.textContent = 'Enter our world 💞';
      };
    }
    btn.onclick = () => {
      if (!selected) return;
      btn.disabled = true;
      btn.textContent = 'Entering…';
      onJoin(selected, $('name-input').value.trim());
    };

    this._refreshTaken = refresh;
    refresh(taken || []);
  }

  updateTaken(taken) {
    if (this._refreshTaken && !$('select-screen').classList.contains('hidden')) {
      this._refreshTaken(taken);
    }
  }

  hideSelect() {
    $('select-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  showFull() {
    $('select-screen').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('full-screen').classList.remove('hidden');
  }

  /* ===== clock ===== */
  setClock(timeStr, phase, emoji, dayStr, frac) {
    $('clock-time').textContent = timeStr;
    $('clock-phase').textContent = phase;
    $('clock-emoji').textContent = emoji;
    $('day-label').textContent = dayStr;
    $('day-bar-fill').style.width = `${(frac * 100).toFixed(1)}%`;
  }

  setPartnerStatus(text) {
    $('partner-status').textContent = text;
  }

  /** items: [{emoji, count}] — what's in your flower pocket */
  setPocket(items) {
    const el = $('pocket');
    el.classList.remove('hidden');
    if (!items.length) {
      el.innerHTML = '<span class="pocket-empty">🌸 pocket empty — flowers grow at the Pick-a-Bloom garden</span>';
      return;
    }
    el.innerHTML =
      items.map((i) => `<span class="pocket-slot">${i.emoji}<b>×${i.count}</b></span>`).join('') +
      '<span class="pocket-hint">F — give 💝</span>';
  }

  /* ===== prompt + toast ===== */
  showPrompt(html) {
    const p = $('prompt');
    p.innerHTML = html;
    p.classList.remove('hidden');
  }

  hidePrompt() {
    $('prompt').classList.add('hidden');
  }

  toast(text, ms = 2600) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  /* ===== closet ===== */
  openCloset(outfits, current, onPick) {
    this.closetOpen = true;
    if (document.exitPointerLock) document.exitPointerLock(); // free the cursor for the UI
    const grid = $('closet-grid');
    grid.innerHTML = '';
    outfits.forEach((o, i) => {
      const card = document.createElement('div');
      card.className = 'outfit-card' + (i === current ? ' selected' : '');
      const hex = (c) => '#' + c.toString(16).padStart(6, '0');
      card.innerHTML = `
        <div class="outfit-icon">${o.icon}</div>
        <div class="outfit-swatches">
          <div class="swatch" style="background:${hex(o.top)}"></div>
          <div class="swatch" style="background:${hex(o.bottom)}"></div>
          <div class="swatch" style="background:${hex(o.shoes)}"></div>
        </div>
        <div class="outfit-name">${o.name}</div>`;
      card.onclick = () => {
        grid.querySelectorAll('.outfit-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        onPick(i);
      };
      grid.appendChild(card);
    });
    $('closet-modal').classList.remove('hidden');
  }

  closeCloset() {
    this.closetOpen = false;
    $('closet-modal').classList.add('hidden');
  }

  /* ===== chat ===== */
  setupChat(onSend) {
    this._onChatSend = onSend;
    const input = $('chat-input');
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) onSend(text);
        this.closeChat();
      } else if (e.key === 'Escape') {
        this.closeChat();
      }
    });
  }

  openChat() {
    this._chatVisible = true;
    if (document.exitPointerLock) document.exitPointerLock(); // free the cursor while typing
    const input = $('chat-input');
    input.classList.remove('hidden');
    input.value = '';
    input.focus();
  }

  closeChat() {
    this._chatVisible = false;
    const input = $('chat-input');
    input.value = '';
    input.classList.add('hidden');
    input.blur();
  }

  addChatMessage(name, text) {
    const log = $('chat-log');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    const b = document.createElement('b');
    b.textContent = name + ': ';
    div.appendChild(b);
    div.appendChild(document.createTextNode(text));
    log.appendChild(div);
    while (log.children.length > 6) log.removeChild(log.firstChild);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 12000);
  }

  isTyping() {
    const el = document.activeElement;
    return this._chatVisible || (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'));
  }
}
