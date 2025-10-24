import { getDB } from "./sqlite";
import { embed, cosine } from "./embeddings";
import { randomUUID } from "crypto";

const f32ToBuf = (v: Float32Array) =>
  Buffer.from(v.buffer, v.byteOffset, v.byteLength);
const bufToF32 = (b?: Buffer) =>
  b && b.length
    ? new Float32Array(new Uint8Array(b).buffer)
    : new Float32Array();

export async function addMemory(
  content: string,
  type: string,
  sessionId?: string,
  metadata: any = {},
) {
  const db = getDB();
  const id = randomUUID();
  const ts = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO memories (id, content, type, timestamp, metadata)
    VALUES (@id, @content, @type, @ts, @metadata)
  `,
  ).run({ id, content, type, ts, metadata: JSON.stringify(metadata) });

  const [vec] = await embed([content]);
  db.prepare(
    `
    INSERT INTO memory_vectors (id, content, embedding, metadata, timestamp, type)
    VALUES (@id, @content, @embedding, @metadata, @ts, @type)
  `,
  ).run({
    id,
    content,
    embedding: f32ToBuf(vec),
    metadata: JSON.stringify(metadata),
    ts,
    type,
  });

  return { id, timestamp: ts };
}

export function recent(limit = 20, sessionId?: string) {
  const db = getDB();
  const rows = db
    .prepare(
      `
    SELECT id, content, type, timestamp, metadata
      FROM memories
     ORDER BY timestamp DESC LIMIT @limit
  `,
    )
    .all({ limit }) as any[];
  return rows.map((r) => ({ ...r, metadata: safeJSON(r.metadata) }));
}

export function keyword(q: string, limit = 10, sessionId?: string) {
  const db = getDB();
  const rows = db
    .prepare(
      `
    SELECT id, content, type, timestamp, metadata
      FROM memory_vectors_fts
     WHERE memory_vectors_fts MATCH @q
     ORDER BY rank LIMIT @limit
  `,
    )
    .all({ q, limit }) as any[];
  return rows.map((r) => ({ ...r, metadata: safeJSON(r.metadata) }));
}

export async function semantic(q: string, k = 8, sessionId?: string) {
  const db = getDB();
  const [qv] = await embed([q]);
  if (!qv.length) return keyword(q, k, sessionId);

  const rows = db
    .prepare(
      `
    SELECT id, content, type, timestamp, metadata, embedding
      FROM memory_vectors
     ORDER BY timestamp DESC LIMIT 500
  `,
    )
    .all() as any[];

  const scored = rows.map((r) => ({
    id: r.id,
    content: r.content,
    type: r.type,
    timestamp: r.timestamp,
    metadata: safeJSON(r.metadata),
    score: cosine(qv, bufToF32(r.embedding as Buffer)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function safeJSON(s: any) {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}
