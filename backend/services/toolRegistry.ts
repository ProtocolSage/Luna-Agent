import path from 'path';
import fs from 'fs';

export type ToolFn = (input: any) => Promise<any>;

function tryLoad(fileRel: string): ToolFn | null {
  const full = path.resolve(process.cwd(), fileRel);
  if (!fs.existsSync(full)) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(full);
  const fn: any = mod?.default || mod?.run || mod;
  return (typeof fn === 'function') ? async (input: any) => await fn(input) : null;
}

const builtins: Record<string, ToolFn> = {
  status: async () => ({ ok: true }),
  reminders: async (i) => ({ scheduled: i?.when ?? 'unspecified' }),
  goals: async (i) => ({ stored: !!i }),
  executive: async (i) => ({ summary: String(i ?? '') })
};

export function loadTools(): Record<string, ToolFn> {
  const reg: Record<string, ToolFn> = { ...builtins };
  for (const rel of [
    'dist/agent/tools/status.js',
    'dist/agent/tools/reminders.js',
    'dist/agent/tools/goals.js',
    'dist/agent/tools/executive.js'
  ]) {
    const name = path.basename(rel, '.js');
    const fn = tryLoad(rel);
    if (fn) reg[name] = fn;
  }
  return reg;
}
