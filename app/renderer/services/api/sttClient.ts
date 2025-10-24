// app/renderer/services/api/sttClient.ts
// Dedicated speech-to-text client that forces backend Whisper first

import { apiFetch } from "../config";
import { extractText, SttResponse } from "../voiceContracts";
import { API } from "../../config/endpoints";

export async function transcribeBlob(b: Blob, filename = "audio.webm") {
  const fd = new FormData();
  fd.append("file", b, filename);

  const r = await apiFetch(API.STT_TRANSCRIBE, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`transcribe ${r.status}`);
  const j = (await r.json()) as SttResponse;
  const text = extractText(j);
  if (!text) {
    throw new Error("transcribe malformed response");
  }
  return text;
}
