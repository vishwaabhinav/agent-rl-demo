// Text-to-Speech utility using Web Speech API

export interface TTSOptions {
  rate?: number;      // 0.1 to 10, default 1
  pitch?: number;     // 0 to 2, default 1
  volume?: number;    // 0 to 1, default 1
  voice?: string;     // Voice name or URI
  lang?: string;      // Language code, default 'en-US'
}

class TTSService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isInitialized = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();

      // Voices may load asynchronously
      this.synth.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private loadVoices(): void {
    if (this.synth) {
      this.voices = this.synth.getVoices();
      this.isInitialized = this.voices.length > 0;
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  getPreferredVoice(lang: string = 'en-US'): SpeechSynthesisVoice | null {
    // Prefer high-quality voices
    const preferredNames = [
      'Samantha', // macOS
      'Karen',    // macOS Australian
      'Daniel',   // macOS British
      'Google US English',
      'Microsoft David',
      'Microsoft Zira',
    ];

    // Try preferred voices first
    for (const name of preferredNames) {
      const voice = this.voices.find(v => v.name.includes(name) && v.lang.startsWith(lang.split('-')[0]));
      if (voice) return voice;
    }

    // Fall back to any voice matching the language
    const langVoice = this.voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    if (langVoice) return langVoice;

    // Fall back to first available voice
    return this.voices[0] || null;
  }

  speak(text: string, options: TTSOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synth) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      // Cancel any ongoing speech
      this.stop();

      const utterance = new SpeechSynthesisUtterance(text);

      // Apply options
      utterance.rate = options.rate ?? 1;
      utterance.pitch = options.pitch ?? 1;
      utterance.volume = options.volume ?? 1;
      utterance.lang = options.lang ?? 'en-US';

      // Set voice
      const voice = options.voice
        ? this.voices.find(v => v.name === options.voice || v.voiceURI === options.voice)
        : this.getPreferredVoice(utterance.lang);

      if (voice) {
        utterance.voice = voice;
      }

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this.currentUtterance = null;
        // Don't reject for 'interrupted' or 'canceled' errors
        if (event.error === 'interrupted' || event.error === 'canceled') {
          resolve();
        } else {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      this.currentUtterance = utterance;
      this.synth.speak(utterance);
    });
  }

  stop(): void {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
  }

  pause(): void {
    if (this.synth) {
      this.synth.pause();
    }
  }

  resume(): void {
    if (this.synth) {
      this.synth.resume();
    }
  }

  isSpeaking(): boolean {
    return this.synth?.speaking ?? false;
  }

  isPaused(): boolean {
    return this.synth?.paused ?? false;
  }

  isSupported(): boolean {
    return this.synth !== null;
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

// Singleton instance
export const ttsService = new TTSService();

// React hook for TTS
export function useTTS() {
  return {
    speak: ttsService.speak.bind(ttsService),
    stop: ttsService.stop.bind(ttsService),
    pause: ttsService.pause.bind(ttsService),
    resume: ttsService.resume.bind(ttsService),
    isSpeaking: ttsService.isSpeaking.bind(ttsService),
    isPaused: ttsService.isPaused.bind(ttsService),
    isSupported: ttsService.isSupported(),
    isReady: ttsService.isReady(),
    getVoices: ttsService.getVoices.bind(ttsService),
  };
}
