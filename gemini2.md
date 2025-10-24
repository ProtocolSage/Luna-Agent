user
Luna Voice Agent — Supabase + Whisper (Windows 11)

You are an expert AI coding agent operating inside WSL2 on a Windows 11 host. Author code for a production desktop voice assistant using Electron + React + Node (Express) with Supabase (Postgres), OpenAI Whisper (server-side) for STT, ElevenLabs for TTS (with Windows SAPI fallback), and OpenAI for chat responses.

Absolute Windows project path:
C:\dev\luna-agent-v1.0-production-complete-2
(WSL2 path: /mnt/c/dev/luna-agent-v1.0-production-complete-2)

Follow the Execution Order below precisely. Produce complete files (no placeholders, no TODOs). When secrets are missing at runtime, log a clear warning and use safe fallbacks (offline mode for chat, SAPI for TTS, UI hints for STT). Never expose the Supabase service role key to the renderer.

Supabase schema (authoritative)

Run in Supabase SQL editor:

-- Tables
create table if not exists public.conversations (
id bigserial primary key,
started_at timestamptz not null default now()
);

create table if not exists public.messages (
id bigserial primary key,
conversation_id bigint not null references public.conversations(id) on delete cascade,
role text not null check (role in ('user','assistant','system')),
content text not null,
created_at timestamptz not null default now(),
meta jsonb not null default '{}'
);

create table if not exists public.memory (
id bigserial primary key,
key text not null unique,
value jsonb not null,
category text not null default 'general',
importance int not null default 5,
last_accessed timestamptz not null default now(),
created_at timestamptz not null default now()
);

create table if not exists public.tool_usage (
id bigserial primary key,
conversation_id bigint references public.conversations(id) on delete cascade,
tool_name text not null,
input jsonb,
output jsonb,
success boolean,
duration_ms integer,
created_at timestamptz not null default now()
);

create table if not exists public.analytics (
id bigserial primary key,
event_type text not null,
data jsonb not null default '{}',
created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_messages_conversation on public.messages(conversation_id, created_at);
create index if not exists idx_memory_category on public.memory(category, importance, last_accessed);
create index if not exists idx_tool_usage_conv on public.tool_usage(conversation_id, created_at);
create index if not exists idx_analytics_event on public.analytics(event_type, created_at);

-- RLS
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memory enable row level security;
alter table public.tool_usage enable row level security;
alter table public.analytics enable row level security;

-- Deny anon; backend uses SERVICE_ROLE and bypasses RLS.
drop policy if exists "anon_select_none" on public.conversations;
create policy "anon_select_none" on public.conversations for select to anon using (false);
drop policy if exists "anon_select_none_m" on public.messages;
create policy "anon_select_none_m" on public.messages for select to anon using (false);
drop policy if exists "anon_select_none_mem" on public.memory;
create policy "anon_select_none_mem" on public.memory for select to anon using (false);
drop policy if exists "anon_select_none_tu" on public.tool_usage;
create policy "anon_select_none_tu" on public.tool_usage for select to anon using (false);
drop policy if exists "anon_select_none_an" on public.analytics;
create policy "anon_select_none_an" on public.analytics for select to anon using (false);

Execution Order (exact)

Repository normalization (paths, folders).

Package manifest and postinstall.

TypeScript configs.

Webpack configs (main/preload/renderer).

Electron Builder config.

Env & Zod validation.

Logger core.

Supabase client & repository.

Backend services (chat, tts, whisper transcription, websocket).

Backend HTTP composition (routes, server, bootstrap).

Electron main & preload.

Renderer (UI scaffolding).

Renderer (voice capture & send).

Build.

Run.

Package (NSIS).

Output format: For each file, emit:

### FILE: <relative/path>

```<lang>
<full content>
```

After each phase, provide a Run/Verify block (PowerShell) with expected results. If you hit size limits, stop at a clean phase boundary and I’ll add “Continue Phase …” as a new ## user block.

PHASE 1 — Repo normalization

Create/confirm this structure:

C:\dev\luna-agent-v1.0-production-complete-2\
 assets\ (icon.ico, tray.png)
scripts\
 src\
 backend\
 api\
 core\
 db\
 services\
 electron\
 renderer\
 app\
 voice\

PHASE 2 — Package + Postinstall (Whisper + ffmpeg)
FILE: package.json
{
"name": "luna-voice-agent",
"version": "2.0.0",
"description": "Luna Voice Agent for Windows (Supabase + Whisper)",
"main": "dist/electron/main.js",
"author": "Luna",
"license": "MIT",
"scripts": {
"clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true});\"",
"typecheck": "tsc -p tsconfig.base.json --noEmit",
"build:backend": "tsc -p tsconfig.backend.json",
"build:preload": "webpack --config webpack.preload.js --mode production",
"build:main": "webpack --config webpack.main.js --mode production",
"build:renderer": "webpack --config webpack.renderer.js --mode production",
"build": "npm run clean && npm run build:backend && npm run build:preload && npm run build:main && npm run build:renderer",
"start:backend": "node dist/backend/server.js",
"start:electron": "electron .",
"dev:backend": "node --watch dist/backend/server.js",
"dev": "concurrently \"npm:watch:backend\" \"npm:watch:renderer\" \"npm:watch:main\" \"npm:run-electron\"",
"watch:backend": "tsc -p tsconfig.backend.json --watch",
"watch:renderer": "webpack --config webpack.renderer.js --mode development --watch",
"watch:main": "webpack --config webpack.main.js --mode development --watch",
"run-electron": "wait-on http://localhost:3000 && electron .",
"postinstall": "powershell -ExecutionPolicy Bypass -File ./scripts/postinstall.ps1",
"package": "electron-builder",
"make": "electron-builder --win nsis",
"publish-local": "electron-builder --publish never",
"lint": "echo \"Lint configured separately\"",
"test": "echo \"Tests added later\""
},
"dependencies": {
"@picovoice/porcupine-node": "3.0.2",
"@ricky0123/vad-web": "0.0.17",
"@supabase/supabase-js": "2.45.4",
"@types/ws": "8.5.10",
"cors": "2.8.5",
"dotenv": "16.4.5",
"electron-is-dev": "3.0.1",
"elevenlabs": "0.16.1",
"express": "4.19.2",
"express-rate-limit": "7.2.0",
"ffmpeg-static": "5.2.0",
"fluent-ffmpeg": "2.1.2",
"helmet": "7.1.0",
"multer": "1.4.5-lts.1",
"openai": "4.58.1",
"pino": "9.3.2",
"pino-pretty": "11.2.2",
"socket.io": "4.7.5",
"socket.io-client": "4.7.5",
"uuid": "9.0.1",
"ws": "8.18.0",
"zod": "3.23.8"
},
"devDependencies": {
"@types/cors": "2.8.17",
"@types/express": "4.17.21",
"@types/node": "20.14.10",
"concurrently": "8.2.2",
"electron": "28.3.2",
"electron-builder": "24.13.3",
"html-webpack-plugin": "5.6.0",
"ts-loader": "9.5.1",
"typescript": "5.4.5",
"wait-on": "7.2.0",
"webpack": "5.91.0",
"webpack-cli": "5.1.4"
}
}

FILE: scripts/postinstall.ps1
Write-Host "Postinstall checks (Windows)..."
node -e "console.log('Node OK:', process.version)"

Run/Verify (Phase 2)

cd C:\dev\luna-agent-v1.0-production-complete-2
npm install
npm run typecheck

Expected: Postinstall prints Node version; typecheck passes.

PHASE 3 — TypeScript configs
FILE: tsconfig.base.json
{
"compilerOptions": {
"target": "ES2020",
"lib": ["ES2020", "DOM"],
"module": "commonjs",
"moduleResolution": "node",
"strict": true,
"declaration": false,
"esModuleInterop": true,
"skipLibCheck": true,
"resolveJsonModule": true,
"forceConsistentCasingInFileNames": true,
"noUncheckedIndexedAccess": true
}
}

FILE: tsconfig.backend.json
{
"extends": "./tsconfig.base.json",
"compilerOptions": {
"outDir": "./dist/backend",
"rootDir": "./src/backend"
},
"include": ["src/backend/**/*"]
}

FILE: tsconfig.electron.json
{
"extends": "./tsconfig.base.json",
"compilerOptions": {
"outDir": "./dist/electron",
"rootDir": "./src/electron"
},
"include": ["src/electron/**/*"]
}

FILE: tsconfig.renderer.json
{
"extends": "./tsconfig.base.json",
"compilerOptions": {
"outDir": "./dist/renderer",
"rootDir": "./src/renderer",
"jsx": "react-jsx"
},
"include": ["src/renderer/**/*"]
}

PHASE 4 — Webpack configs
FILE: webpack.main.js
const path = require('path');

module.exports = {
target: 'electron-main',
entry: './src/electron/main.ts',
output: {
path: path.resolve(**dirname, 'dist/electron'),
filename: 'main.js'
},
resolve: { extensions: ['.ts', '.js'] },
module: { rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }] },
externals: { electron: 'commonjs2 electron' },
node: { **dirname: false, \_\_filename: false },
devtool: 'source-map',
mode: 'production'
};

FILE: webpack.preload.js
const path = require('path');

module.exports = {
target: 'electron-preload',
entry: './src/electron/preload.ts',
output: {
path: path.resolve(**dirname, 'dist/electron'),
filename: 'preload.js'
},
resolve: { extensions: ['.ts', '.js'] },
module: { rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }] },
node: { **dirname: false, \_\_filename: false },
devtool: 'source-map',
mode: 'production'
};

FILE: webpack.renderer.js
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
target: 'web',
entry: './src/renderer/index.tsx',
output: {
path: path.resolve(\_\_dirname, 'dist/renderer'),
filename: 'renderer.js',
clean: true
},
resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
module: {
rules: [
{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
{ test: /\.(png|jpg|gif|svg|ico)$/, type: 'asset/resource' }
]
},
plugins: [
new HtmlWebpackPlugin({ template: './src/renderer/index.html' })
],
devtool: 'source-map',
mode: 'production'
};

PHASE 5 — Electron Builder config
FILE: electron-builder.yml
appId: com.luna.voiceagent
productName: Luna Voice Agent
directories:
output: release
files:

- dist/\*\*
- assets/\*\*
- package.json
  win:
  target: - target: nsis
  arch: - x64
  icon: assets/icon.ico
  nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  allowElevation: true
  installerIcon: assets/icon.ico
  uninstallerIcon: assets/icon.ico
  installerHeaderIcon: assets/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Luna Voice Agent

PHASE 6 — Env & validation (no Azure; Whisper required)
FILE: .env.example

# Server

PORT=3000
NODE_ENV=production

# Supabase (required)

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI (required for chat + Whisper STT)

OPENAI_API_KEY=

# ElevenLabs (optional; Windows SAPI fallback used if absent)

ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Features

ENABLE_WAKE_WORD=false
ENABLE_CONTINUOUS_LISTENING=false

FILE: src/backend/core/env.ts
import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
PORT: z.coerce.number().default(3000),
NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

SUPABASE_URL: z.string().url(),
SUPABASE_ANON_KEY: z.string(),
SUPABASE_SERVICE_ROLE_KEY: z.string(),

OPENAI_API_KEY: z.string().optional(),

ELEVENLABS_API_KEY: z.string().optional(),
ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),

ENABLE_WAKE_WORD: z.string().default('false'),
ENABLE_CONTINUOUS_LISTENING: z.string().default('false')
});

export const env = EnvSchema.parse(process.env);
export const isDev = env.NODE_ENV === 'development';

FILE: src/backend/core/logger.ts
import pino from 'pino';
import { isDev } from './env';

export const logger = pino({
level: isDev ? 'debug' : 'info',
transport: isDev
? { target: 'pino-pretty', options: { colorize: true, translateTime: true } }
: undefined,
base: undefined,
redact: ['req.headers.authorization']
});

PHASE 7 — Supabase client & repo
FILE: src/backend/db/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';
import { env } from '../core/env';

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
auth: { persistSession: false },
global: { headers: { 'X-Client-Info': 'luna-backend' } }
});

FILE: src/backend/db/repo.ts
import { supabaseAdmin } from './supabaseClient';

export async function startConversation(): Promise<number> {
const { data, error } = await supabaseAdmin
.from('conversations')
.insert({})
.select('id')
.single();
if (error || !data) throw new Error(`startConversation_failed: ${error?.message ?? 'no data'}`);
return Number(data.id);
}

export async function addMessage(
conversationId: number,
role: 'user'|'assistant'|'system',
content: string,
meta: any = {}
): Promise<void> {
const { error } = await supabaseAdmin
.from('messages')
.insert({ conversation_id: conversationId, role, content, meta });
if (error) throw new Error(`addMessage_failed: ${error.message}`);
}

export async function getLastMessages(
conversationId: number,
limit = 20
): Promise<Array<{role:string;content:string;created_at:string;meta:any}>> {
const { data, error } = await supabaseAdmin
.from('messages')
.select('role, content, created_at, meta')
.eq('conversation_id', conversationId)
.order('created_at', { ascending: false })
.limit(limit);
if (error) throw new Error(`getLastMessages_failed: ${error.message}`);
return (data ?? []).reverse().map(r => ({ ...r, meta: r.meta ?? {} }));
}

export async function storeMemory(
key: string,
value: any,
category = 'general',
importance = 5
): Promise<void> {
const { error } = await supabaseAdmin
.from('memory')
.upsert({
key, value, category, importance,
last_accessed: new Date().toISOString()
}, { onConflict: 'key' });
if (error) throw new Error(`storeMemory_failed: ${error.message}`);
}

export async function recallMemory(category: string, limit = 10) {
const { data, error } = await supabaseAdmin
.from('memory')
.select('key, value, category, importance, last_accessed')
.eq('category', category)
.order('importance', { ascending: false })
.order('last_accessed', { ascending: false })
.limit(limit);
if (error) throw new Error(`recallMemory_failed: ${error.message}`);
return data ?? [];
}

PHASE 8 — Backend services (Chat, TTS, Whisper STT, WS)
FILE: src/backend/services/chat.ts
import OpenAI from 'openai';
import { env } from '../core/env';
import { addMessage, getLastMessages } from '../db/repo';
import { logger } from '../core/logger';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export async function generateAssistantReply(conversationId: number, userText: string): Promise<string> {
if (!openai) {
const offline = `I heard you say: "${userText}". I'm currently offline (no OPENAI_API_KEY set).`;
await addMessage(conversationId, 'assistant', offline, { provider: 'offline' });
return offline;
}

const history = await getLastMessages(conversationId, 12);
const messages = [
{ role: 'system' as const, content: 'You are Luna, a concise, helpful voice assistant.' },
...history.map(h => ({ role: h.role as 'user'|'assistant'|'system', content: h.content })),
{ role: 'user' as const, content: userText }
];

const completion = await openai.chat.completions.create({
model: 'gpt-4o-mini', // small, fast; adjust as desired
messages,
temperature: 0.6,
max_tokens: 500
});

const content = completion.choices[0]?.message?.content?.trim() ?? 'Sorry, I had trouble responding.';
await addMessage(conversationId, 'assistant', content, { provider: 'openai' });
logger.debug({ content }, 'Assistant reply generated');
return content;
}

FILE: src/backend/services/tts.ts
import { EventEmitter } from 'events';
import { ElevenLabsClient } from 'elevenlabs';
import { env } from '../core/env';
import { logger } from '../core/logger';
import { Readable } from 'stream';
import Speaker from 'speaker';
import { spawn } from 'child_process';

export class VoiceOutputService extends EventEmitter {
private eleven: ElevenLabsClient | null = null;
private voiceId: string;
private queue: Buffer[] = [];
private playing = false;
private speaker: Speaker | null = null;
private interrupted = false;

constructor() {
super();
this.voiceId = env.ELEVENLABS_VOICE_ID;
if (env.ELEVENLABS_API_KEY) {
this.eleven = new ElevenLabsClient({ apiKey: env.ELEVENLABS_API_KEY });
this.speaker = new Speaker({ channels: 1, bitDepth: 16, sampleRate: 22050 });
this.speaker.on('error', (e) => logger.error(e, 'Speaker error'));
} else {
logger.warn('ELEVENLABS_API_KEY not set. Falling back to Windows SAPI for speech.');
}
}

async speak(text: string): Promise<void> {
if (!text || !text.trim()) return;
if (this.interrupted) this.interrupted = false;

    try {
      let audioBuf: Buffer | null = null;

      if (this.eleven) {
        const stream = await this.eleven.generate({
          voice: this.voiceId,
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }
        });

        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        audioBuf = Buffer.concat(chunks);
      }

      if (audioBuf) {
        this.queue.push(audioBuf);
        if (!this.playing) await this.processQueue();
      } else {
        // Fallback to Windows SAPI
        await this.sapiSpeak(text);
      }
    } catch (err) {
      logger.error(err, 'TTS error; using SAPI fallback');
      await this.sapiSpeak(text);
    }

}

private async processQueue(): Promise<void> {
if (this.queue.length === 0) { this.playing = false; this.emit('playback-complete'); return; }
this.playing = true;
const buf = this.queue.shift()!;
await this.playBuffer(buf);
await this.processQueue();
}

private playBuffer(buf: Buffer) {
return new Promise<void>((resolve, reject) => {
if (this.interrupted) { this.interrupted = false; return resolve(); }
if (!this.speaker) return resolve(); // if we’re on SAPI fallback just resolve

      const readable = new Readable({ read() {} });
      readable.push(buf); readable.push(null);
      const stream = readable.pipe(this.speaker, { end: false });
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

}

interrupt() {
this.interrupted = true;
this.queue = [];
if (this.speaker) {
try { this.speaker.close(); } catch {}
this.speaker = new Speaker({ channels: 1, bitDepth: 16, sampleRate: 22050 });
}
this.emit('interrupted');
}

private sapiSpeak(text: string): Promise<void> {
return new Promise((resolve) => {
if (process.platform !== 'win32') return resolve();
const cmd = `powershell -Command "Add-Type -AssemblyName System.Speech; ` + `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` + `$s.Speak('${text.replace(/'/g, "''")}');"`;
const child = spawn('powershell', ['-Command', cmd], { windowsHide: true });
child.on('exit', () => resolve());
child.on('error', () => resolve());
});
}
}

export const VoiceOut = new VoiceOutputService();

FILE: src/backend/services/whisper.ts
import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { logger } from '../core/logger';
import { env } from '../core/env';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as string);

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export async function transcribeWebmToText(inputPath: string): Promise<string> {
// Whisper accepts webm, but normalize to WAV 16k mono PCM for reliability.
const wavPath = inputPath.replace(/\.webm$/i, '.wav');
await convertToWav(inputPath, wavPath, 16000);

if (!openai) {
logger.warn('OPENAI_API_KEY not set; cannot transcribe. Returning empty string.');
cleanup([wavPath, inputPath]);
return '';
}

const fileStream = fs.createReadStream(wavPath);
const result = await openai.audio.transcriptions.create({
model: 'whisper-1',
file: fileStream
});

cleanup([wavPath, inputPath]);
return (result.text ?? '').trim();
}

function convertToWav(src: string, dest: string, sr: number): Promise<void> {
return new Promise((resolve, reject) => {
ffmpeg(src)
.audioChannels(1)
.audioFrequency(sr)
.format('wav')
.output(dest)
.on('error', (err) => reject(err))
.on('end', () => resolve())
.run();
});
}

function cleanup(paths: string[]) {
for (const p of paths) try { fs.unlinkSync(p); } catch {}
}

FILE: src/backend/services/ws.ts
import { Server } from 'socket.io';
import { logger } from '../core/logger';

export function createSocketServer(httpServer: any) {
const io = new Server(httpServer, {
cors: { origin: '\*', methods: ['GET','POST'] }
});

io.on('connection', (socket) => {
logger.debug({ id: socket.id }, 'WS client connected');
socket.on('disconnect', () => logger.debug({ id: socket.id }, 'WS client disconnected'));
// Extend with events as needed (interim transcripts, chunks, etc.)
});

return io;
}

PHASE 9 — Backend HTTP (routes + server)
FILE: src/backend/api/routes.ts
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { startConversation, addMessage } from '../db/repo';
import { generateAssistantReply } from '../services/chat';
import { transcribeWebmToText } from '../services/whisper';
import { VoiceOut } from '../services/tts';

const router = Router();
const upload = multer({ dest: path.join(process.cwd(), 'tmp') });

router.get('/healthz', (\_req, res) => res.json({ ok: true }));

router.post('/agent/chat', async (req, res) => {
try {
const { message } = req.body ?? {};
if (typeof message !== 'string' || !message.trim()) {
return res.status(400).json({ error: 'Invalid message' });
}
const conversationId = await startConversation();
await addMessage(conversationId, 'user', message, {});
const reply = await generateAssistantReply(conversationId, message);
try { VoiceOut.speak(reply).catch(()=>{}); } catch {}
return res.json({ conversationId, reply });
} catch (err: any) {
return res.status(500).json({ error: 'chat_failed', details: err?.message ?? 'unknown' });
}
});

router.post('/voice/transcribe', upload.single('audio'), async (req, res) => {
const filePath = req.file?.path;
if (!filePath) return res.status(400).json({ error: 'missing_audio' });
try {
const text = await transcribeWebmToText(filePath);
return res.json({ text });
} catch (err: any) {
try { fs.unlinkSync(filePath); } catch {}
return res.status(500).json({ error: 'transcription_failed', details: err?.message ?? 'unknown' });
}
});

router.post('/voice/tts', async (req, res) => {
const { text } = req.body ?? {};
if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'invalid_text' });
try {
await VoiceOut.speak(text);
return res.json({ ok: true });
} catch (err: any) {
return res.status(500).json({ error: 'tts_failed', details: err?.message ?? 'unknown' });
}
});

router.post('/voice/interrupt', async (\_req, res) => {
try { VoiceOut.interrupt(); } catch {}
return res.json({ ok: true });
});

export default router;

FILE: src/backend/core/server.ts
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import routes from '../api/routes';

export function createHttpApp() {
const app = express();

app.use(helmet());
app.use(cors({ origin: '\*', methods: ['GET','POST'] }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(rateLimit({ windowMs: 60_000, max: 120 })); // 120 req/min

app.use('/api', routes);

app.use((err: any, \_req: any, res: any, \_next: any) => {
res.status(500).json({ error: 'internal_error', details: err?.message ?? 'unknown' });
});

return app;
}

FILE: src/backend/server.ts
import http from 'http';
import { createHttpApp } from './core/server';
import { env } from './core/env';
import { logger } from './core/logger';
import { createSocketServer
