import { loadTools } from "./toolRegistry";
import { getDB } from "./sqlite";
import { randomUUID } from "crypto";

const tools = loadTools();

export async function executeTool(
  tool: string,
  input: any,
  sessionId?: string,
) {
  const id = randomUUID();
  const ts = new Date().toISOString();
  const db = getDB();

  try {
    if (!tools[tool]) throw new Error(`Unknown tool: ${tool}`);
    const output = await tools[tool](input);

    db.prepare(
      `
      INSERT INTO tool_audit (id, tool, input, output, error, created_at, sessionId)
      VALUES (@id, @tool, @input, @output, NULL, @ts, @sessionId)
    `,
    ).run({
      id,
      tool,
      input: JSON.stringify(input ?? {}),
      output: JSON.stringify(output ?? {}),
      ts,
      sessionId: sessionId ?? null,
    });

    return { ok: true, id, output };
  } catch (e: any) {
    db.prepare(
      `
      INSERT INTO tool_audit (id, tool, input, output, error, created_at, sessionId)
      VALUES (@id, @tool, @input, NULL, @error, @ts, @sessionId)
    `,
    ).run({
      id,
      tool,
      input: JSON.stringify(input ?? {}),
      error: String(e?.message || e),
      ts,
      sessionId: sessionId ?? null,
    });

    return { ok: false, id, error: String(e?.message || e) };
  }
}
