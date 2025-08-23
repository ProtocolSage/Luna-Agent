// app/renderer/services/api/toolsClient.ts

export async function executeTool(tool: string, input: any = {}, sessionId?: string) {
  if (!tool) throw new Error('tool required');
  const r = await fetch('/api/tools/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input, sessionId })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
