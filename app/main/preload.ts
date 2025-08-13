// Load environment variables for preload (resolve from project root)
try {
  const { resolve } = require('path');
  const envPath = resolve(__dirname, '../../../.env');
  require('dotenv').config({ path: envPath });
  // eslint-disable-next-line no-console
  console.log('[Preload] Loaded .env from', envPath);
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[Preload] Failed to load .env:', e);
}
import { contextBridge, ipcRenderer } from 'electron';
import { getRendererHybridSTT } from '../renderer/services/stt/RendererHybridSTT';
type OutChannels = 'transcript' | 'vad' | 'voice:initialize' | 'voice:start-listening' | 'voice:stop-listening' | 'voice:push-to-talk' | 'voice:set-mode' | 'voice:command' | 'voice:clear-history' | 'voice:tts-speak' | 'voice:tts-stop' | 'voice:tts-switch-voice';
type InChannels  = 'tts-ready' | 'voice:initialized' | 'voice:error' | 'voice:listening-started' | 'voice:listening-stopped' | 'voice:wake-word' | 'voice:transcript' | 'voice:transcription' | 'voice:interim-transcription' | 'voice:speaking-started' | 'voice:speaking-stopped' | 'voice:processing-started' | 'voice:processing-stopped' | 'voice:tts-audio-data' | 'voice:tts-started' | 'voice:tts-stopped' | 'voice:tts-stop-playback' | 'voice:tts-error' | 'voice:mode-changed' | 'voice:history-cleared' | 'voice:command-processed' | 'voice:push-to-talk-pressed' | 'voice:push-to-talk-released' | 'stt:transcript' | 'stt:engine-switched' | 'voice:mic-permission';
type HandleChannels = 'voice:get-state' | 'voice:get-history' | 'voice:chat-with-tts' | 'stt:start' | 'stt:stop' | 'stt:get-status' | 'stt:switch-to-cloud' | 'stt:switch-to-whisper' | 'stt:health-check';

// Expose environment variables needed by renderer STT services EARLY
contextBridge.exposeInMainWorld('__ENV', {
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  GOOGLE_CLOUD_API_KEY: process.env.GOOGLE_CLOUD_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ELEVEN_API_KEY: process.env.ELEVEN_API_KEY,
  STT_PROVIDER: process.env.STT_PROVIDER || 'azure',
  STT_PREFER_LOCAL: process.env.STT_PREFER_LOCAL === 'true',
  // Wake word configuration
  PICOVOICE_ACCESS_KEY: process.env.PICOVOICE_ACCESS_KEY,
  WAKE_WORD_ENABLED: process.env.WAKE_WORD_ENABLED === 'true',
  VOICE_AUTO_LISTEN: process.env.VOICE_AUTO_LISTEN === 'true',
  WAKE_WORD: process.env.WAKE_WORD || 'luna'
});

contextBridge.exposeInMainWorld('voiceIPC', {
  send: <T = unknown>(ch: OutChannels, data: T) => ipcRenderer.send(ch, data),
  on:   <T = unknown>(ch: InChannels, cb: (data: T) => void) =>
           ipcRenderer.on(ch, (_, d) => cb(d)),
  invoke: <T = unknown>(ch: HandleChannels, ...args: any[]) => ipcRenderer.invoke(ch, ...args),
  
  // Specific voice methods for compatibility
  speak: (text: string, options?: any) => ipcRenderer.invoke('voice:tts-speak', text, options),
  chatWithTTS: (message: string) => ipcRenderer.invoke('voice:chat-with-tts', message),
  startListening: () => ipcRenderer.send('voice:start-listening'),
  stopListening: () => ipcRenderer.send('voice:stop-listening'),
  getState: () => ipcRenderer.invoke('voice:get-state'),
  
  // Event listeners with specific naming
  onTTSAudioData: (cb: (data: ArrayBuffer) => void) => 
    ipcRenderer.on('voice:tts-audio-data', (_, d) => {
      // Convert Buffer to ArrayBuffer if needed
      const arrayBuffer = d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
      cb(arrayBuffer);
    }),
  onTTSStarted: (cb: () => void) => 
    ipcRenderer.on('voice:tts-started', () => cb()),
  onTTSStopped: (cb: () => void) => 
    ipcRenderer.on('voice:tts-stopped', () => cb()),
  onTTSError: (cb: (error: string) => void) => 
    ipcRenderer.on('voice:tts-error', (_, error) => cb(error)),
  // Unsubscribe-capable helpers to prevent listener leaks
  onListeningStarted: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('voice:listening-started', listener);
    return () => ipcRenderer.off('voice:listening-started', listener);
  },
  onListeningStopped: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on('voice:listening-stopped', listener);
    return () => ipcRenderer.off('voice:listening-stopped', listener);
  },
  onSttTranscript: (cb: (data: { text: string; isFinal: boolean }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, d: { text: string; isFinal: boolean }) => cb(d);
    ipcRenderer.on('stt:transcript', listener);
    return () => ipcRenderer.off('stt:transcript', listener);
  },
  onMicPermission: (cb: (data: { granted: boolean; permission: string; mediaTypes?: string[]; url?: string; ts: number }) => void) => {
    const listener = (_: Electron.IpcRendererEvent, d: any) => cb(d);
    ipcRenderer.on('voice:mic-permission', listener);
    return () => ipcRenderer.off('voice:mic-permission', listener);
  },
});

// Expose STT interface backed by renderer-based Hybrid STT
const hybrid = getRendererHybridSTT();

contextBridge.exposeInMainWorld('stt', {
  start: () => hybrid.start(),
  stop: () => hybrid.stop(),
  getStatus: () => Promise.resolve((() => {
    const s = hybrid.getStatus();
    // Provide backward-compatible shape expected by renderer UI
    return {
      ...s,
      currentEngine: s.engine,
      isCloud: s.isCloud,
      isLocal: s.isLocal,
      isStarted: s.isStarted,
      error: s.lastError || undefined,
    };
  })()),
  switchToCloud: async () => { await hybrid.switchToCloud(); return { success: true }; },
  // Switch explicitly to Whisper-based STT
  switchToWhisper: async () => { await hybrid.switchToWhisper(); return { success: true }; },
  healthCheck: () => hybrid.healthCheck(),
  onTranscript: (cb: (transcript: { text: string; isFinal: boolean }) => void) => {
    const handler = (payload: { text: string; isFinal: boolean }) => cb(payload);
    hybrid.on('transcript', handler as any);
    return () => hybrid.off('transcript', handler as any);
  },
  onEngineSwitch: (cb: (info: { engine: string; isCloud: boolean }) => void) => {
    const handler = (info: { engine: string; isCloud: boolean }) => cb(info);
    hybrid.on('engine-switched', handler as any);
    return () => hybrid.off('engine-switched', handler as any);
  },
  // Allow renderer to raise IPC listener cap to avoid warnings
  setMaxListeners: (max: number) => { try { ipcRenderer.setMaxListeners(max); } catch {} }
});

// __ENV already exposed above
