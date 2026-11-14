'use strict';
/* ════════════════════════════════════════════════════════════════
   Tango — vocabulary pools.  Dependency-free single-page app.
   All learning content lives in /data (see README.md for format).
   ════════════════════════════════════════════════════════════════ */

// ───────────────────────── helpers ─────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const KEYS = { settings: 'tango.settings', progress: 'tango.progress', custom: 'tango.custom', prefs: 'tango.prefs' };
const LEVELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const later = (fn, ms = 250) => setTimeout(fn, ms);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function download(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const ICON = {
  speaker: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const icon = name => h('span', { html: ICON[name], style: 'display:grid' });

// ───────────────────────── seeded randomness ─────────────────────────
function hash32(str) {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFrom = s => mulberry32(hash32(String(s)));
function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
function genSeed() {
  const a = ['red', 'blue', 'swift', 'quiet', 'iron', 'lucky', 'wild', 'misty', 'bold', 'silver', 'ember', 'frost', 'lunar', 'solar', 'hidden', 'brave'];
  const b = ['fox', 'crane', 'tiger', 'koi', 'owl', 'dragon', 'lotus', 'wolf', 'hare', 'phoenix', 'bamboo', 'tide', 'comet', 'lantern', 'sprite', 'golem'];
  return `${pick(a)}-${pick(b)}-${Math.floor(Math.random() * 90 + 10)}`;
}

// ───────────────────────── sentence markup ─────────────────────────
// {漢字|かんじ} = furigana,  [ ... ] = the target word inside an example sentence.
const RUBY = /\{([^|{}]+)\|([^{}]+)\}/g;
const Text = {
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  html(s, { furi = true, cloze = false, mark = true } = {}) {
    let x = Text.esc(s || '');
    if (cloze) x = x.replace(/\[[^\]]*\]/g, '<span class="blank">?</span>');
    x = x.replace(RUBY, furi ? '<ruby>$1<rt>$2</rt></ruby>' : '$1');
    return mark ? x.replace(/\[/g, '<mark>').replace(/\]/g, '</mark>') : x.replace(/[[\]]/g, '');
  },
  plain: s => (s || '').replace(RUBY, '$1').replace(/[[\]]/g, ''),
  kana: s => (s || '').replace(RUBY, '$2').replace(/[[\]]/g, ''),
  target(s) { const m = /\[([^\]]+)\]/.exec(s || ''); return m ? Text.plain(m[1]) : null; },
};

// ───────────────────────── kana → romaji ─────────────────────────
const Kana = (() => {
  const table = {};
  ('あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto ' +
   'なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo ' +
   'らra りri るru れre ろro わwa ゐi ゑe をo んn がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo ' +
   'だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo ゔvu ' +
   'ぁa ぃi ぅu ぇe ぉo ゃya ゅyu ょyo ゎwa').split(' ').forEach(p => { table[p[0]] = p.slice(1); });
  const SMALL_Y = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
  const SMALL_V = { ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };
  const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const hasKana = s => /[぀-ヿ]/.test(s);

  function toRomaji(input) {
    const s = toHira(input || '');
    let out = '', gem = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n = s[i + 1];
      if (c === 'っ') { gem = true; continue; }
      if (c === 'ー') { const m = out.match(/[aeiou]$/); if (m) out += m[0]; continue; }
      let r = table[c];
      if (r === undefined) { out += c; gem = false; continue; }
      if (n && SMALL_Y[n] && r.length > 1 && r.endsWith('i')) {
        const base = r.slice(0, -1);
        r = /(sh|ch|j)$/.test(base) ? base + SMALL_Y[n] : base + 'y' + SMALL_Y[n];
        i++;
      } else if (n && SMALL_V[n] && c !== 'ん') {
        r = (r === 'u' ? 'w' : r.replace(/[aeiou]$/, '')) + SMALL_V[n];
        i++;
      } else if (c === 'ん' && n && /^[aiueoy]/.test(table[n] || '')) {
        r = "n'";
      }
      if (gem) { out += r.startsWith('ch') ? 't' : r[0]; gem = false; }
      out += r;
    }
    return out;
  }

  // Lenient key for comparing typed answers: accepts kana, Hepburn, or wāpuro-style romaji.
  function lenient(str) {
    // strip Latin accents (ō → o) but recompose so kana dakuten (じ, ぶ) survive
    let s = (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase();
    if (hasKana(s)) s = toRomaji(s);
    return s.replace(/[^a-z]/g, '')
      .replace(/c(?=ch)/g, 't')
      .replace(/sh/g, 'sy').replace(/ch/g, 'ty').replace(/ts(?=u)/g, 't').replace(/f(?=u)/g, 'h').replace(/j/g, 'zy')
      .replace(/yy/g, 'y').replace(/([szt])yi/g, '$1i')
      .replace(/wo/g, 'o').replace(/n+/g, 'n')
      .replace(/ou/g, 'o').replace(/ei/g, 'e')
      .replace(/([aeiou])\1+/g, '$1');
  }
  return { toRomaji, lenient, hasKana, toHira };
})();

const fold = s => (s || '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// ───────────────────────── speech ─────────────────────────
const TTS = {
  ok: typeof window !== 'undefined' && 'speechSynthesis' in window,
  voices: [],
  init() {
    if (!this.ok) return;
    const load = () => { this.voices = speechSynthesis.getVoices(); };
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
  },
  list(lang) {
    const base = (lang || '').toLowerCase().split('-')[0];
    return this.voices.filter(v => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base);
  },
  voice(lang) {
    const l = this.list(lang);
    const pref = S.settings.voices[lang];
    const norm = v => v.lang.replace('_', '-');
    return l.find(v => v.name === pref) || l.find(v => norm(v) === lang && v.localService) || l.find(v => norm(v) === lang) || l[0] || null;
  },
  available(lang) { return this.ok && (this.voices.length === 0 || this.list(lang).length > 0); },
  speak(text, lang, rate) {
    if (!this.ok || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = this.voice(lang);
    if (v) u.voice = v;
    u.rate = rate ?? S.settings.rate;
    speechSynthesis.speak(u);
  },
};

// ───────────────────────── state ─────────────────────────
const S = {
  langs: {},
  pools: {},
  lang: null,
  sel: new Set(),
  levels: new Set([1, 2]),
  size: 4,
  ramp: false,
  seed: '',
  view: 'home',
  keys: {},
  ui: { allBatches: false, wl: { q: '', pool: 'sel', lv: 0, status: '' } },
  settings: (() => {
    const st = Object.assign({ furigana: true, romaji: true, autoplay: true, rate: 0.9, produce: 'all', voices: {} }, store.get(KEYS.settings, {}));
    st.kinds = Object.assign({ meaning: true, reverse: true, cloze: true, listen: true, type: true, match: true }, st.kinds);
    return st;
  })(),
  progress: store.get(KEYS.progress, {}),
  custom: store.get(KEYS.custom, []),
  prefs: store.get(KEYS.prefs, {}),
  _lw: {},
};
let L = null; // the active lesson

const langInfo = code => S.langs[code] || { code, name: code, tts: code, pools: [] };
const isKanaLang = w => langInfo(w.lang).romanize === 'kana';
const hasReading = w => !!w.reading && w.reading !== w.word;
const romaji = w => w.romaji || (isKanaLang(w) && (w.reading || Kana.hasKana(w.word)) ? Kana.toRomaji(w.reading || w.word) : '');
const ttsLang = w => langInfo(w.lang).tts || w.lang;
const sayWord = (w, slow) => TTS.speak(w.say || w.reading || w.word, ttsLang(w), slow ? S.settings.rate * 0.65 : undefined);
const saySentence = (w, slow) => TTS.speak(Text.plain(w.sentence), ttsLang(w), slow ? S.settings.rate * 0.65 : undefined);

function poolsFor(lang) {
  return Object.values(S.pools).filter(p => p.language === lang)
    .sort((a, b) => (a.custom - b.custom) || (a._order - b._order));
}
function langWords(lang) {
  if (S._lw[lang]) return S._lw[lang];
  const seen = new Set(), out = [];
  for (const p of poolsFor(lang)) for (const w of p.words) if (!seen.has(w.key)) { seen.add(w.key); out.push(w); }
  return (S._lw[lang] = out);
}

// ───────────────────────── progress ─────────────────────────
const P = {
  get: w => S.progress[w.key] || { seen: 0, right: 0, wrong: 0, box: 0 },
  put(w, p) { S.progress[w.key] = p; store.set(KEYS.progress, S.progress); },
  seen(w) { const p = { ...P.get(w) }; p.seen++; p.last = Date.now(); P.put(w, p); },
  grade(w, ok) {
    const p = { ...P.get(w) };
    if (!p.seen) p.seen = 1;
    if (ok) { p.right++; p.box = Math.min(5, p.box + 1); } else { p.wrong++; p.box = Math.max(0, p.box - 1); }
    p.last = Date.now();
    P.put(w, p);
  },
  status(w) { const p = P.get(w); return !p.seen ? 'new' : p.box >= 4 ? 'known' : 'learning'; },
  addSentence(w, text) { const p = { ...P.get(w) }; p.mine = [text, ...(p.mine || []).filter(x => x !== text)].slice(0, 5); P.put(w, p); },
};

// ───────────────────────── loading data ─────────────────────────
let poolOrder = 0;
function addPool(raw, langCode, custom) {
  const language = raw.language || raw.lang || langCode;
  if (!S.langs[language]) S.langs[language] = { code: language, name: raw.languageName || language, tts: raw.tts || language, pools: [], synthetic: true };
  const pool = {
    id: raw.id, title: raw.title || raw.id, description: raw.description || '', category: raw.category || (custom ? 'Custom' : 'Other'),
    language, custom: !!custom, _order: poolOrder++, raw,
  };
  pool.words = (raw.words || []).filter(w => w && w.word && w.meaning).map(w => normWord(w, pool));
  S.pools[pool.id] = pool;
  S._lw = {};
  return pool;
}
function normWord(w, pool) {
  const out = { ...w, lang: pool.language, pool: pool.id, level: [1, 2, 3].includes(+w.level) ? +w.level : 2 };
  if (out.sentence && !out.sentence.includes('[')) {
    // auto-mark the target word (case-insensitive) when the author didn't use [ ]
    const i = out.sentence.toLowerCase().indexOf(out.word.toLowerCase());
    if (i >= 0) out.sentence = `${out.sentence.slice(0, i)}[${out.sentence.slice(i, i + out.word.length)}]${out.sentence.slice(i + out.word.length)}`;
  }
  out.key = `${out.lang}|${out.word}|${out.reading || ''}`;
  return out;
}

// ───────────────────────── session config & sharing ─────────────────────────
function buildMix() {
  const pools = [...S.sel].map(id => S.pools[id]).filter(p => p && p.language === S.lang).sort((a, b) => (a.id < b.id ? -1 : 1));
  const seen = new Set(), words = [];
  for (const p of pools) for (const w of p.words) if (S.levels.has(w.level) && !seen.has(w.key)) { seen.add(w.key); words.push(w); }
  const mixed = shuffle(words, rngFrom(`${S.seed}|${S.lang}`));
  return S.ramp ? mixed.sort((a, b) => a.level - b.level) : mixed;
}
function selectedWordsAllLevels() {
  const seen = new Set(), out = [];
  for (const id of S.sel) { const p = S.pools[id]; if (p && p.language === S.lang) for (const w of p.words) if (!seen.has(w.key)) { seen.add(w.key); out.push(w); } }
  return out;
}
function hashString() {
  const q = new URLSearchParams();
  q.set('lang', S.lang);
  q.set('pools', [...S.sel].join(','));
  q.set('lv', [...S.levels].sort().join(''));
  q.set('size', S.size);
  if (S.ramp) q.set('order', 'ramp');
  q.set('seed', S.seed);
  return q.toString();
}
function shareUrl() { return `${location.origin}${location.pathname}#${hashString()}`; }
function persist() {
  S.prefs[S.lang] = { sel: [...S.sel], levels: [...S.levels], size: S.size, ramp: S.ramp, seed: S.seed };
  S.prefs._lang = S.lang;
  store.set(KEYS.prefs, S.prefs);
  try { history.replaceState(null, '', '#' + hashString()); } catch { /* file:// */ }
}
function restorePrefs(lang) {
  S.lang = lang;
  const p = S.prefs[lang];
  const pools = poolsFor(lang);
  S.sel = new Set((p?.sel || []).filter(id => S.pools[id]));
  if (!S.sel.size && pools[0]) S.sel.add(pools[0].id);
  S.levels = new Set(p?.levels?.length ? p.levels : [1, 2]);
  S.size = clamp(p?.size || 4, 3, 5);
  S.ramp = !!p?.ramp;
  S.seed = p?.seed || genSeed();
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const lang = q.get('lang');
  if (!lang || !S.langs[lang]) return false;
  restorePrefs(lang);
  const pools = (q.get('pools') || '').split(',').filter(id => S.pools[id]);
  if (pools.length) S.sel = new Set(pools);
  const lv = (q.get('lv') || '').split('').map(Number).filter(n => LEVELS[n]);
  if (lv.length) S.levels = new Set(lv);
  if (q.get('size')) S.size = clamp(+q.get('size') || 4, 3, 5);
  S.ramp = q.get('order') === 'ramp';
  if (q.get('seed')) S.seed = q.get('seed');
  const missing = (q.get('pools') || '').split(',').filter(id => id && !S.pools[id]);
  if (missing.length) later(() => toast(`Shared link mentions pools you don't have: ${missing.join(', ')}`), 600);
  return true;
}

// ───────────────────────── shared UI pieces ─────────────────────────
function mount(nodes, keep = false) {
  const y = window.scrollY;
  S.keys = {};
  $('#app').replaceChildren(...[].concat(nodes));
  window.scrollTo(0, keep ? y : 0);
}
const levelBadge = l => h('span', { class: `lv lv${l}` }, LEVELS[l]);
function pips(w) {
  const box = P.get(w).box;
  return h('span', { class: 'pips', title: `Strength ${box}/5` }, [0, 1, 2, 3, 4].map(i => h('i', { class: i < box ? 'on' : null })));
}
function speakBtn(fn, { slowFn = null, label = 'Listen' } = {}) {
  return h('span', { class: 'speak' },
    h('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick: e => { e.preventDefault(); e.stopPropagation(); fn(); } }, icon('speaker')),
    slowFn && TTS.ok && h('button', { class: 'icon-btn slow', type: 'button', title: 'Slower', onclick: e => { e.preventDefault(); e.stopPropagation(); slowFn(); } }, 'slow'));
}
function wordBlock(w, { reading = true, roma = true, speak = true } = {}) {
  return h('div', { class: 'word-block' },
    h('div', { class: 'word', lang: w.lang }, w.word),
    reading && S.settings.furigana && hasReading(w) && h('div', { class: 'reading', lang: w.lang }, w.reading),
    roma && S.settings.romaji && romaji(w) && h('div', { class: 'romaji' }, romaji(w)),
    speak && TTS.ok && h('div', { style: 'margin-top:6px' }, speakBtn(() => sayWord(w), { slowFn: () => sayWord(w, true) })));
}
function sentenceBlock(w, { translation = true } = {}) {
  if (!w.sentence) return null;
  return h('div', { class: 'sentence' },
    h('div', { class: 's-row' },
      h('p', { class: 's-text', lang: w.lang, html: Text.html(w.sentence, { furi: S.settings.furigana }) }),
      TTS.ok && speakBtn(() => saySentence(w), { slowFn: () => saySentence(w, true), label: 'Hear sentence' })),
    translation && w.translation && h('p', { class: 's-trans' }, w.translation));
}
function seg(options, current, onPick, cls = () => '') {
  return h('div', { class: 'seg', role: 'group' }, options.map(o => {
    const [val, label, extra] = Array.isArray(o) ? o : [o, String(o)];
    return h('button', { type: 'button', class: `seg-btn ${cls(val)}${val === current ? ' on' : ''}`, 'aria-pressed': String(val === current), onclick: () => onPick(val) }, label, extra);
  }));
}
const control = (label, body, hint) => h('div', { class: 'control' }, h('span', { class: 'label' }, label), body, hint && h('div', { class: 'hint' }, hint));

// ───────────────────────── home ─────────────────────────
function batchStatus(batch) {
  const st = batch.map(P.status);
  if (st.every(s => s === 'known')) return 'known';
  if (st.every(s => s !== 'new')) return 'done';
  if (st.some(s => s !== 'new')) return 'partial';
  return 'new';
}
const STATUS_LABEL = { known: '✓✓ known', done: '✓ studied', partial: '◐ started', new: 'new' };

function suggestion(selWords, mix) {
  const by = l => selWords.filter(w => w.level === l);
  const learnedRatio = l => { const ws = by(l); return ws.length ? ws.filter(w => P.get(w).box >= 3).length / ws.length : 0; };
  for (const l of [1, 2]) {
    if (S.levels.has(l) && !S.levels.has(l + 1) && by(l + 1).length && learnedRatio(l) >= 0.6) {
      return { text: `You've got ${Math.round(learnedRatio(l) * 100)}% of the ${LEVELS[l]} words down. Ready to mix in ${LEVELS[l + 1]}?`, label: `Add ${LEVELS[l + 1]}`, fn: () => { S.levels.add(l + 1); changed(); } };
    }
  }
  const hard = by(3).filter(w => P.get(w).seen);
  if (S.levels.has(3) && !S.levels.has(1) && hard.length >= 6) {
    const r = hard.reduce((a, w) => a + P.get(w).right, 0), x = hard.reduce((a, w) => a + P.get(w).wrong, 0);
    if (x > r) return { text: 'Hard words are fighting back. Mixing in some Easy ones keeps momentum up.', label: 'Add Easy', fn: () => { S.levels.add(1); changed(); } };
  }
  if (mix.length && mix.every(w => P.status(w) === 'known')) return { text: 'Everything in this mix is marked known. Pick another pool, raise the difficulty, or keep drilling to stay sharp.' };
  return null;
}

function changed() { persist(); renderHome(true); }

function renderHome(keep = false) {
  S.view = 'home';
  L = null;
  document.body.classList.remove('in-lesson');
  const pools = poolsFor(S.lang);
  const mix = buildMix();
  const batches = chunk(mix, S.size);
  const contIdx = batches.findIndex(b => !['done', 'known'].includes(batchStatus(b)));
  const anySeen = mix.some(w => P.get(w).seen);
  const selWords = selectedWordsAllLevels();
  const lang = langInfo(S.lang);

  // 1 · pools
  const cats = {};
  for (const p of pools) (cats[p.category] ||= []).push(p);
  const poolCard = p => {
    const on = S.sel.has(p.id);
    const known = p.words.filter(w => P.status(w) === 'known').length;
    const learning = p.words.filter(w => P.status(w) === 'learning').length;
    const lv = [1, 2, 3].map(l => p.words.filter(w => w.level === l).length);
    return h('button', { type: 'button', class: 'pool' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { on ? S.sel.delete(p.id) : S.sel.add(p.id); changed(); } },
      h('div', { class: 'pool-top' }, h('span', { class: 'pool-title' }, p.title), h('span', { class: 'check' })),
      p.description && h('div', { class: 'pool-desc' }, p.description),
      h('div', { class: 'pool-meta' },
        `${p.words.length} words`,
        h('span', { class: 'dist', title: `Easy ${lv[0]} · Medium ${lv[1]} · Hard ${lv[2]}` }, lv.map((n, i) => n ? h('i', { style: `background:var(--lv${i + 1})` }) : null)),
        p.custom && h('span', { class: 'tag' }, 'custom')),
      h('div', { class: 'bar', title: `${known} known · ${learning} learning` },
        h('i', { class: 'k', style: `width:${(known / (p.words.length || 1)) * 100}%` }),
        h('i', { class: 'l', style: `width:${(learning / (p.words.length || 1)) * 100}%` })));
  };
  const poolSection = h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', null, h('span', { class: 'step-num' }, '1'), 'Pick word pools'),
      h('span', { class: 'muted small' }, `${lang.name}${lang.native ? ' · ' + lang.native : ''} · ${S.sel.size} of ${pools.length} selected`)),
    pools.length ? Object.entries(cats).map(([cat, ps]) => h('div', { class: 'cat' }, h('h3', { class: 'cat-title' }, cat), h('div', { class: 'pool-grid' }, ps.map(poolCard))))
      : h('p', { class: 'empty' }, 'No pools for this language yet.'),
    h('div', { class: 'row gap wrap-row' },
      h('button', { class: 'btn ghost small', onclick: () => { pools.forEach(p => S.sel.add(p.id)); changed(); } }, 'Select all'),
      h('button', { class: 'btn ghost small', onclick: () => { S.sel.clear(); changed(); } }, 'Clear'),
      h('button', { class: 'btn ghost small', onclick: renderImport }, '+ Add your own pool')));

  // 2 · session
  const lvCounts = { 1: 0, 2: 0, 3: 0 };
  selWords.forEach(w => lvCounts[w.level]++);
  const seedInput = h('input', { type: 'text', value: S.seed, 'aria-label': 'Seed', spellcheck: 'false', onchange: e => { S.seed = e.target.value.trim() || genSeed(); changed(); } });
  const sessSection = h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, h('span', { class: 'step-num' }, '2'), 'Tune the session')),
    h('div', { class: 'controls' },
      control('Difficulty', h('div', { class: 'seg' }, [1, 2, 3].map(l => h('button', {
        type: 'button', class: `seg-btn lv${l}${S.levels.has(l) ? ' on' : ''}`, 'aria-pressed': String(S.levels.has(l)),
        onclick: () => { if (S.levels.has(l)) { if (S.levels.size > 1) S.levels.delete(l); } else S.levels.add(l); changed(); },
      }, LEVELS[l], h('span', { class: 'count' }, lvCounts[l])))), 'Toggle any combination.'),
      control('Challenges', h('div', { class: 'seg' },
        KINDS.map(([k, label]) => h('button', {
          type: 'button', class: `seg-btn${kindOn(k) ? ' on' : ''}`, 'aria-pressed': String(kindOn(k)),
          onclick: () => {
            const on = KINDS.filter(([x]) => kindOn(x)).length;
            if (kindOn(k) && on <= 1) return toast('Keep at least one challenge type on.');
            S.settings.kinds[k] = !kindOn(k); store.set(KEYS.settings, S.settings); renderHome(true);
          },
        }, label)),
        h('button', {
          type: 'button', class: `seg-btn${S.settings.produce !== 'off' ? ' on' : ''}`, 'aria-pressed': String(S.settings.produce !== 'off'),
          onclick: () => { S.settings.produce = S.settings.produce === 'off' ? 'all' : 'off'; store.set(KEYS.settings, S.settings); renderHome(true); },
        }, 'Writing')),
        'Which question types appear in batches, reviews and the quick quiz. New-word intros always show.'),
      control('Words per batch', seg([3, 4, 5], S.size, v => { S.size = v; changed(); })),
      control('Order', seg([['shuffle', 'Shuffled'], ['ramp', 'Easy → Hard']], S.ramp ? 'ramp' : 'shuffle', v => { S.ramp = v === 'ramp'; changed(); })),
      control('Seed', h('div', { class: 'seed-row' }, seedInput,
        h('button', { class: 'btn small', title: 'New random seed', onclick: () => { S.seed = genSeed(); changed(); } }, '🎲'),
        h('button', { class: 'btn small', title: 'Copy share link', onclick: copyShare }, 'Share')),
        'Same seed + pools + difficulty = the same word order. Share the link to share the pool.')));

  // 3 · learn
  const counts = { new: 0, learning: 0, known: 0 };
  mix.forEach(w => counts[P.status(w)]++);
  const sug = suggestion(selWords, mix);
  const weak = mix.filter(w => P.get(w).seen && P.get(w).box < 4);
  let batchRows = batches.map((b, i) => [b, i]);
  const anchor = Math.max(0, contIdx);
  if (!S.ui.allBatches && batches.length > 10) batchRows = batchRows.slice(Math.max(0, anchor - 2), Math.max(0, anchor - 2) + 8);
  const pathSection = h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', null, h('span', { class: 'step-num' }, '3'), 'Learn'),
      h('span', { class: 'muted small' }, `${mix.length} words · ${batches.length} batches of ${S.size}`)),
    mix.length ? [
      h('div', { class: 'stats' },
        h('span', { class: 'stat-new' }, h('b', null, counts.new), 'new'),
        h('span', { class: 'stat-learn' }, h('b', null, counts.learning), 'learning'),
        h('span', { class: 'stat-known' }, h('b', null, counts.known), 'known')),
      sug && h('div', { class: 'suggest' }, h('span', null, '💡 ', sug.text), sug.fn && h('button', { class: 'btn small', onclick: sug.fn }, sug.label)),
      h('div', { class: 'row gap wrap-row' },
        h('button', { class: 'btn primary big', onclick: () => startBatch(contIdx === -1 ? 0 : contIdx) },
          contIdx === -1 ? 'All studied · Restart from batch 1' : anySeen ? `Continue · Batch ${contIdx + 1}` : 'Start · Batch 1'),
        weak.length >= 2 && h('button', { class: 'btn big', onclick: startReview }, `Review weakest (${Math.min(weak.length, S.size * 2)})`)),
      h('div', { class: 'batches' }, batchRows.map(([b, i]) => {
        const st = batchStatus(b);
        return h('button', { class: 'batch' + (i === contIdx ? ' current' : ''), onclick: () => startBatch(i) },
          h('span', { class: 'batch-no' }, `Batch ${i + 1}`),
          h('span', { class: 'batch-words', lang: S.lang }, b.map(w => w.word).join('・')),
          h('span', { class: `batch-status st-${st}` }, STATUS_LABEL[st]));
      })),
      batches.length > 10 && h('div', { style: 'margin-top:8px' }, h('button', { class: 'link-btn', onclick: () => { S.ui.allBatches = !S.ui.allBatches; renderHome(true); } }, S.ui.allBatches ? 'Show fewer batches' : `Show all ${batches.length} batches`)),
    ] : h('p', { class: 'empty' }, 'Select at least one pool (and a difficulty that has words) to build your path.'));

  // 4 · drills
  const scope = drillScope(mix);
  const drillCard = (title, desc, fn, disabled) => h('button', { class: 'drill-card', onclick: fn, disabled: !!disabled }, h('strong', null, title), h('span', null, desc));
  const drillSection = mix.length ? h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', null, h('span', { class: 'step-num' }, '4'), 'Drill this pool'),
      h('span', { class: 'muted small' }, scope.note)),
    h('div', { class: 'drill-grid' },
      drillCard('Quick quiz', 'Mixed questions, weakest words first', () => startDrill('quiz', scope.words)),
      drillCard('Listening', TTS.ok ? 'Hear it, pick the word' : 'Speech not supported in this browser', () => startDrill('listen', scope.words), !TTS.ok),
      drillCard('Match rush', 'Pair words with meanings, 3 rounds', () => startDrill('match', scope.words)),
      drillCard('Reading', isKanaLang({ lang: S.lang }) ? 'See the word, type how it reads' : 'See the meaning, type the word', () => startDrill('type', scope.words)),
      drillCard('Sentence writing', 'Use words in your own sentences', () => startDrill('write', scope.words)),
      drillCard('Flashcards', 'Flip through at your own pace', () => renderFlash(scope.words)),
      drillCard('Word list', 'Browse, search, listen', () => renderWords()))) : null;

  mount([poolSection, sessSection, pathSection, drillSection].filter(Boolean), keep);
}

function drillScope(mix) {
  const seen = mix.filter(w => P.get(w).seen);
  return seen.length >= 4
    ? { words: seen, note: `Using the ${seen.length} words you've studied in this mix` }
    : { words: mix, note: 'Using the whole mix (study a batch to focus drills on your words)' };
}

function copyShare() {
  persist();
  const url = shareUrl();
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => toast('Share link copied'), () => prompt('Copy this link:', url));
  else prompt('Copy this link:', url);
}

// ───────────────────────── lesson engine ─────────────────────────
// Challenge types the learner can switch on/off for batches, reviews and the quick quiz.
const KINDS = [['meaning', 'Meaning'], ['reverse', 'Word pick'], ['cloze', 'Fill blank'], ['listen', 'Listening'], ['type', 'Typing'], ['match', 'Match']];
const kindOn = k => S.settings.kinds[k] !== false;
function can(kind, w) {
  if (!kindOn(kind)) return false;
  if (kind === 'listen') return TTS.available(ttsLang(w));
  if (kind === 'cloze') return !!Text.target(w.sentence);
  return true;
}
function spread(steps) {
  // avoid the same word twice in a row where possible
  const a = steps.slice();
  for (let i = 1; i < a.length; i++) {
    if (a[i].w && a[i].w === a[i - 1].w) {
      const j = a.findIndex((s, k) => k > i && s.w !== a[i - 1].w && (!a[i + 1] || s.w !== a[i + 1]?.w));
      if (j > 0) [a[i], a[j]] = [a[j], a[i]];
    }
  }
  return a;
}
function produceSteps(words) {
  const mode = S.settings.produce;
  if (mode === 'off') return [];
  return (mode === 'two' ? shuffle(words).slice(0, 2) : words).map(w => ({ t: 'produce', w }));
}
function buildSteps(words, mode) {
  const steps = [];
  if (mode === 'learn') {
    words.forEach((w, n) => steps.push({ t: 'intro', w, n }));
    const first = [], rest = [];
    const rot = ['listen', 'type', 'reverse'];
    words.forEach((w, n) => {
      // preferred order: meaning, then cloze (or reverse), then a rotating extra; skip disabled kinds
      const order = ['meaning', can('cloze', w) ? 'cloze' : 'reverse', ...rot.map((_, k) => rot[(n + k) % rot.length]), 'cloze', 'reverse'];
      const kinds = [...new Set(order)].filter(k => can(k, w)).slice(0, 3);
      if (kinds[0]) first.push({ t: kinds[0], w });
      kinds.slice(1).forEach(t => rest.push({ t, w }));
    });
    steps.push(...spread(shuffle(first)), ...spread(shuffle(rest)));
    if (words.length >= 3 && kindOn('match')) steps.push({ t: 'match', words });
    steps.push(...produceSteps(words));
  } else if (mode === 'review') {
    const kinds = ['meaning', 'reverse', 'cloze', 'listen', 'type'];
    const ds = [];
    words.forEach(w => shuffle(kinds.filter(k => can(k, w))).slice(0, 2).forEach(t => ds.push({ t, w })));
    steps.push(...spread(shuffle(ds)));
    if (words.length >= 3 && kindOn('match')) steps.push({ t: 'match', words: shuffle(words).slice(0, 5) });
  } else if (mode === 'quiz') {
    words.forEach(w => { const ks = ['meaning', 'reverse', 'cloze', 'listen', 'type'].filter(k => can(k, w)); if (ks.length) steps.push({ t: pick(ks), w }); });
  } else if (mode === 'listen' || mode === 'type') {
    words.forEach(w => steps.push({ t: mode, w }));
  } else if (mode === 'match') {
    chunk(words, 5).filter(c => c.length >= 3).forEach(c => steps.push({ t: 'match', words: c }));
  } else if (mode === 'write') {
    words.forEach(w => steps.push({ t: 'produce', w }));
  }
  steps.push({ t: 'done' });
  return steps;
}
function sampleWeak(words, n) {
  const pool = shuffle(words).sort((a, b) => P.get(a).box - P.get(b).box).slice(0, Math.ceil(n * 1.6));
  return shuffle(pool).slice(0, n);
}
function startLesson(words, opts) {
  if (!words.length) return toast('No words to study here.');
  L = { words, steps: buildSteps(words, opts.mode), i: 0, right: 0, wrong: 0, missed: new Set(), opts, title: opts.title, batchNo: opts.batchNo ?? null };
  S.view = 'lesson';
  document.body.classList.add('in-lesson');
  renderLesson();
}
function startBatch(i) {
  const batches = chunk(buildMix(), S.size);
  if (!batches[i]) return renderHome();
  startLesson(batches[i], { mode: 'learn', title: `Batch ${i + 1}`, batchNo: i });
}
function startReview() {
  const weak = buildMix().filter(w => P.get(w).seen && P.get(w).box < 4)
    .sort((a, b) => (P.get(a).box - P.get(b).box) || (P.get(b).wrong - P.get(a).wrong));
  startLesson(shuffle(weak.slice(0, S.size * 2)), { mode: 'review', title: 'Review: weakest words' });
}
function startDrill(kind, words) {
  const n = { quiz: 12, listen: 10, type: 10, match: 15, write: 5 }[kind];
  const titles = { quiz: 'Quick quiz', listen: 'Listening drill', type: 'Reading drill', match: 'Match rush', write: 'Sentence writing' };
  startLesson(sampleWeak(words, n), { mode: kind, title: titles[kind] });
}
function next() {
  if (!L) return;
  L.i = Math.min(L.i + 1, L.steps.length - 1);
  renderLesson();
}
function exitLesson() {
  const mid = L && L.steps[L.i]?.t !== 'done' && L.i > 0;
  if (mid && !confirm('Leave this lesson? Answers so far are saved.')) return;
  TTS.ok && speechSynthesis.cancel();
  renderHome();
}
function requeue(step) {
  if (step.retry) return;
  const copy = { ...step, retry: true };
  let idx = L.steps.findIndex((s, k) => k > L.i && ['match', 'produce', 'done'].includes(s.t));
  if (idx < 0) idx = L.steps.length - 1;
  L.steps.splice(idx, 0, copy);
}
function renderLesson() {
  const step = L.steps[L.i];
  const pct = (L.i / Math.max(1, L.steps.length - 1)) * 100;
  const top = h('div', { class: 'lesson-top' },
    h('button', { class: 'icon-btn', title: 'Exit lesson', 'aria-label': 'Exit lesson', onclick: exitLesson }, icon('close')),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(Math.round(pct)) }, h('div', { style: `width:${pct}%` })),
    h('span', { class: 'muted small' }, L.title || ''));
  mount(h('div', { class: 'lesson' }, top, h('div', { class: 'stage' })));
  $('.stage').append(STEPS[step.t](step));
}

function grade(ok, w, step, { speak = true, note = null } = {}) {
  P.grade(w, ok);
  if (ok) L.right++; else { L.wrong++; L.missed.add(w); requeue(step); }
  if (speak && S.settings.autoplay) sayWord(w);
  showFeedback({ ok, w, note });
}
function showFeedback({ ok, w, title, note }) {
  const fb = h('div', { class: 'feedback ' + (ok ? 'ok' : 'bad') },
    h('div', { class: 'fb-inner' },
      h('div', { class: 'fb-text' },
        h('strong', null, title || (ok ? pick(['Correct!', 'Nice!', 'Yes!', 'Exactly.', 'Got it!']) : 'Not quite.')),
        w && h('div', { class: 'fb-word' },
          h('span', { class: 'jp', lang: w.lang }, w.word),
          hasReading(w) ? ` ${w.reading}` : '',
          romaji(w) && S.settings.romaji ? ` · ${romaji(w)}` : '',
          ` — ${w.meaning}`),
        note && h('div', { class: 'fb-note' }, note)),
      w && TTS.ok && speakBtn(() => sayWord(w)),
      h('button', { class: 'btn primary', onclick: next }, 'Continue')));
  $('.lesson').append(fb);
  S.keys = { enter: next, replay: w ? () => sayWord(w) : null };
}

function mc({ kind, prompt, options, answer, w, step, onAnswer, speak = true }) {
  let done = false;
  const btns = options.map((o, i) => h('button', { class: 'opt', type: 'button', onclick: () => choose(i) },
    h('span', { class: 'kbd' }, i + 1),
    h('span', { class: 'opt-label', lang: o.lang || null }, o.label),
    o.sub && h('span', { class: 'opt-sub', lang: o.lang || null }, o.sub)));
  function choose(i) {
    if (done) return;
    done = true;
    const ok = i === answer;
    btns.forEach((b, j) => { b.disabled = true; if (j === answer) b.classList.add('right'); else if (j === i) b.classList.add('wrong'); });
    onAnswer?.(ok);
    grade(ok, w, step, { speak });
  }
  S.keys.choose = i => btns[i] && choose(i);
  return h('div', { class: 'card drill' }, h('div', { class: 'eyebrow' }, kind, levelBadge(w.level)), prompt, h('div', { class: 'options' }, btns));
}

function distractors(w, n, label) {
  const target = label(w);
  const out = [], seen = new Set([target]);
  const add = (list, max = n) => {
    for (const x of shuffle(list)) {
      if (out.length >= max) return;
      const lb = label(x);
      if (!lb || seen.has(lb)) continue;
      seen.add(lb);
      out.push(x);
    }
  };
  const all = langWords(w.lang);
  add((L?.words || []).filter(x => x !== w), Math.min(n, 2));
  add(all.filter(x => x.pool === w.pool && x.pos === w.pos));
  add(all.filter(x => x.pos === w.pos));
  add(all);
  return out;
}
const wordOption = x => ({ label: x.word, sub: S.settings.furigana && hasReading(x) ? x.reading : null, lang: x.lang });

const STEPS = {
  intro(step) {
    const { w } = step;
    if (!step.marked) { P.seen(w); step.marked = true; }
    if (S.settings.autoplay) later(() => sayWord(w), 300);
    S.keys = { enter: next, replay: () => sayWord(w) };
    return h('div', { class: 'card intro' },
      h('div', { class: 'eyebrow' }, `New word ${step.n + 1} of ${L.words.length}`, levelBadge(w.level), w.pos && h('span', { class: 'tag' }, w.pos)),
      wordBlock(w),
      h('div', { class: 'meaning' }, w.meaning),
      sentenceBlock(w),
      w.tip && h('div', { class: 'tip' }, h('strong', null, 'Memory tip · '), w.tip),
      w.notes && h('p', { class: 'muted small' }, w.notes),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary big', onclick: next }, 'Got it →')));
  },

  meaning(step) {
    const { w } = step;
    const opts = shuffle([w, ...distractors(w, 3, x => x.meaning)]);
    if (S.settings.autoplay) later(() => sayWord(w), 300);
    S.keys.replay = () => sayWord(w);
    return mc({ kind: 'What does this mean?', w, step,
      prompt: h('div', { class: 'prompt' }, wordBlock(w, { reading: false, roma: false })),
      options: opts.map(x => ({ label: x.meaning })), answer: opts.indexOf(w) });
  },

  reverse(step) {
    const { w } = step;
    const opts = shuffle([w, ...distractors(w, 3, x => x.word)]);
    return mc({ kind: 'Which word means…', w, step,
      prompt: h('div', { class: 'prompt' }, h('div', { class: 'prompt-meaning' }, w.meaning), w.pos && h('div', { class: 'muted small', style: 'text-align:center' }, w.pos)),
      options: opts.map(wordOption), answer: opts.indexOf(w) });
  },

  listen(step) {
    const { w } = step;
    const opts = shuffle([w, ...distractors(w, 3, x => x.word)]);
    later(() => sayWord(w), 350);
    const el = mc({ kind: 'Listen: which word is it?', w, step, speak: false,
      prompt: h('div', { class: 'prompt listen-prompt' },
        h('button', { class: 'play-big', type: 'button', 'aria-label': 'Play again', onclick: () => sayWord(w) }, h('span', { html: ICON.speaker, style: 'display:grid' })),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => sayWord(w, true) }, 'Slower'),
        h('div', { class: 'muted small' }, 'Press R to replay')),
      options: opts.map(wordOption), answer: opts.indexOf(w), onAnswer: () => sayWord(w) });
    S.keys.replay = () => sayWord(w);
    return el;
  },

  cloze(step) {
    const { w } = step;
    const opts = shuffle([w, ...distractors(w, 3, x => x.word)]);
    const surface = Text.target(w.sentence);
    const sent = h('p', { class: 's-text big', lang: w.lang, html: Text.html(w.sentence, { furi: S.settings.furigana, cloze: true }) });
    return mc({ kind: 'Fill the blank', w, step, speak: false,
      prompt: h('div', { class: 'prompt' }, sent,
        w.translation && h('p', { class: 's-trans center' }, w.translation),
        surface !== w.word && h('p', { class: 'muted small', style: 'text-align:center' }, 'Choices are shown in dictionary form.')),
      options: opts.map(wordOption), answer: opts.indexOf(w),
      onAnswer: () => { sent.innerHTML = Text.html(w.sentence, { furi: S.settings.furigana }); if (S.settings.autoplay) saySentence(w); } });
  },

  type(step) {
    const { w } = step;
    const kana = isKanaLang(w);
    const input = h('input', { class: 'answer-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: kana ? null : w.lang, placeholder: kana ? 'kana or romaji…' : 'type the word…' });
    let done = false;
    const check = giveUp => {
      if (done) return;
      const v = input.value.trim();
      if (!v && !giveUp) return input.focus();
      done = true;
      input.disabled = true;
      let ok = false, note = null;
      if (!giveUp) {
        if (kana) {
          const target = w.reading || w.word;
          ok = v === w.word || v === target || Kana.lenient(v) === Kana.lenient(target) || (!!w.romaji && Kana.lenient(v) === Kana.lenient(w.romaji));
        } else {
          ok = fold(v) === fold(w.word);
          if (ok && v.toLowerCase() !== w.word.toLowerCase()) note = `Watch the accents: ${w.word}`;
        }
      }
      input.classList.add(ok ? 'right' : 'wrong');
      grade(ok, w, step, { note });
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); check(false); }
    });
    later(() => input.focus(), 60);
    return h('div', { class: 'card drill' },
      h('div', { class: 'eyebrow' }, kana ? 'How is this read?' : 'Type the word', levelBadge(w.level)),
      h('div', { class: 'prompt' }, kana
        ? wordBlock(w, { reading: false, roma: false, speak: false })
        : h('div', { class: 'prompt-meaning' }, w.meaning)),
      input,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => check(true) }, "I don't know"),
        h('button', { class: 'btn primary', onclick: () => check(false) }, 'Check')));
  },

  match(step) {
    const ws = step.words;
    let a = null, b = null, left = ws.length, errs = 0;
    const missed = new Set(), lb = new Map(), rb = new Map();
    const tryPair = () => {
      if (!a || !b) return;
      const A = lb.get(a), B = rb.get(b);
      if (a === b) {
        A.classList.add('matched'); B.classList.add('matched'); A.disabled = B.disabled = true;
        if (S.settings.autoplay) sayWord(a);
        left--;
      } else {
        errs++;
        if (!missed.has(a)) { missed.add(a); P.grade(a, false); L.missed.add(a); }
        [A, B].forEach(x => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake'), 400); });
      }
      A.classList.remove('sel'); B.classList.remove('sel');
      a = b = null;
      if (!left) {
        if (errs) L.wrong++; else L.right++;
        showFeedback({ ok: !errs, title: errs ? `All matched, with ${errs} slip${errs > 1 ? 's' : ''}.` : 'Perfect match!' });
      }
    };
    const colL = h('div', { class: 'match-col' }, shuffle(ws).map(w => {
      const btn = h('button', { class: 'match-btn', lang: w.lang, onclick: () => { if (a) lb.get(a).classList.remove('sel'); a = w; btn.classList.add('sel'); tryPair(); } }, w.word);
      lb.set(w, btn); return btn;
    }));
    const colR = h('div', { class: 'match-col' }, shuffle(ws).map(w => {
      const btn = h('button', { class: 'match-btn', onclick: () => { if (b) rb.get(b).classList.remove('sel'); b = w; btn.classList.add('sel'); tryPair(); } }, w.meaning);
      rb.set(w, btn); return btn;
    }));
    return h('div', { class: 'card drill' }, h('div', { class: 'eyebrow' }, 'Match the pairs'), h('div', { class: 'match' }, colL, colR));
  },

  produce(step) {
    const { w } = step;
    const ta = h('textarea', { rows: 3, lang: w.lang, placeholder: isKanaLang(w) ? 'Kana, kanji or romaji all work. Or explain in English how it is used.' : 'Write a sentence using the word…' });
    const result = h('div', { class: 'produce-result' });
    const peek = h('div');
    let checked = false;
    const rate = v => { if (v > 0) { P.grade(w, true); L.right++; } else if (v < 0) { P.grade(w, false); L.wrong++; L.missed.add(w); } next(); };
    const check = () => {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      checked = true;
      P.addSentence(w, text);
      const used = containsWord(text, w);
      const english = /^[\x00-\x7F]*$/.test(text) && isKanaLang(w) && !used;
      peek.replaceChildren();
      result.replaceChildren(
        h('p', { class: used ? 'good' : 'warn' }, used
          ? `✓ You used ${w.word}.`
          : english ? 'Explained it in English? Compare your idea with the model sentence below.'
            : `I don't see ${w.word}${hasReading(w) ? ` / ${w.reading}` : ''} in there. Fine if you used a conjugated form.`),
        TTS.ok && !english && h('p', { class: 'row gap' }, 'Hear your sentence:', speakBtn(() => TTS.speak(text, ttsLang(w)))),
        h('div', { class: 'eyebrow', style: 'margin-top:14px' }, 'Model sentence'),
        sentenceBlock(w),
        h('div', { class: 'eyebrow', style: 'margin-top:14px' }, 'How did it go?'),
        h('div', { class: 'rate' },
          h('button', { class: 'btn', onclick: () => rate(1) }, '😀 Nailed it'),
          h('button', { class: 'btn', onclick: () => rate(0) }, '🤔 Sort of'),
          h('button', { class: 'btn', onclick: () => rate(-1) }, '😵 Not yet')));
      S.keys = { choose: i => rate([1, 0, -1][i] ?? 0) };
    };
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); check(); } });
    later(() => ta.focus(), 60);
    const prev = P.get(w).mine;
    if (w.sentence) peek.append(h('button', { class: 'link-btn small', style: 'margin-top:8px', onclick: () => peek.replaceChildren(sentenceBlock(w)) }, 'Need an idea? Peek at the example'));
    return h('div', { class: 'card drill' },
      h('div', { class: 'eyebrow' }, 'Use it in a sentence', levelBadge(w.level)),
      wordBlock(w),
      h('div', { class: 'meaning' }, w.meaning),
      ta,
      peek,
      prev?.length && h('p', { class: 'muted small' }, 'Your last: ', h('span', { lang: w.lang }, prev[0])),
      result,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => next() }, 'Skip'),
        h('button', { class: 'btn primary', onclick: () => (checked ? null : check()) }, 'Check (⌘/Ctrl+Enter)')));
  },

  done() {
    TTS.ok && setTimeout(() => speechSynthesis.cancel(), 0);
    const total = L.right + L.wrong;
    const acc = total ? Math.round((L.right / total) * 100) : 100;
    const batches = chunk(buildMix(), S.size);
    const nextBatch = L.batchNo != null && L.batchNo + 1 < batches.length ? L.batchNo + 1 : null;
    const primary = nextBatch != null ? () => startBatch(nextBatch) : () => renderHome();
    const words = L.words;
    const opts = L.opts;
    S.keys = { enter: primary };
    return h('div', { class: 'card' },
      h('div', { class: 'eyebrow', style: 'justify-content:center' }, L.title || 'Done'),
      h('h2', { style: 'text-align:center;font-size:1.7rem;margin-bottom:10px' }, acc >= 90 ? 'お見事! Excellent.' : acc >= 70 ? 'Nice work.' : 'Good practice. These will stick.'),
      h('div', { class: 'done-stats' },
        h('div', null, h('b', null, `${acc}%`), h('span', { class: 'muted small' }, 'accuracy')),
        h('div', null, h('b', null, L.right), h('span', { class: 'muted small' }, 'right')),
        h('div', null, h('b', null, L.wrong), h('span', { class: 'muted small' }, 'to revisit'))),
      h('div', { class: 'wlines' }, words.map(w => h('div', { class: 'wline' },
        h('span', { class: 'jp', lang: w.lang }, w.word),
        h('span', { class: 'grow' }, [hasReading(w) ? w.reading : romaji(w), w.meaning].filter(Boolean).join(' · '), L.missed.has(w) ? ' ⟲' : ''),
        pips(w), TTS.ok && speakBtn(() => sayWord(w))))),
      h('div', { class: 'actions', style: 'justify-content:center' },
        h('button', { class: 'btn', onclick: () => renderHome() }, 'Home'),
        h('button', { class: 'btn', onclick: () => startLesson(words, opts) }, 'Repeat'),
        nextBatch != null
          ? h('button', { class: 'btn primary big', onclick: primary }, `Next · Batch ${nextBatch + 1} →`)
          : h('button', { class: 'btn primary big', onclick: primary }, 'Back to pools')));
  },
};

function containsWord(text, w) {
  const t = text.normalize('NFC');
  const stem = s => (s || '').replace(/する$/, '').replace(/[るうくすつぬむぶぐいだ]$/, '');
  const cands = [w.word, w.reading, stem(w.word), stem(w.reading)].filter(s => s && s.length >= 1);
  if (cands.some(c => (c.length > 1 || c === w.word) && t.includes(c))) return true;
  if (isKanaLang(w) && w.reading) {
    const r = Kana.lenient(w.reading), tt = Kana.lenient(t);
    if (r.length >= 2 && tt.includes(r)) return true;
    const rs = Kana.lenient(stem(w.reading));
    if (rs.length >= 3 && tt.includes(rs)) return true;
  }
  if (fold(t).includes(fold(w.word))) return true;
  // Latin-script languages: accept conjugated/inflected forms (détruire → détruisez, piocher → pioche)
  // by matching a shared prefix on single-word entries.
  if (!isKanaLang(w) && !/\s/.test(w.word.trim())) {
    const base = fold(w.word);
    if (base.length >= 5) {
      const need = Math.max(4, base.length - 3);
      const pre = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
      return t.split(/[^\p{L}\p{N}]+/u).some(tok => pre(fold(tok), base) >= need);
    }
  }
  return false;
}

// ───────────────────────── word list ─────────────────────────
function wordRow(w) {
  const prog = P.get(w);
  return h('details', null,
    h('summary', null,
      h('span', { class: 'w', lang: w.lang }, w.word),
      h('span', { class: 'r', lang: w.lang }, hasReading(w) ? w.reading : romaji(w)),
      h('span', { class: 'm' }, w.meaning),
      levelBadge(w.level), pips(w),
      TTS.ok && speakBtn(() => sayWord(w))),
    h('div', { class: 'body' },
      romaji(w) && hasReading(w) && h('p', { class: 'muted small' }, romaji(w), w.pos ? ` · ${w.pos}` : ''),
      sentenceBlock(w),
      w.tip && h('div', { class: 'tip' }, h('strong', null, 'Memory tip · '), w.tip),
      prog.mine?.length && h('div', null, h('div', { class: 'eyebrow' }, 'Your sentences'), prog.mine.map(s => h('p', { lang: w.lang, style: 'margin:4px 0' }, '“', s, '”'))),
      h('p', { class: 'muted small' }, `Pool: ${S.pools[w.pool]?.title || w.pool} · seen ${prog.seen} · ✓${prog.right} ✗${prog.wrong}`)));
}

function renderWords() {
  S.view = 'words';
  document.body.classList.remove('in-lesson');
  const all = langWords(S.lang);
  const st = S.ui.wl;
  const list = h('div', { class: 'wl' });
  const draw = () => {
    const q = st.q.toLowerCase();
    const rows = all.filter(w =>
      (st.pool === 'all' || (st.pool === 'sel' ? S.sel.has(w.pool) : w.pool === st.pool)) &&
      (!st.lv || w.level === st.lv) &&
      (!st.status || P.status(w) === st.status) &&
      (!q || [w.word, w.reading, romaji(w), w.meaning].some(x => (x || '').toLowerCase().includes(q))));
    list.replaceChildren(h('div', { class: 'muted small' }, `${rows.length} words`), ...rows.slice(0, 500).map(wordRow));
  };
  const sel = (key, opts, cast = x => x) => h('select', { onchange: e => { st[key] = cast(e.target.value); draw(); } },
    opts.map(([v, label]) => h('option', { value: String(v), selected: String(st[key]) === String(v) }, label)));
  mount(h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', null, `Words · ${langInfo(S.lang).name}`), h('button', { class: 'btn small', onclick: () => renderHome() }, '← Back')),
    h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: 'Search word, reading, romaji, meaning…', value: st.q, oninput: e => { st.q = e.target.value; draw(); } }),
      sel('pool', [['sel', 'Selected pools'], ['all', 'All pools'], ...poolsFor(S.lang).map(p => [p.id, p.title])]),
      sel('lv', [[0, 'Any level'], [1, 'Easy'], [2, 'Medium'], [3, 'Hard']], Number),
      sel('status', [['', 'Any status'], ['new', 'New'], ['learning', 'Learning'], ['known', 'Known']])),
    list));
  draw();
}

// ───────────────────────── flashcards ─────────────────────────
function renderFlash(words) {
  S.view = 'flash';
  document.body.classList.remove('in-lesson');
  let deck = shuffle(words), i = 0, flipped = false;
  const card = h('div', { class: 'card flash-card', role: 'button', tabindex: '0' });
  const counter = h('span', { class: 'muted small' });
  const draw = () => {
    const w = deck[i];
    card.replaceChildren(...(flipped
      ? [wordBlock(w), h('div', { class: 'meaning' }, w.meaning), sentenceBlock(w), w.tip && h('div', { class: 'tip' }, h('strong', null, 'Memory tip · '), w.tip)]
      : [h('div', { class: 'word-block' }, h('div', { class: 'word', lang: w.lang }, w.word)), h('div', { class: 'flash-hint' }, 'Tap or press Space to flip')]).filter(Boolean));
    counter.textContent = `${i + 1} / ${deck.length}`;
  };
  const flip = () => { flipped = !flipped; if (flipped && S.settings.autoplay) sayWord(deck[i]); draw(); };
  const go = d => { i = (i + d + deck.length) % deck.length; flipped = false; draw(); };
  const mark = ok => { P.grade(deck[i], ok); toast(ok ? 'Marked as known-ish ✓' : "We'll see it again"); go(1); };
  card.addEventListener('click', e => { if (!e.target.closest('button')) flip(); });
  mount(h('div', { class: 'lesson' },
    h('div', { class: 'lesson-top' }, h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => renderHome() }, icon('close')), h('strong', { style: 'flex:1' }, 'Flashcards'), counter),
    card,
    h('div', { class: 'flash-nav' },
      h('button', { class: 'btn', onclick: () => go(-1) }, '← Prev'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn', onclick: () => mark(false) }, 'Again'),
        h('button', { class: 'btn primary', onclick: () => mark(true) }, 'Know it')),
      h('button', { class: 'btn', onclick: () => go(1) }, 'Next →')),
    h('p', { class: 'muted small', style: 'text-align:center' }, 'Keys: Space flip · ← → move · 1 again · 2 know it')));
  S.keys = { space: flip, left: () => go(-1), right: () => go(1), choose: n => n === 0 ? mark(false) : n === 1 ? mark(true) : null };
  draw();
}

// ───────────────────────── import / custom pools ─────────────────────────
const TEXT_TEMPLATE = `# title: My Anime Words
# language: ja
# category: Custom
# description: Words from the show I'm watching
# Columns are separated by " | " (spaces around the bar). Tabs also work.
# word | reading | meaning | level (1-3) | sentence | translation | tip
仲間 | なかま | comrade, friend | 1 | [{仲間|なかま}]を{守|まも}る。 | I'll protect my friends. | 仲 (relationship) + 間 (between)
魔法 | まほう | magic | 1 | [{魔法|まほう}]が{使|つか}える！ | I can use magic!
`;
const JSON_TEMPLATE = {
  id: 'my-pool-id', language: 'ja', category: 'Custom', title: 'My pool', description: 'What this pool is about',
  words: [{
    word: '呪文', reading: 'じゅもん', meaning: 'spell', pos: 'noun', level: 1,
    sentence: '{相手|あいて}は[{呪文|じゅもん}]を{唱|とな}えた。', translation: 'The opponent cast a spell.',
    tip: '呪 (curse, has a mouth 口) + 文 (writing): words spoken with power.',
  }],
};
const slug = s => (s || 'pool').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'pool';

function parsePoolText(text) {
  text = text.trim();
  if (!text) throw new Error('Paste some JSON or text first.');
  if (text.startsWith('{') || text.startsWith('[')) {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : j.words ? [j] : j.pools || [j];
  }
  const meta = {}, words = [];
  let cols = ['word', 'reading', 'meaning', 'level', 'sentence', 'translation', 'tip'];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^#\s*(\w+)\s*:\s*(.*)$/.exec(line);
    if (m) {
      const k = m[1].toLowerCase();
      if (k === 'columns') cols = m[2].split(/[,|]/).map(s => s.trim()).filter(Boolean);
      else meta[k] = m[2].trim();
      continue;
    }
    if (line.startsWith('#')) continue;
    const parts = (line.includes('\t') ? line.split('\t') : line.split(/\s\|(?=\s)/)).map(s => s.trim());
    const w = {};
    cols.forEach((c, i) => { if (parts[i]) w[c] = parts[i]; });
    if (w.word && w.meaning) words.push(w);
  }
  return [{ id: meta.id || `${slug(meta.title)}-${Date.now().toString(36)}`, title: meta.title || 'Custom pool', language: meta.language || meta.lang || S.lang, category: meta.category || 'Custom', description: meta.description || '', words }];
}
function saveCustom(raw) {
  if (!Array.isArray(raw.words) || !raw.words.some(w => w && w.word && w.meaning)) throw new Error(`Pool "${raw.title || raw.id || '?'}" has no words with both "word" and "meaning".`);
  raw.language = raw.language || raw.lang || S.lang;
  raw.id = raw.id || `${slug(raw.title)}-${Date.now().toString(36)}`;
  if (S.pools[raw.id] && !S.pools[raw.id].custom) raw.id += '-custom';
  S.custom = S.custom.filter(p => p.id !== raw.id).concat(raw);
  store.set(KEYS.custom, S.custom);
  return addPool(raw, raw.language, true);
}
function deleteCustom(id) {
  S.custom = S.custom.filter(p => p.id !== id);
  store.set(KEYS.custom, S.custom);
  delete S.pools[id];
  S.sel.delete(id);
  S._lw = {};
  persist();
}

function renderImport() {
  S.view = 'import';
  document.body.classList.remove('in-lesson');
  const ta = h('textarea', { class: 'import-ta', rows: 12, spellcheck: 'false', placeholder: TEXT_TEMPLATE });
  const msg = h('div', { class: 'import-msg' });
  const file = h('input', { type: 'file', accept: '.json,.txt,.tsv,.md', onchange: async e => { const f = e.target.files[0]; if (f) ta.value = await f.text(); } });
  const doImport = () => {
    try {
      const added = parsePoolText(ta.value).map(saveCustom);
      added.forEach(p => { if (p.language === S.lang) S.sel.add(p.id); });
      if (added[0] && added[0].language !== S.lang) {
        persist();
        restorePrefs(added[0].language);
        S.sel.add(added[0].id);
      }
      persist();
      populateLangSelect();
      toast(`Imported ${added.map(p => `${p.title} (${p.words.length})`).join(', ')}`);
      renderHome();
    } catch (err) {
      msg.className = 'import-msg err';
      msg.textContent = `Couldn't import: ${err.message}`;
    }
  };
  const customs = S.custom.map(raw => h('div', { class: 'custom-item' },
    h('span', { class: 'grow' }, h('strong', null, raw.title || raw.id), h('span', { class: 'muted small' }, ` · ${raw.language} · ${raw.words?.length || 0} words · id: ${raw.id}`)),
    h('button', { class: 'btn small', onclick: () => download(`${raw.id}.json`, JSON.stringify(raw, null, 2)) }, 'Export JSON'),
    h('button', { class: 'btn small', onclick: () => { if (confirm(`Delete "${raw.title}"? Your progress on its words is kept.`)) { deleteCustom(raw.id); renderImport(); } } }, 'Delete')));
  mount([
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, 'Add your own word pool'), h('button', { class: 'btn small', onclick: () => renderHome() }, '← Back')),
      h('p', { class: 'intro-line' }, 'Paste a pool as JSON or as simple text lines, or load a file. Pools you add here are saved in this browser. To make one permanent for everyone, export it and add the file to ', h('code', null, 'data/'), ' (see README).'),
      ta,
      h('div', { class: 'row gap wrap-row', style: 'margin-top:10px' },
        h('button', { class: 'btn primary', onclick: doImport }, 'Import'),
        file,
        h('button', { class: 'btn small ghost', onclick: () => { ta.value = TEXT_TEMPLATE; } }, 'Insert text template'),
        h('button', { class: 'btn small ghost', onclick: () => { ta.value = JSON.stringify(JSON_TEMPLATE, null, 2); } }, 'Insert JSON template')),
      msg),
    h('section', { class: 'panel' },
      h('h2', { style: 'margin-bottom:8px' }, 'Sentence markup'),
      h('p', { class: 'intro-line' }, 'Inside example sentences, ', h('code', null, '{漢字|かんじ}'), ' adds furigana and ', h('code', null, '[ … ]'), ' marks the target word (used for fill-in-the-blank). Both are optional: if the sentence contains the word exactly, it gets marked automatically.'),
      h('pre', { class: 'code' }, '{相手|あいて}は[{呪文|じゅもん}]を{唱|とな}えた。')),
    h('section', { class: 'panel' },
      h('h2', { style: 'margin-bottom:8px' }, 'Your custom pools'),
      customs.length ? h('div', { class: 'custom-list' }, customs) : h('p', { class: 'muted' }, 'None yet.')),
  ]);
}

// ───────────────────────── settings ─────────────────────────
function openSettings() {
  const st = S.settings;
  const lang = langInfo(S.lang);
  const save = () => store.set(KEYS.settings, st);
  const toggle = (k, label, hint) => h('label', { class: 'set-row' },
    h('span', null, h('strong', null, label), hint && h('small', null, hint)),
    h('input', { type: 'checkbox', checked: !!st[k], onchange: e => { st[k] = e.target.checked; save(); } }));
  const voices = TTS.list(lang.tts);
  const rateOut = h('span', { class: 'muted small' }, `${st.rate.toFixed(2)}×`);
  const importInput = h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.progress) { S.progress = { ...S.progress, ...data.progress }; store.set(KEYS.progress, S.progress); }
      if (Array.isArray(data.custom)) data.custom.forEach(p => { try { saveCustom(p); } catch { /* skip bad pool */ } });
      toast('Backup restored');
      d.close();
    } catch (err) { toast(`Couldn't read backup: ${err.message}`); }
  } });
  const d = h('dialog', { class: 'dialog' },
    h('form', { method: 'dialog' },
      h('div', { class: 'dialog-head' }, h('h2', null, 'Settings'), h('button', { class: 'icon-btn', value: 'close', 'aria-label': 'Close' }, icon('close'))),
      toggle('furigana', 'Show readings', 'Furigana over kanji and readings under words'),
      toggle('romaji', 'Show romanization', 'e.g. jumon under 呪文'),
      toggle('autoplay', 'Auto-play audio', 'Speak new words and answers automatically'),
      h('label', { class: 'set-row' }, h('span', null, h('strong', null, 'Sentence practice'), h('small', null, 'Writing step at the end of each batch')),
        h('select', { onchange: e => { st.produce = e.target.value; save(); } },
          [['all', 'Every word'], ['two', 'Two words'], ['off', 'Off']].map(([v, l]) => h('option', { value: v, selected: st.produce === v }, l)))),
      h('label', { class: 'set-row' }, h('span', null, h('strong', null, 'Speech speed'), rateOut),
        h('input', { type: 'range', min: '0.5', max: '1.3', step: '0.05', value: String(st.rate), oninput: e => { st.rate = +e.target.value; rateOut.textContent = `${st.rate.toFixed(2)}×`; save(); } })),
      h('label', { class: 'set-row' }, h('span', null, h('strong', null, `Voice · ${lang.name}`), h('small', null, TTS.ok ? (voices.length ? `${voices.length} available on this device` : 'No voice found. Install one in your OS speech settings.') : 'Speech not supported in this browser')),
        h('select', { onchange: e => { st.voices[lang.tts] = e.target.value; save(); TTS.speak(lang.sample || (lang.code === 'ja' ? 'こんにちは。呪文を唱える。' : 'Hello'), lang.tts); } },
          h('option', { value: '' }, 'Default'), voices.map(v => h('option', { value: v.name, selected: st.voices[lang.tts] === v.name }, `${v.name} (${v.lang})`)))),
      h('div', { class: 'set-row' }, h('span', null, h('strong', null, 'Backup'), h('small', null, 'Progress lives in this browser. Export it to move devices.')),
        h('span', { class: 'row gap' },
          h('button', { class: 'btn small', type: 'button', onclick: () => download(`tango-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ progress: S.progress, custom: S.custom, settings: S.settings }, null, 1)) }, 'Export'),
          h('button', { class: 'btn small', type: 'button', onclick: () => importInput.click() }, 'Import'), importInput)),
      h('div', { class: 'set-row' }, h('span', null, h('strong', null, 'Reset progress'), h('small', null, `Forget what you've learned in ${lang.name}`)),
        h('button', { class: 'btn small', type: 'button', onclick: () => {
          if (!confirm(`Reset all ${lang.name} progress? This can't be undone.`)) return;
          for (const k of Object.keys(S.progress)) if (k.startsWith(S.lang + '|')) delete S.progress[k];
          store.set(KEYS.progress, S.progress);
          toast('Progress reset');
        } }, 'Reset')),
      h('div', { class: 'dialog-foot' }, h('button', { class: 'btn primary', value: 'close' }, 'Done'))));
  document.body.append(d);
  d.addEventListener('close', () => { d.remove(); if (S.view === 'home') renderHome(true); else if (S.view === 'words') renderWords(); });
  d.showModal();
}

// ───────────────────────── chrome & boot ─────────────────────────
function populateLangSelect() {
  const sel = $('#lang-select');
  const langs = Object.values(S.langs);
  sel.replaceChildren(...langs.map(l => h('option', { value: l.code, selected: l.code === S.lang }, l.native ? `${l.name} · ${l.native}` : l.name)));
  sel.style.display = langs.length > 1 ? '' : 'none';
}

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.closest?.('input, textarea, select, dialog')) return;
  if ((e.key === 'Enter' || e.key === ' ') && t.closest?.('button:not(:disabled), summary, a')) return;
  const k = S.keys;
  if (/^[1-9]$/.test(e.key) && k.choose) { e.preventDefault(); k.choose(+e.key - 1); }
  else if (e.key === 'Enter' && k.enter) { e.preventDefault(); k.enter(); }
  else if (e.key === ' ' && k.space) { e.preventDefault(); k.space(); }
  else if (e.key === 'ArrowLeft' && k.left) k.left();
  else if (e.key === 'ArrowRight' && k.right) k.right();
  else if ((e.key === 'r' || e.key === 'R') && k.replay) k.replay();
});

function renderFatal(err) {
  const local = location.protocol === 'file:';
  $('#app').replaceChildren(h('div', { class: 'panel fatal' },
    h('h2', null, "Couldn't load the word pools"),
    local
      ? h('div', null,
        h('p', null, 'Browsers block loading data files when a page is opened straight from disk. Start a tiny local server in this folder instead:'),
        h('pre', { class: 'code' }, 'python3 -m http.server 8000'),
        h('p', null, 'then open ', h('code', null, 'http://localhost:8000'), '. On GitHub Pages this just works.'))
      : h('p', null, 'Check that data/languages.json exists and is valid JSON. ', h('code', null, String(err?.message || err)))));
}

async function boot() {
  TTS.init();
  let manifest;
  try {
    const res = await fetch('data/languages.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) { return renderFatal(err); }

  for (const l of manifest.languages) S.langs[l.code] = { ...l, pools: l.pools || [] };
  const loads = manifest.languages.flatMap(l => l.pools.map((path, i) => ({ path, l, i })));
  const results = await Promise.all(loads.map(({ path }) =>
    fetch(path, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).catch(err => { console.warn('Pool failed to load:', path, err); return { _failed: path }; })));
  const failed = [];
  results.forEach((raw, k) => {
    if (raw._failed) return failed.push(raw._failed);
    if (!raw.id) raw.id = loads[k].path.replace(/^.*\/|\.json$/g, '');
    addPool(raw, loads[k].l.code, false);
  });
  S.custom.forEach(raw => { try { addPool(raw, raw.language, true); } catch (e) { console.warn(e); } });

  if (!readHash()) {
    const first = S.prefs._lang && S.langs[S.prefs._lang] ? S.prefs._lang : manifest.languages[0].code;
    restorePrefs(first);
  }
  persist();
  populateLangSelect();
  renderHome();
  if (failed.length) toast(`Some pools failed to load: ${failed.join(', ')}`);
}

function wireChrome() {
  $('#brand').addEventListener('click', () => { if (S.view === 'lesson') exitLesson(); else renderHome(); });
  $('#lang-select').addEventListener('change', e => { persist(); restorePrefs(e.target.value); persist(); renderHome(); });
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.nav;
    if (v === 'words') renderWords();
    else if (v === 'import') renderImport();
    else if (v === 'settings') openSettings();
  }));
  window.addEventListener('hashchange', () => { if (readHash()) { persist(); populateLangSelect(); renderHome(); } });
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('DOMContentLoaded', () => { wireChrome(); boot(); });
}
