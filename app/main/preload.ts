import { contextBridge, ipcRenderer } from 'electron';

type OutChannels = 'transcript' | 'vad' | 'voice:initialize' | 'voice:start-listening' | 'voice:stop-listening' | 'voice:push-to-talk' | 'voice:set-mode' | 'voice:command' | 'voice:clear-history' | 'voice:tts-speak' | 'voice:tts-stop' | 'voice:tts-switch-voice';
type InChannels  = 'tts-ready' | 'voice:initialized' | 'voice:error' | 'voice:listening-started' | 'voice:listening-stopped' | 'voice:wake-word' | 'voice:transcript' | 'voice:transcription' | 'voice:interim-transcription' | 'voice:speaking-started' | 'voice:speaking-stopped' | 'voice:processing-started' | 'voice:processing-stopped' | 'voice:tts-audio-data' | 'voice:tts-started' | 'voice:tts-stopped' | 'voice:tts-stop-playback' | 'voice:tts-error' | 'voice:mode-changed' | 'voice:history-cleared' | 'voice:command-processed' | 'voice:push-to-talk-pressed' | 'voice:push-to-talk-released' | 'stt:transcript' | 'stt:engine-switched';
type HandleChannels = 'voice:get-state' | 'voice:get-history' | 'voice:chat-with-tts' | 'stt:start' | 'stt:stop' | 'stt:get-status' | 'stt:switch-to-cloud' | 'stt:switch-to-whisper' | 'stt:health-check';

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
});

// Expose STT interface
contextBridge.exposeInMainWorld('stt', {
  start: () => ipcRenderer.invoke('stt:start'),
  stop: () => ipcRenderer.invoke('stt:stop'),
  getStatus: () => ipcRenderer.invoke('stt:get-status'),
  switchToCloud: () => ipcRenderer.invoke('stt:switch-to-cloud'),
  switchToWhisper: () => ipcRenderer.invoke('stt:switch-to-whisper'),
  healthCheck: () => ipcRenderer.invoke('stt:health-check'),
  onTranscript: (cb: (transcript: { text: string; isFinal: boolean }) => void) =>
    ipcRenderer.on('stt:transcript', (_, transcript) => cb(transcript)),
  onEngineSwitch: (cb: (info: { engine: string; isCloud: boolean }) => void) =>
    ipcRenderer.on('stt:engine-switched', (_, info) => cb(info))
});
