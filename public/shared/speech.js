/**
 * @file Web Speech API Abstraction (TTS & Voice Recognition)
 *
 * Provides multilingual voice output and audio dictation for low-literacy workers.
 * Maps application language codes to regional Indian voice variants (en-IN, ta-IN, hi-IN).
 * Fails gracefully and silently in environments lacking browser speech capabilities.
 */

const LANG_MAP = {
  en: 'en-IN',
  ta: 'ta-IN',
  hi: 'hi-IN'
};

// Global reference holding active utterance to prevent Chrome GC mid-speech termination
let activeUtterance = null;
let cachedVoices = [];

/**
 * Pre-caches browser voices when available.
 */
function initVoices() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const update = () => {
      cachedVoices = window.speechSynthesis.getVoices();
    };
    update();
    if (window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', update);
    }
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = update;
    }
  }
}

initVoices();

/**
 * Finds the most suitable SpeechSynthesisVoice matching the language.
 *
 * @param {string} lang - Language code ('en' | 'ta' | 'hi').
 * @returns {SpeechSynthesisVoice | null}
 */
function findVoice(lang) {
  const voices = cachedVoices.length > 0 ? cachedVoices : (window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
  if (!voices || voices.length === 0) return null;

  const targetCode = (LANG_MAP[lang] || 'en-IN').toLowerCase();
  const primaryCode = lang.toLowerCase().split('-')[0];

  // 1. Exact match e.g. 'ta-in' or 'ta_in'
  let match = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === targetCode);
  if (match) return match;

  // 2. Starts with target e.g. 'ta-in-x-...'
  match = voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith(targetCode));
  if (match) return match;

  // 3. Primary language code match e.g. 'ta' or 'hi'
  match = voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === primaryCode);
  if (match) return match;

  // 4. Voice name heuristic (e.g. contains 'tamil' or 'hindi' or native scripts)
  if (primaryCode === 'ta') {
    match = voices.find((v) => v.name.toLowerCase().includes('tamil') || v.name.includes('தமிழ்'));
    if (match) return match;
  }
  if (primaryCode === 'hi') {
    match = voices.find((v) => v.name.toLowerCase().includes('hindi') || v.name.includes('हिन्दी'));
    if (match) return match;
  }

  // For English, allow standard en voices
  if (primaryCode === 'en') {
    match = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (match) return match;
  }

  // Never return an English voice for Tamil or Hindi; let browser cloud synthesizer handle target lang
  return null;
}

/**
 * Reads aloud text content using the browser's native speech synthesis.
 * Fails silently if speech synthesis is disabled or unsupported.
 *
 * @param {string} text - Text to articulate.
 * @param {string} [lang='en'] - Language code ('en' | 'ta' | 'hi').
 */
export function speak(text, lang = 'en') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) {
    return;
  }

  try {
    // Cancel any previous utterance to prevent audio queue pile-up
    window.speechSynthesis.cancel();

    const targetLangCode = LANG_MAP[lang] || 'en-IN';
    const utterance = new SpeechSynthesisUtterance(String(text).trim());
    utterance.lang = targetLangCode;
    utterance.rate = 0.95; // Slightly slower pacing for enhanced clarity

    const voice = findVoice(lang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    activeUtterance = utterance;
    utterance.onend = () => {
      activeUtterance = null;
    };
    utterance.onerror = (e) => {
      console.warn('[FairShift Speech] Utterance error:', e);
      activeUtterance = null;
    };

    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[FairShift Speech] Speech synthesis suppressed:', err);
  }
}

/**
 * Listens for voice input using the Web Speech Recognition API.
 *
 * @param {string} lang - Language code ('en' | 'ta' | 'hi').
 * @param {(transcript: string) => void} onResult - Callback invoked on successful transcription.
 * @param {(error: Error) => void} [onError] - Callback invoked on failure or lack of support.
 * @returns {{ stop: () => void, isSupported: boolean }} Controller object.
 */
export function listen(lang = 'en', onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    const err = new Error('Voice recognition is not supported in this browser. Please type your message.');
    err.unsupported = true;
    if (onError) onError(err);
    return { stop: () => {}, isSupported: false };
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.lang = LANG_MAP[lang] || 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      if (event.results && event.results[0] && event.results[0][0]) {
        const transcript = event.results[0][0].transcript;
        if (onResult) onResult(transcript);
      }
    };

    recognition.onerror = (event) => {
      const err = new Error(event.error || 'Voice recognition error occurred.');
      err.speechError = event.error;
      if (onError) onError(err);
    };

    recognition.start();

    return {
      stop: () => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      },
      isSupported: true
    };
  } catch (err) {
    if (onError) onError(err);
    return { stop: () => {}, isSupported: false };
  }
}
