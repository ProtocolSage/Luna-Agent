import OpenAI from "openai";

const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (!process.env.OPENAI_API_KEY) return texts.map(() => new Float32Array());
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.embeddings.create({ model: MODEL, input: texts });
  return res.data.map((d) => new Float32Array(d.embedding as number[]));
}

export function cosine(a: Float32Array, b: Float32Array) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den ? dot / den : 0;
}
