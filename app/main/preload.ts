// Environment variables are loaded by main process
// We just expose what's available in process.env
import { contextBridge, ipcRenderer } from 'electron';

// Note: Renderer services should not be imported in preload
// They will be loaded directly in the renderer process
type OutChannels = 'transcript' | 'vad' | 'voice:initialize' | 'voice:start-listening' | 'voice:stop-listening' | 'voice:push-to-talk' | 'voice:set-mode' | 'voice:command' | 'voice:clear-history' | 'voice:tts-speak' | 'voice:tts-stop' | 'voice:tts-switch-voice';
type InChannels  = 'tts-ready' | 'voice:initialized' | 'voice:error' | 'voice:listening-started' | 'voice:listening-stopped' | 'voice:wake-word' | 'voice:transcript' | 'voice:transcription' | 'voice:interim-transcription' | 'voice:speaking-started' | 'voice:speaking-stopped' | 'voice:processing-started' | 'voice:processing-stopped' | 'voice:tts-audio-data' | 'voice:tts-started' | 'voice:tts-stopped' | 'voice:tts-stop-playback' | 'voice:tts-error' | 'voice:mode-changed' | 'voice:history-cleared' | 'voice:command-processed' | 'voice:push-to-talk-pressed' | 'voice:push-to-talk-released' | 'stt:transcript' | 'stt:engine-switched' | 'voice:mic-permission';
type HandleChannels = 'voice:get-state' | 'voice:get-history' | 'voice:chat-with-tts' | 'stt:start' | 'stt:stop' | 'stt:get-status' | 'stt:switch-to-cloud' | 'stt:switch-to-whisper' | 'stt:health-check';

// ENSURE this ENV exposure exists with your required vars
// SECURITY: API keys are NOT exposed to renderer process to prevent XSS attacks
// Renderer should use backend API endpoints for operations requiring API keys
contextBridge.exposeInMainWorld('__ENV', {
  LUNA_API_BASE: process.env.LUNA_API_BASE,
  API_BASE: process.env.API_BASE,
  // Jarvis Mode Configuration - Properly expose from environment
  VOICE_AUTO_LISTEN: process.env.VOICE_AUTO_LISTEN === 'true',
  WAKE_WORD_ENABLED: process.env.WAKE_WORD_ENABLED === 'true',
  VOICE_ENABLED: process.env.VOICE_ENABLED === 'true',
  LUNA_CONTINUOUS_CONVERSATION: process.env.LUNA_CONTINUOUS_CONVERSATION === 'true',
  LUNA_AUTO_LISTEN_AFTER_TTS: process.env.LUNA_AUTO_LISTEN_AFTER_TTS === 'true',
  LUNA_SILENCE_TIMEOUT: parseInt(process.env.LUNA_SILENCE_TIMEOUT || '3000', 10),
  LUNA_SENTENCE_TTS: process.env.LUNA_SENTENCE_TTS === 'true',
  // Service Provider Configuration (non-sensitive)
  STT_PROVIDER: process.env.STT_PROVIDER || 'azure',
  STT_PREFER_LOCAL: process.env.STT_PREFER_LOCAL === 'true',
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION, // Region is not sensitive
  WAKE_WORD: process.env.WAKE_WORD || 'luna', // Wake word text is not sensitive
  // Feature Flags - Indicate which services are configured (without exposing keys)
  HAS_AZURE_SPEECH: !!process.env.AZURE_SPEECH_KEY,
  HAS_DEEPGRAM: !!process.env.DEEPGRAM_API_KEY,
  HAS_GOOGLE_CLOUD: !!process.env.GOOGLE_CLOUD_API_KEY,
  HAS_OPENAI: !!process.env.OPENAI_API_KEY,
  HAS_ELEVEN_LABS: !!process.env.ELEVEN_API_KEY,
  HAS_PICOVOICE: !!process.env.PICOVOICE_ACCESS_KEY
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

// Expose STT interface - handled via IPC to main process
// Note: STT processing happens in renderer, but we provide IPC bridge for coordination
contextBridge.exposeInMainWorld('stt', {
  start: () => ipcRenderer.invoke('stt:start'),
  stop: () => ipcRenderer.invoke('stt:stop'),
  getStatus: () => ipcRenderer.invoke('stt:get-status'),
  switchToCloud: async () => {
    await ipcRenderer.invoke('stt:switch-to-cloud');
    return { success: true };
  },
  switchToWhisper: async () => {
    await ipcRenderer.invoke('stt:switch-to-whisper');
    return { success: true };
  },
  healthCheck: () => ipcRenderer.invoke('stt:health-check'),
  onTranscript: (cb: (transcript: { text: string; isFinal: boolean }) => void) => {
    const handler = (_: any, payload: { text: string; isFinal: boolean }) => cb(payload);
    ipcRenderer.on('stt:transcript', handler);
    return () => ipcRenderer.removeListener('stt:transcript', handler);
  },
  onEngineSwitch: (cb: (info: { engine: string; isCloud: boolean }) => void) => {
    const handler = (_: any, info: { engine: string; isCloud: boolean }) => cb(info);
    ipcRenderer.on('stt:engine-switched', handler);
    return () => ipcRenderer.removeListener('stt:engine-switched', handler);
  },
  // Allow renderer to raise IPC listener cap to avoid warnings
  setMaxListeners: (max: number) => { try { ipcRenderer.setMaxListeners(max); } catch {} }
});
