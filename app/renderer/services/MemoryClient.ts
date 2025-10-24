import { apiFetch } from "./config";
import { extractText, SttResponse } from "./voiceContracts";
import { API } from "../config/endpoints";

export async function memAdd(
  content: string,
  type = "conversation",
  sessionId?: string,
  metadata?: any,
) {
  const r = await apiFetch("/api/memory/add", {
    method: "POST",
    body: { content, type, sessionId, metadata },
  });
  if (!r.ok) throw new Error(`memAdd ${r.status}`);
  return r.json();
}

export async function memRecent(limit = 20, sessionId?: string) {
  const q = new URLSearchParams({
    limit: String(limit),
    ...(sessionId ? { sessionId } : {}),
  });
  const r = await apiFetch(`/api/memory/recent?${q}`);
  if (!r.ok) throw new Error(`memRecent ${r.status}`);
  return r.json();
}

export async function memSearch(q: string, k = 8, sessionId?: string) {
  const p = new URLSearchParams({
    q,
    k: String(k),
    ...(sessionId ? { sessionId } : {}),
  });
  const r = await apiFetch(`/api/memory/search?${p}`);
  if (!r.ok) throw new Error(`memSearch ${r.status}`);
  return r.json();
}

export async function runTool(tool: string, input?: any, sessionId?: string) {
  const r = await apiFetch("/api/tools/execute", {
    method: "POST",
    body: { tool, input, sessionId },
  });
  const j = await r.json();
  if (!r.ok || j?.ok === false)
    throw new Error(j?.error || `tool ${tool} failed`);
  return j;
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", audioBlob, "audio.webm");
  const response = await apiFetch(API.STT_TRANSCRIBE, {
    method: "POST",
    body: fd,
  });
  if (!response.ok) throw new Error("Transcription failed: " + response.status);
  const result = (await response.json()) as SttResponse;
  const text = extractText(result);
  return text;
}
