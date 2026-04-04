'use strict';

// ─── TOAST NOTIFICATIONS ───
function showToast(message, type = 'default') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${type === 'success' ? '✓' : 'ℹ'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ─── MODAL ───
function openLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) m.classList.add('open');
}

function closeLoginModal() {
  const m = document.getElementById('loginModal');
  if (m) m.classList.remove('open');
}

function handleAuth(e) {
  e.preventDefault();
  showToast('🎉 Authentication coming soon!', 'success');
  closeLoginModal();
}

// ─── MODE SWITCHING ───
function activateMode(mode) {
  // Update hidden input
  const modeInput = document.getElementById('modeInput');
  if (modeInput) modeInput.value = mode;

  // Update tab buttons
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  // Show/hide panels
  document.querySelectorAll('.mode-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.mode === mode);
  });

  syncPayload();
}

// ─── SOCIAL CHIPS ───
function selectPlatform(platform) {
  const platformInput = document.getElementById('socialPlatform');
  if (platformInput) platformInput.value = platform;

  document.querySelectorAll('.platform-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.platform === platform);
  });

  const extra = document.getElementById('whatsappExtra');
  if (extra) extra.style.display = platform === 'whatsapp' ? 'grid' : 'none';

  syncPayload();
}

// ─── COLOR THEME PRESETS ───
const THEMES = {
  classic: { fill: '#0f172a', back: '#ffffff' },
  sunset:  { fill: '#4a2d16', back: '#ffe8cc' },
  mint:    { fill: '#005f56', back: '#e8fff8' },
  neon:    { fill: '#6c63ff', back: '#0d0d1a' },
  pink:    { fill: '#ff6b9d', back: '#1a0a14' },
  gold:    { fill: '#ffd700', back: '#17102f' },
  matrix:  { fill: '#00e5a0', back: '#020f0a' },
  orange:  { fill: '#ff6600', back: '#fff9f0' },
};

function applyTheme(fill, back) {
  const fillEl = document.getElementById('fillColor');
  const backEl = document.getElementById('backColor');
  const fillHex = document.getElementById('fillColorHex');
  const backHex = document.getElementById('backColorHex');

  if (fillEl) fillEl.value = fill;
  if (backEl) backEl.value = back;
  if (fillHex) fillHex.value = fill;
  if (backHex) backHex.value = back;
}

// ─── PAYLOAD BUILDER ───
function clean(v) { return (v || '').trim(); }

function buildPayload() {
  const modeInput = document.getElementById('modeInput');
  const mode = (modeInput?.value || 'custom').toLowerCase();

  if (mode === 'custom') return clean(document.querySelector('[name="qr_code"]')?.value);

  if (mode === 'social') {
    const platform = (document.getElementById('socialPlatform')?.value || '').toLowerCase();
    const raw = clean(document.querySelector('[name="social_handle"]')?.value).replace(/\s+/g, '');
    if (!raw) return '';
    if (platform === 'facebook') return `https://www.facebook.com/${raw.replace(/^@/, '')}`;
    if (platform === 'instagram') return `https://www.instagram.com/${raw.replace(/^@/, '')}`;
    if (platform === 'youtube') return `https://www.youtube.com/${raw}`;
    if (platform === 'x') return `https://x.com/${raw.replace(/^@/, '')}`;
    if (platform === 'linkedin') return `https://www.linkedin.com/in/${raw.replace(/^@/, '')}`;
    if (platform === 'telegram') return `https://t.me/${raw.replace(/^@/, '')}`;
    if (platform === 'tiktok') return raw.startsWith('@') ? `https://www.tiktok.com/${raw}` : `https://www.tiktok.com/@${raw}`;
    if (platform === 'website') return (raw.startsWith('http') ? raw : `https://${raw}`);
    if (platform === 'whatsapp') {
      const cc = (document.querySelector('[name="whatsapp_country"]')?.value || '').replace(/\D/g, '');
      const num = raw.replace(/\D/g, '');
      if (!num) return '';
      const merged = cc && !num.startsWith(cc) ? `${cc}${num}` : num;
      const msg = clean(document.querySelector('[name="whatsapp_message"]')?.value || '');
      return msg ? `https://wa.me/${merged}?text=${encodeURIComponent(msg)}` : `https://wa.me/${merged}`;
    }
    return '';
  }

  if (mode === 'email') {
    const to = clean(document.querySelector('[name="email_to"]')?.value);
    if (!to) return '';
    const sub = clean(document.querySelector('[name="email_subject"]')?.value);
    const body = clean(document.querySelector('[name="email_body"]')?.value);
    const q = [];
    if (sub) q.push(`subject=${encodeURIComponent(sub)}`);
    if (body) q.push(`body=${encodeURIComponent(body)}`);
    return `mailto:${to}${q.length ? '?' + q.join('&') : ''}`;
  }

  if (mode === 'phone') {
    const n = clean(document.querySelector('[name="phone_number"]')?.value);
    return n ? `tel:${n}` : '';
  }

  if (mode === 'sms') {
    const n = clean(document.querySelector('[name="sms_number"]')?.value);
    if (!n) return '';
    const msg = clean(document.querySelector('[name="sms_message"]')?.value);
    return `sms:${n}${msg ? `?body=${encodeURIComponent(msg)}` : ''}`;
  }

  if (mode === 'wifi') {
    const ssid = clean(document.querySelector('[name="wifi_ssid"]')?.value).replace(/;/g, '');
    if (!ssid) return '';
    const pass = clean(document.querySelector('[name="wifi_password"]')?.value).replace(/;/g, '');
    const sec = (document.querySelector('[name="wifi_security"]')?.value || 'WPA').toUpperCase();
    const hidden = document.querySelector('[name="wifi_hidden"]')?.checked ? 'true' : 'false';
    return `WIFI:T:${sec};S:${ssid};P:${pass};H:${hidden};;`;
  }

  if (mode === 'location') {
    const lat = clean(document.querySelector('[name="location_lat"]')?.value);
    const lon = clean(document.querySelector('[name="location_lon"]')?.value);
    return lat && lon ? `geo:${lat},${lon}` : '';
  }

  if (mode === 'vcard') {
    const name = clean(document.querySelector('[name="vcard_name"]')?.value);
    if (!name) return '';
    const org = clean(document.querySelector('[name="vcard_org"]')?.value);
    const title = clean(document.querySelector('[name="vcard_title"]')?.value);
    const phone = clean(document.querySelector('[name="vcard_phone"]')?.value);
    const email = clean(document.querySelector('[name="vcard_email"]')?.value);
    const website = clean(document.querySelector('[name="vcard_website"]')?.value);
    const address = clean(document.querySelector('[name="vcard_address"]')?.value);
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`];
    if (org) lines.push(`ORG:${org}`);
    if (title) lines.push(`TITLE:${title}`);
    if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
    if (email) lines.push(`EMAIL:${email}`);
    if (website) lines.push(`URL:${website}`);
    if (address) lines.push(`ADR:;;${address};;;;`);
    lines.push('END:VCARD');
    return lines.join('\n');
  }

  if (mode === 'event') {
    const title = clean(document.querySelector('[name="event_title"]')?.value);
    const startRaw = clean(document.querySelector('[name="event_start"]')?.value);
    if (!title || !startRaw) return '';
    const start = startRaw.replace(/[-:]/g, '') + '00';
    const endRaw = clean(document.querySelector('[name="event_end"]')?.value);
    const end = endRaw ? endRaw.replace(/[-:]/g, '') + '00' : '';
    const location = clean(document.querySelector('[name="event_location"]')?.value);
    const desc = clean(document.querySelector('[name="event_description"]')?.value);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `SUMMARY:${title}`, `DTSTART:${start}`];
    if (end) lines.push(`DTEND:${end}`);
    if (location) lines.push(`LOCATION:${location}`);
    if (desc) lines.push(`DESCRIPTION:${desc}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\n');
  }

  return '';
}

function syncPayload() {
  const payload = buildPayload();
  const preview = document.getElementById('payloadPreview');
  const hidden = document.getElementById('qrPayload');
  if (preview) preview.value = payload;
  if (hidden) hidden.value = payload;
}

function buildQrUrl(payload, format = 'png') {
  const fill = (document.getElementById('fillColor')?.value || '#0f172a').replace('#', '');
  const back = (document.getElementById('backColor')?.value || '#ffffff').replace('#', '');
  const ecLevel = document.querySelector('[name="error_level"]')?.value || 'M';
  const boxSize = Number(document.getElementById('boxSize')?.value || 10);
  const border = Number(document.getElementById('borderSize')?.value || 4);
  const size = Math.max(220, Math.min(900, boxSize * 26));

  const params = new URLSearchParams({
    text: payload,
    dark: fill,
    light: back,
    ecLevel,
    margin: String(border),
    size: String(size),
    format,
  });

  return `https://quickchart.io/qr?${params.toString()}`;
}

function renderQr(payload) {
  const qrImage = document.getElementById('qrImage');
  const qrDisplay = document.getElementById('qrDisplay');
  const placeholder = document.getElementById('qrPlaceholder');
  const downloadRow = document.getElementById('downloadRow');
  const downloadPng = document.getElementById('downloadPng');
  const downloadSvg = document.getElementById('downloadSvg');
  const encoded = document.getElementById('encodedContent');
  if (!qrImage || !qrDisplay || !placeholder || !downloadRow || !downloadPng || !downloadSvg || !encoded) return;

  const pngUrl = buildQrUrl(payload, 'png');
  const svgUrl = buildQrUrl(payload, 'svg');

  qrImage.src = pngUrl;
  qrImage.classList.remove('hidden');
  qrDisplay.classList.add('has-qr');
  placeholder.classList.add('hidden');
  downloadRow.classList.remove('hidden');
  encoded.classList.remove('hidden');

  downloadPng.href = pngUrl;
  downloadSvg.href = svgUrl;
  encoded.value = payload;
}

function clearQrResult() {
  const qrImage = document.getElementById('qrImage');
  const qrDisplay = document.getElementById('qrDisplay');
  const placeholder = document.getElementById('qrPlaceholder');
  const downloadRow = document.getElementById('downloadRow');
  const encoded = document.getElementById('encodedContent');
  if (!qrImage || !qrDisplay || !placeholder || !downloadRow || !encoded) return;

  qrImage.src = '';
  qrImage.classList.add('hidden');
  qrDisplay.classList.remove('has-qr');
  placeholder.classList.remove('hidden');
  downloadRow.classList.add('hidden');
  encoded.classList.add('hidden');
  encoded.value = '';
}

// ─── HISTORY ───
function getHistory() {
  try { return JSON.parse(localStorage.getItem('qr_history') || '[]'); }
  catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem('qr_history', JSON.stringify(items.slice(0, 8)));
}

function addToHistory(payload) {
  const p = clean(payload);
  if (!p) return;
  const hist = getHistory().filter(h => h !== p);
  hist.unshift(p);
  saveHistory(hist);
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!list) return;
  const items = getHistory();
  list.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No recent payloads yet.';
    list.appendChild(li);
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-item';
    btn.textContent = item.length > 64 ? item.slice(0, 64) + '…' : item;
    btn.title = item;
    btn.addEventListener('click', () => {
      activateMode('custom');
      const cd = document.querySelector('[name="qr_code"]');
      if (cd) cd.value = item;
      syncPayload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

// ─── SCROLL REVEAL ───
function initScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal, .stagger').forEach(el => observer.observe(el));
}

// ─── RANGE DISPLAY ───
function bindRange(inputId, outputId, suffix = '') {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  if (!input || !output) return;
  const sync = () => { output.textContent = input.value + suffix; };
  sync();
  input.addEventListener('input', sync);
}

// ─── COLOR HEX SYNC ───
function syncColorHex(colorId, hexId) {
  const colorEl = document.getElementById(colorId);
  const hexEl = document.getElementById(hexId);
  if (!colorEl || !hexEl) return;

  colorEl.addEventListener('input', () => { hexEl.value = colorEl.value; });
  hexEl.addEventListener('input', () => {
    const val = hexEl.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) colorEl.value = val;
  });
}

// ─── MAIN INIT ───
document.addEventListener('DOMContentLoaded', () => {

  // Modal
  document.getElementById('modalClose')?.addEventListener('click', closeLoginModal);
  document.getElementById('loginModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  // Modal tabs
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      const h2 = document.querySelector('.modal h2');
      const sub = document.querySelector('.modal-sub');
      if (h2) h2.textContent = isLogin ? 'Welcome Back' : 'Create Account';
      if (sub) sub.textContent = isLogin ? 'Sign in to sync your QR codes and history' : 'Start generating QR codes for free';
    });
  });

  // Mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => activateMode(tab.dataset.mode));
  });

  // Social chips
  document.querySelectorAll('.platform-chip').forEach(chip => {
    chip.addEventListener('click', () => selectPlatform(chip.dataset.platform));
  });

  // Theme presets (swatches)
  document.querySelectorAll('.theme-preset').forEach(preset => {
    preset.addEventListener('click', () => {
      document.querySelectorAll('.theme-preset').forEach(p => p.classList.remove('selected'));
      preset.classList.add('selected');
      applyTheme(preset.dataset.fill, preset.dataset.back);
      syncPayload();
    });
  });

  // Color hex sync
  syncColorHex('fillColor', 'fillColorHex');
  syncColorHex('backColor', 'backColorHex');

  // Range sliders
  bindRange('boxSize', 'boxSizeVal');
  bindRange('borderSize', 'borderVal');
  bindRange('logoScale', 'logoScaleVal', '%');

  // Live payload sync on all inputs
  document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', syncPayload);
    el.addEventListener('change', syncPayload);
  });

  // Copy payload button
  document.getElementById('copyPayload')?.addEventListener('click', () => {
    const text = document.getElementById('payloadPreview')?.value || '';
    if (!text.trim()) { showToast('Nothing to copy yet!'); return; }
    navigator.clipboard?.writeText(text)
      .then(() => showToast('✓ Payload copied!', 'success'))
      .catch(() => {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        temp.remove();
        showToast('✓ Payload copied!', 'success');
      });
  });

  // Reset form
  document.getElementById('resetForm')?.addEventListener('click', () => {
    document.getElementById('qrForm')?.reset();
    activateMode('custom');
    applyTheme('#0f172a', '#ffffff');
    clearQrResult();
    syncPayload();
    showToast('↺ Form reset', 'default');
  });

  // Clear history
  document.getElementById('clearHistory')?.addEventListener('click', () => {
    saveHistory([]);
    renderHistory();
    showToast('History cleared', 'default');
  });

  // Form submit
  document.getElementById('qrForm')?.addEventListener('submit', (e) => {
    syncPayload();
    const payload = clean(document.getElementById('qrPayload')?.value || '');
    e.preventDefault();
    if (!payload) {
      showToast('⚠ Please enter some content first!');
      return;
    }
    renderQr(payload);
    addToHistory(payload);
    showToast('QR generated', 'success');
  });

  // Load encoded content into history on page load (after generation)
  const encodedEl = document.querySelector('.encoded-content');
  if (encodedEl?.value) addToHistory(encodedEl.value);

  // Init
  renderHistory();
  syncPayload();
  initScrollReveal();

  // Page entrance animation stagger for hero
  setTimeout(() => {
    document.querySelectorAll('.hero-card').forEach((card, i) => {
      setTimeout(() => card.classList.add('visible'), i * 80);
    });
  }, 400);
});
