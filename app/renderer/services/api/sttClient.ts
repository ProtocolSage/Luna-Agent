// app/renderer/services/api/sttClient.ts
// Dedicated speech-to-text client that forces backend Whisper first

import { apiFetch } from '../config';
import { API } from '../../config/endpoints';

export async function transcribeBlob(b: Blob, filename = 'audio.webm') {
  const fd = new FormData();
  fd.append('file', b, filename);

  const r = await apiFetch(API.STT_TRANSCRIBE, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`transcribe ${r.status}`);
  const j = await r.json();
  if (!j || typeof j.transcription !== 'string') {
    throw new Error('transcribe malformed response');
  }
  return j.transcription;
}
