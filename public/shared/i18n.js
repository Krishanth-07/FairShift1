/**
 * @file Client-Side Internationalization (i18n) Engine
 *
 * Loads localization bundles for English, Tamil, and Hindi. Provides deterministic
 * string translation with parameter interpolation and fallback mechanisms.
 * Updates the root document language and persists user preferences in localStorage.
 */

const SUPPORTED_LANGS = ['en', 'ta', 'hi'];
const DEFAULT_LANG = 'en';

let currentLang = DEFAULT_LANG;
const bundles = {
  en: null,
  ta: null,
  hi: null
};

/**
 * Loads a language JSON dictionary bundle.
 *
 * @param {string} lang - Language code ('en' | 'ta' | 'hi').
 * @returns {Promise<Record<string, string>>}
 */
async function loadBundle(lang) {
  if (bundles[lang]) return bundles[lang];
  try {
    const res = await fetch(`/locales/${lang}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    bundles[lang] = data;
    return data;
  } catch (err) {
    console.warn(`[FairShift i18n] Failed to load /locales/${lang}.json, falling back.`, err);
    return {};
  }
}

/**
 * Initializes the internationalization engine.
 * Preloads the fallback English bundle and the user's preferred language.
 *
 * @param {string} [preferredLang] - Explicit language preference if available.
 * @returns {Promise<string>} Active language code.
 */
export async function initI18n(preferredLang) {
  const saved = localStorage.getItem('fs_lang');
  const target = preferredLang || saved || navigator.language?.slice(0, 2) || DEFAULT_LANG;
  currentLang = SUPPORTED_LANGS.includes(target) ? target : DEFAULT_LANG;

  // Always load English as safety fallback
  await loadBundle('en');
  if (currentLang !== 'en') {
    await loadBundle(currentLang);
  }

  document.documentElement.lang = currentLang;
  return currentLang;
}

/**
 * Sets the active application language, updates the DOM lang attribute,
 * and persists the preference.
 *
 * @param {string} lang - Language code ('en' | 'ta' | 'hi').
 * @returns {Promise<void>}
 */
export async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('fs_lang', lang);
  document.documentElement.lang = lang;
  await loadBundle(lang);
  applyI18n(document);
  window.dispatchEvent(new CustomEvent('fs-language-changed', { detail: { lang } }));
}

/**
 * Retrieves the currently active language code.
 * @returns {'en' | 'ta' | 'hi'}
 */
export function getCurrentLanguage() {
  return currentLang;
}

/** Alias for getCurrentLanguage */
export const getLanguage = getCurrentLanguage;

/**
 * Translates a key with optional parameter interpolation.
 * Falls back to English bundle if missing, then to raw key.
 *
 * @param {string} key - Translation key.
 * @param {Record<string, any>} [params={}] - Interpolation parameters.
 * @returns {string}
 */
export function t(key, params = {}) {
  if (!key) return '';

  const activeBundle = bundles[currentLang] || {};
  const enBundle = bundles.en || {};

  let text = activeBundle[key] || enBundle[key] || key;

  // Replace {placeholder} variables
  if (params && typeof params === 'object') {
    for (const [paramKey, val] of Object.entries(params)) {
      const regex = new RegExp(`\\{${paramKey}\\}`, 'g');
      text = text.replace(regex, val !== undefined && val !== null ? String(val) : '');
    }
  }

  return text;
}

/**
 * Scans a DOM subtree for elements with `data-i18n` attributes and translates them safely.
 * Never uses innerHTML; sets textContent or attribute targets.
 *
 * @param {Document | HTMLElement} root - Root element to traverse.
 */
export function applyI18n(root = document) {
  const elements = root.querySelectorAll('[data-i18n]');
  for (const el of elements) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  }

  const ariaLabels = root.querySelectorAll('[data-i18n-aria]');
  for (const el of ariaLabels) {
    const key = el.getAttribute('data-i18n-aria');
    if (key) {
      el.setAttribute('aria-label', t(key));
    }
  }

  const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholders) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      el.setAttribute('placeholder', t(key));
    }
  }
}

/** Alias for applyI18n */
export const translateDOM = applyI18n;
