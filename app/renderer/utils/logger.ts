// Renderer-safe logger - only logs to console
// File logging should be done in main process via IPC

type LogLevel = "info" | "warn" | "error" | "debug";

function log(level: LogLevel, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

  // Console only (renderer process doesn't have direct fs access)
  console[level === "info" ? "log" : level](logLine, data || "");
}

export const logger = {
  info: (msg: string, data?: any) => log("info", msg, data),
  warn: (msg: string, data?: any) => log("warn", msg, data),
  error: (msg: string, data?: any) => log("error", msg, data),
  debug: (msg: string, data?: any) => log("info", msg, data),
};
