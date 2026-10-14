'use strict';
// Basic text filtering for public names and chat. Word lists are ROT13-stored so the source stays readable.
// - STRONG roots are blocked even when hidden inside other text / separated by punctuation or spaces ("f u c k", "sh1t").
// - WEAK words are only matched as whole words (avoids the "Scunthorpe problem": class, assassin, cockpit...).
const rot = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
const STRONG = ['shpx', 'fuvg', 'phag', 'avtt', 'avtn', 'sntt', 'xvxr', 'puvax', 'fcvp', 'genaal', 'ergneq', 'juber', 'fyhg', 'ovgpu', 'onfgneq', 'nffubyr', 'jnax', 'gjng', 'qlxr', 'pbba', 'tbbx', 'ornare', 'encr', 'zbyrfg', 'anmv', 'uvgyre', 'xlf'].map(rot);
const WEAK = new Set(['qvpx', 'pbpx', 'chffl', 'nff', 'nefr', 'cvff', 'gvg', 'gvgf', 'obbo', 'obbof', 'qnza', 'penc', 'cbea', 'frk', 'snt', 'ubzb', 'nany', 'phz', 'wvmm', 'phagf'].map(rot));

const LEET = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '|': 'i' };
const ZW = /[​-‏⁠﻿­]/g;
const collapse = s => s.replace(/(.)\1+/g, '$1');

function fold(s) {            // lowercase, strip accents/zero-width, undo leetspeak
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(ZW, '').toLowerCase().replace(/[0-9!@$+|]/g, c => LEET[c] || c);
}
// letters only, repeats collapsed: "fuuuck" -> "fuck"
function squash(s) { return collapse(fold(s).replace(/[^a-z]/g, '')); }
const STRONG_SQ = STRONG.map(collapse);

function hasStrong(s) { const q = squash(s); return STRONG_SQ.some(w => q.includes(w)); }
function hasWeakWord(s) { return fold(s).split(/[^a-z]+/).some(w => w && (WEAK.has(w) || WEAK.has(collapse(w)))); }

// For usernames: reject anything profane
function nameIsClean(s) { return !hasStrong(s) && !hasWeakWord(String(s).replace(/_+/g, ' ')); }

// For chat: returns { text, blocked, masked } - masked words become asterisks, strong hits block the whole message
function cleanChat(raw) {
  let t = String(raw).replace(ZW, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { text: '', blocked: true, reason: 'empty' };
  t = t.slice(0, 140);
  // strip links, emails and phone-ish numbers (no outbound contact / spam)
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link removed]')
       .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email removed]')
       .replace(/\b[\w-]+\.(?:com|net|org|io|gg|co|me|xyz|ru|tv|app|dev)\b\S*/gi, '[link removed]')
       .replace(/(?:\+?\d[\s().-]?){9,}/g, '[number removed]');
  // tame SHOUTING and char-spam
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 8 && t.replace(/[^A-Z]/g, '').length / letters.length > 0.7) t = t.toLowerCase();
  t = t.replace(/(.)\1{4,}/g, '$1$1$1');
  if (hasStrong(t)) return { text: '', blocked: true, reason: 'language' };
  let masked = false;
  t = t.split(' ').map(tok => {
    const core = tok.replace(/^[^A-Za-z0-9@$]+|[^A-Za-z0-9@$]+$/g, '');
    if (core && (hasWeakWord(core) || hasStrong(core))) { masked = true; return tok.replace(core, '*'.repeat(core.length)); }
    return tok;
  }).join(' ');
  return { text: t, blocked: false, masked };
}

module.exports = { nameIsClean, cleanChat, hasStrong };
