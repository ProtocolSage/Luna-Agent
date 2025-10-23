import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOG_DIR, 'luna.log');

type LogLevel = 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message} ${data ? JSON.stringify(data) : ''}\n`;
  
  // Console
  console[level === 'info' ? 'log' : level](message, data || '');
  
  // File (async, non-blocking)
  fs.appendFile(LOG_FILE, logLine, () => {});
}

export const logger = {
  info: (msg: string, data?: any) => log('info', msg, data),
  warn: (msg: string, data?: any) => log('warn', msg, data),
  error: (msg: string, data?: any) => log('error', msg, data),
};
