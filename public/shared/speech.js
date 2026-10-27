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

/**
 * Reads aloud text content using the browser's native speech synthesis.
 * Fails silently if speech synthesis is disabled or unsupported.
 *
 * @param {string} text - Text to articulate.
 * @param {string} [lang='en'] - Language code ('en' | 'ta' | 'hi').
 */
export function speak(text, lang = 'en') {
  if (!('speechSynthesis' in window) || !text) {
    return;
  }

  try {
    // Cancel any previous utterance to prevent audio queue pile-up
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = LANG_MAP[lang] || 'en-IN';
    utterance.rate = 0.95; // Slightly slower pacing for enhanced clarity

    // Select matching Indian regional voice if available in browser voice list
    const voices = window.speechSynthesis.getVoices();
    const targetPrefix = LANG_MAP[lang] || 'en-IN';
    const match = voices.find((v) => v.lang.replace('_', '-').startsWith(targetPrefix));
    if (match) {
      utterance.voice = match;
    }

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
