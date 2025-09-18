export async function loadVadWorklet(ac: AudioContext) {
  const url = './assets/vad/vad.worklet.bundle.min.js';
  try {
    await ac.audioWorklet.addModule(url);
  } catch (e) {
    console.error('VAD worklet failed to load:', e);
    const hint = 'VAD asset missing or blocked. Rebuild, or check dist/app/renderer/assets/vad/.';
    // Surface in UI/toast if you have one
    throw new Error(hint);
  }
}
