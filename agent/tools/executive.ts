import { execSync } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { MemoryService } from "../../memory/MemoryService";
import { MemoryType } from "../../memory/MemoryStore";

// Create memory service instance
const memoryService = new MemoryService();
import { getStatus } from "./status";
import { GoalManager } from "./goals";
import { ReminderManager } from "./reminders";

export interface ToolStep {
  tool: string;
  args: Record<string, any>;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  output?: any;
  error?: string;
  latencyMs: number;
  metadata?: Record<string, any>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: Record<string, any>, context: ToolContext) => Promise<any>;
}
export interface ToolContext {
  traceId: string;
  sessionId: string;
  workingDir: string;
  allowlist: string[];
}

// == Security check: only basic sanity! ==
function assertSafePath(p: string) {
  if (!p) throw new Error("Path required");
  if (p.includes("..")) throw new Error("Path traversal not allowed");
  // That’s it—no more coddling.
}

// == EXECUTIVE CLASS ==
export class ToolExecutive {
  private tools: Map<string, ToolDefinition> = new Map();
  private policy: any; // PolicyConfig type - add proper import if needed
  private goalManager: GoalManager = new GoalManager();
  private reminderManager: ReminderManager = new ReminderManager();

  constructor(policy?: any) {
    this.policy = policy || { allowlist: [] };
    this.registerAll();
  }
  registerTool(def: ToolDefinition) {
    this.tools.set(def.name, def);
  }
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
  getToolDefinitionsAsText(): string[] {
    return Array.from(this.tools.values()).map(
      (tool) =>
        `${tool.name}: ${tool.description} (params: ${JSON.stringify(tool.parameters)})`,
    );
  }

  async executePlan(steps: ToolStep[], traceId: string): Promise<ToolResult[]> {
    const context: ToolContext = {
      traceId,
      sessionId: traceId.split("_")[1] || "unknown",
      workingDir: process.cwd(),
      allowlist: this.policy?.allowlist || [],
    };
    const results: ToolResult[] = [];
    for (const step of steps) {
      const t0 = Date.now();
      try {
        const def = this.tools.get(step.tool);
        if (!def) throw new Error("Unknown tool");
        const output = await def.handler(step.args, context);
        results.push({
          tool: step.tool,
          success: true,
          output,
          latencyMs: Date.now() - t0,
        });
      } catch (error: any) {
        results.push({
          tool: step.tool,
          success: false,
          error: error.message,
          latencyMs: Date.now() - t0,
        });
      }
    }
    return results;
  }

  // ==== Register ALL TOOLS ====
  private registerAll() {
    // ---- Filesystem Tools ----
    this.registerTool({
      name: "read_file",
      description: "Read file as UTF-8 string.",
      parameters: { path: { type: "string", required: true } },
      handler: async (args) => {
        assertSafePath(args.path);
        return fs.readFile(args.path, "utf8");
      },
    });
    this.registerTool({
      name: "write_file",
      description: "Write string to file (overwrites/creates).",
      parameters: {
        path: { type: "string", required: true },
        content: { type: "string", required: true },
      },
      handler: async (args) => {
        assertSafePath(args.path);
        await fs.writeFile(args.path, args.content, "utf8");
        return "OK";
      },
    });
    this.registerTool({
      name: "append_file",
      description: "Append string to file.",
      parameters: {
        path: { type: "string", required: true },
        content: { type: "string", required: true },
      },
      handler: async (args) => {
        assertSafePath(args.path);
        await fs.appendFile(args.path, args.content, "utf8");
        return "OK";
      },
    });
    this.registerTool({
      name: "move_file",
      description: "Move/rename a file.",
      parameters: {
        src: { type: "string", required: true },
        dest: { type: "string", required: true },
      },
      handler: async (args) => {
        assertSafePath(args.src);
        assertSafePath(args.dest);
        await fs.rename(args.src, args.dest);
        return "OK";
      },
    });
    this.registerTool({
      name: "delete_file",
      description: "Delete a file.",
      parameters: { path: { type: "string", required: true } },
      handler: async (args) => {
        assertSafePath(args.path);
        await fs.unlink(args.path);
        return "OK";
      },
    });
    this.registerTool({
      name: "copy_file",
      description: "Copy file.",
      parameters: {
        src: { type: "string", required: true },
        dest: { type: "string", required: true },
      },
      handler: async (args) => {
        assertSafePath(args.src);
        assertSafePath(args.dest);
        await fs.copyFile(args.src, args.dest);
        return "OK";
      },
    });
    this.registerTool({
      name: "list_directory",
      description: "List dir entries (names and types).",
      parameters: { path: { type: "string", required: true } },
      handler: async (args) => {
        assertSafePath(args.path);
        const entries = await fs.readdir(args.path, { withFileTypes: true });
        return entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        }));
      },
    });
    this.registerTool({
      name: "stat_file",
      description: "Get file stats (size, mtime, etc).",
      parameters: { path: { type: "string", required: true } },
      handler: async (args) => {
        assertSafePath(args.path);
        return fs.stat(args.path);
      },
    });

    // ---- Process/Command Execution ----
    this.registerTool({
      name: "execute_command",
      description: "Run shell command and return stdout (sync).",
      parameters: {
        command: { type: "string", required: true },
        cwd: { type: "string", default: process.cwd() },
      },
      handler: async (args) => {
        if (!args.command) throw new Error("command required");
        return execSync(args.command, {
          cwd: args.cwd || process.cwd(),
          encoding: "utf8",
          timeout: 30000,
        });
      },
    });
    this.registerTool({
      name: "execute_python",
      description: "Run a Python script (code string) in temp file.",
      parameters: { code: { type: "string", required: true } },
      handler: async (args, ctx) => {
        const fname = path.join(ctx.workingDir, `temp_${Date.now()}.py`);
        await fs.writeFile(fname, args.code, "utf8");
        try {
          return execSync(`python "${fname}"`, {
            encoding: "utf8",
            timeout: 30000,
          });
        } finally {
          await fs.unlink(fname).catch(() => {});
        }
      },
    });
    this.registerTool({
      name: "execute_javascript",
      description: "Run a JS script (code string) in temp file.",
      parameters: { code: { type: "string", required: true } },
      handler: async (args, ctx) => {
        const fname = path.join(ctx.workingDir, `temp_${Date.now()}.js`);
        await fs.writeFile(fname, args.code, "utf8");
        try {
          return execSync(`node "${fname}"`, {
            encoding: "utf8",
            timeout: 30000,
          });
        } finally {
          await fs.unlink(fname).catch(() => {});
        }
      },
    });

    // ---- Network/Web ----
    this.registerTool({
      name: "fetch_url",
      description: "Fetch text of a URL (GET).",
      parameters: { url: { type: "string", required: true } },
      handler: async (args) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(args.url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.text();
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    this.registerTool({
      name: "download_file",
      description: "Download a file from URL to disk.",
      parameters: {
        url: { type: "string", required: true },
        dest: { type: "string", required: true },
      },
      handler: async (args) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const res = await fetch(args.url, { signal: controller.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(args.dest, buf);
          return "OK";
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    this.registerTool({
      name: "upload_file",
      description: "Upload file to a URL (POST, raw body).",
      parameters: {
        path: { type: "string", required: true },
        url: { type: "string", required: true },
      },
      handler: async (args) => {
        assertSafePath(args.path);
        const data = await fs.readFile(args.path);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const res = await fetch(args.url, {
            method: "POST",
            body: data,
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.text();
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    this.registerTool({
      name: "web_search",
      description: "DuckDuckGo web search (returns top links).",
      parameters: {
        query: { type: "string", required: true },
        limit: { type: "number", default: 5 },
      },
      handler: async (args) => {
        const q = encodeURIComponent(args.query);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const html = await (
            await fetch(`https://html.duckduckgo.com/html/?q=${q}`, {
              signal: controller.signal,
            })
          ).text();
          const links = Array.from(
            html.matchAll(
              /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/g,
            ),
          ).map((x) => x[1]);
          return links.slice(0, args.limit || 5);
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    this.registerTool({
      name: "scrape_text",
      description: "Scrape visible text from a page. Optionally with selector.",
      parameters: {
        url: { type: "string", required: true },
        selector: { type: "string" },
      },
      handler: async (args) => {
        // cheerio is now imported at the top
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const html = await (
            await fetch(args.url, { signal: controller.signal })
          ).text();
          const $ = cheerio.load(html);
          return args.selector ? $(args.selector).text() : $("body").text();
        } finally {
          clearTimeout(timeout);
        }
      },
    });
    this.registerTool({
      name: "scrape_links",
      description: "Scrape all links from a page.",
      parameters: { url: { type: "string", required: true } },
      handler: async (args) => {
        // cheerio is now imported at the top
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const html = await (
            await fetch(args.url, { signal: controller.signal })
          ).text();
          const $ = cheerio.load(html);
          return $("a[href]")
            .map((_: any, e: any) => $(e).attr("href"))
            .get();
        } finally {
          clearTimeout(timeout);
        }
      },
    });

    // ---- Clipboard ----
    this.registerTool({
      name: "clipboard_read",
      description: "Read clipboard (text only).",
      parameters: {},
      handler: async () => {
        if (process.platform === "win32")
          return execSync("powershell Get-Clipboard", { encoding: "utf8" });
        if (process.platform === "darwin")
          return execSync("pbpaste", { encoding: "utf8" });
        return execSync("xclip -selection clipboard -o", { encoding: "utf8" });
      },
    });
    this.registerTool({
      name: "clipboard_write",
      description: "Write text to clipboard.",
      parameters: { content: { type: "string", required: true } },
      handler: async (args) => {
        if (process.platform === "win32")
          execSync(`echo "${args.content.replace(/"/g, '\\"')}" | clip`);
        else if (process.platform === "darwin")
          execSync(`echo "${args.content.replace(/"/g, '\\"')}" | pbcopy`);
        else
          execSync(
            `echo "${args.content.replace(/"/g, '\\"')}" | xclip -selection clipboard`,
          );
        return "OK";
      },
    });

    // ---- Window/Desktop Automation ----
    this.registerTool({
      name: "desktop_screenshot",
      description: "Take a screenshot of the desktop (Win only, to file).",
      parameters: { path: { type: "string", default: "screenshot.png" } },
      handler: async (args) => {
        if (process.platform === "win32") {
          const target = args.path || "screenshot.png";
          execSync(
            `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bmp); $graphics.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save('${target}'); $graphics.Dispose(); $bmp.Dispose();"`,
          );
          return target;
        }
        throw new Error("Screenshot only implemented for Windows");
      },
    });
    this.registerTool({
      name: "list_windows",
      description: "List open windows (Win only).",
      parameters: {},
      handler: async () => {
        if (process.platform === "win32") {
          const out = execSync(
            'powershell "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object MainWindowTitle"',
            { encoding: "utf8" },
          );
          return out
            .split("\n")
            .map((x) => x.trim())
            .filter((x) => x && x !== "MainWindowTitle");
        }
        throw new Error("Window listing not implemented for this OS");
      },
    });
    this.registerTool({
      name: "focus_window",
      description: "Focus a window by title (Win only).",
      parameters: { title: { type: "string", required: true } },
      handler: async (args) => {
        if (process.platform === "win32") {
          const ps = `
            $win = Get-Process | Where-Object { $_.MainWindowTitle -like "*${args.title}*" } | Select-Object -First 1;
            if ($win) { $sig = '[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr hWnd);'; Add-Type -MemberDefinition $sig -Name Win32 -Namespace PInvoke; [PInvoke.Win32]::SetForegroundWindow($win.MainWindowHandle) }
          `;
          execSync(`powershell -command "${ps}"`);
          return `Focused window matching: ${args.title}`;
        }
        throw new Error("Focus window only for Windows");
      },
    });

    // ---- System Info & Status ----
    this.registerTool({
      name: "get_system_info",
      description: "Get system/platform/version info.",
      parameters: {},
      handler: async () => ({
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      }),
    });
    this.registerTool({
      name: "status",
      description: "Get comprehensive system status and health metrics.",
      parameters: {},
      handler: async () => {
        return await getStatus();
      },
    });
    this.registerTool({
      name: "get_env_var",
      description: "Get an environment variable.",
      parameters: { name: { type: "string", required: true } },
      handler: async (args) => process.env[args.name] || "",
    });
    this.registerTool({
      name: "set_env_var",
      description: "Set an environment variable (for this process).",
      parameters: {
        name: { type: "string", required: true },
        value: { type: "string", required: true },
      },
      handler: async (args) => {
        process.env[args.name] = args.value;
        return "OK";
      },
    });
    this.registerTool({
      name: "list_env_vars",
      description: "List all env vars.",
      parameters: {},
      handler: async () => process.env,
    });
    this.registerTool({
      name: "get_time",
      description: "Get current system time.",
      parameters: {},
      handler: async () => new Date().toISOString(),
    });
    this.registerTool({
      name: "sleep",
      description: "Wait for X ms (async).",
      parameters: { ms: { type: "number", required: true } },
      handler: async (args) => {
        await new Promise((r) => setTimeout(r, args.ms));
        return "OK";
      },
    });

    // ---- Memory & Knowledge Management ----
    this.registerTool({
      name: "add_memory",
      description:
        "Add a new memory with content, type, and optional metadata.",
      parameters: {
        content: { type: "string", required: true },
        type: { type: "string", required: true }, // conversation|document|goal|reminder|journal|note|task
        metadata: { type: "object" },
      },
      handler: async (args) => {
        const validTypes = [
          "conversation",
          "document",
          "goal",
          "reminder",
          "journal",
          "note",
          "task",
        ];
        if (!validTypes.includes(args.type)) {
          throw new Error(
            `Invalid memory type. Valid types: ${validTypes.join(", ")}`,
          );
        }

        const memory = await memoryService.addMemory(
          args.content,
          args.type as MemoryType,
          args.metadata,
        );

        return {
          id: memory.id,
          content: memory.content,
          type: memory.type,
          timestamp: memory.timestamp,
          hasEmbedding:
            Array.isArray(memory.embedding) && memory.embedding.length > 0,
        };
      },
    });

    this.registerTool({
      name: "get_memory",
      description: "Get a specific memory by ID.",
      parameters: { id: { type: "string", required: true } },
      handler: async (args) => {
        const memory = await memoryService.getMemory(args.id);
        if (!memory) {
          throw new Error(`Memory not found: ${args.id}`);
        }

        return {
          id: memory.id,
          content: memory.content,
          type: memory.type,
          timestamp: memory.timestamp,
          metadata: memory.metadata,
          hasEmbedding:
            Array.isArray(memory.embedding) && memory.embedding.length > 0,
        };
      },
    });

    this.registerTool({
      name: "search_memory",
      description:
        "Search memories by content. Uses vector search if embeddings available.",
      parameters: {
        query: { type: "string", required: true },
        type: { type: "string" }, // Optional filter by memory type
        limit: { type: "number", default: 10 },
      },
      handler: async (args) => {
        const options = {
          type: args.type as MemoryType,
          limit: args.limit || 10,
        };

        const results = await memoryService.searchMemories(args.query, options);

        return results.map((result: any) => ({
          id: result.memory.id,
          content: result.memory.content,
          type: result.memory.type,
          timestamp: result.memory.timestamp,
          metadata: result.memory.metadata,
          similarity: result.similarity,
          relevanceScore: result.relevanceScore,
        }));
      },
    });

    this.registerTool({
      name: "list_memories",
      description: "List recent memories or memories by type.",
      parameters: {
        type: { type: "string" }, // Optional filter by type
        limit: { type: "number", default: 20 },
        offset: { type: "number", default: 0 },
      },
      handler: async (args) => {
        const limit = args.limit || 20;
        const offset = args.offset || 0;

        let memories;
        if (args.type) {
          memories = await memoryService.getMemoriesByType(
            args.type as MemoryType,
            limit,
            offset,
          );
        } else {
          memories = await memoryService.getRecentMemories(limit, offset);
        }

        return memories.map((memory: any) => ({
          id: memory.id,
          content:
            memory.content.length > 200
              ? memory.content.substring(0, 200) + "..."
              : memory.content,
          type: memory.type,
          timestamp: memory.timestamp,
          hasEmbedding:
            Array.isArray(memory.embedding) && memory.embedding.length > 0,
        }));
      },
    });

    this.registerTool({
      name: "update_memory",
      description: "Update an existing memory.",
      parameters: {
        id: { type: "string", required: true },
        content: { type: "string" },
        type: { type: "string" },
        metadata: { type: "object" },
      },
      handler: async (args) => {
        const updates: any = {};
        if (args.content) updates.content = args.content;
        if (args.type) updates.type = args.type;
        if (args.metadata) updates.metadata = args.metadata;

        const memory = await memoryService.updateMemory(args.id, updates);
        if (!memory) {
          throw new Error(`Memory not found: ${args.id}`);
        }

        return {
          id: memory.id,
          content: memory.content,
          type: memory.type,
          timestamp: memory.timestamp,
          metadata: memory.metadata,
          hasEmbedding:
            Array.isArray(memory.embedding) && memory.embedding.length > 0,
        };
      },
    });

    this.registerTool({
      name: "delete_memory",
      description: "Delete a memory by ID.",
      parameters: { id: { type: "string", required: true } },
      handler: async (args) => {
        const deleted = await memoryService.deleteMemory(args.id);
        if (!deleted) {
          throw new Error(`Memory not found: ${args.id}`);
        }
        return { deleted: true, id: args.id };
      },
    });

    this.registerTool({
      name: "memory_stats",
      description: "Get memory system statistics.",
      parameters: {},
      handler: async () => {
        return await memoryService.getStats();
      },
    });

    this.registerTool({
      name: "find_similar_memories",
      description:
        "Find memories similar to given content using vector search.",
      parameters: {
        content: { type: "string", required: true },
        limit: { type: "number", default: 5 },
      },
      handler: async (args) => {
        const results = await memoryService.findSimilarMemories(args.content, {
          limit: args.limit || 5,
        });

        return results.map((result: any) => ({
          id: result.memory.id,
          content: result.memory.content,
          type: result.memory.type,
          timestamp: result.memory.timestamp,
          similarity: result.similarity,
        }));
      },
    });

    // ---- Goal Management ----
    this.registerTool({
      name: "add_goal",
      description: "Add a new task or goal with optional due date.",
      parameters: {
        task: { type: "string", required: true },
        due: { type: "string" }, // ISO date string
      },
      handler: async (args) => {
        const newTask = this.goalManager.addTask(args.task, args.due);
        return {
          success: true,
          task: newTask,
          message: `Goal added: ${args.task}${args.due ? ` (due: ${args.due})` : ""}`,
        };
      },
    });

    this.registerTool({
      name: "list_goals",
      description: "List all active (incomplete) goals/tasks.",
      parameters: {},
      handler: async () => {
        const tasks = this.goalManager.getTasks();
        return {
          totalTasks: tasks.length,
          tasks: tasks.map((t) => ({
            task: t.task,
            due: t.due,
            created: new Date(t.created).toISOString(),
            overdue: t.due ? Date.parse(t.due) < Date.now() : false,
          })),
        };
      },
    });

    this.registerTool({
      name: "complete_goal",
      description: "Mark a goal/task as completed.",
      parameters: { task: { type: "string", required: true } },
      handler: async (args) => {
        const success = this.goalManager.markTaskDone(args.task);
        return {
          success,
          message: success
            ? `Goal completed: ${args.task}`
            : `Goal not found: ${args.task}`,
        };
      },
    });

    // ---- Reminder Management ----
    this.registerTool({
      name: "set_reminder",
      description: "Set a reminder for a specific time.",
      parameters: {
        message: { type: "string", required: true },
        time: { type: "string", required: true }, // ISO date string
      },
      handler: async (args) => {
        const result = this.reminderManager.addReminder(
          args.message,
          args.time,
        );
        return {
          success: result.scheduled,
          message: result.scheduled
            ? `Reminder set for ${args.time}: ${args.message}`
            : `Failed to set reminder: ${result.error}`,
          error: result.error,
        };
      },
    });

    this.registerTool({
      name: "list_reminders",
      description: "List all active (unfired) reminders.",
      parameters: {},
      handler: async () => {
        const reminders = this.reminderManager.getReminders();
        return {
          totalReminders: reminders.length,
          reminders: reminders.map((r) => ({
            message: r.message,
            scheduledTime: r.time,
            fireAt: new Date(r.fireAt).toISOString(),
            minutesUntil: Math.round((r.fireAt - Date.now()) / 60000),
          })),
        };
      },
    });

    // ---- Scheduling/Automation ----
    this.registerTool({
      name: "set_timeout",
      description: "Set a timeout and call back after ms.",
      parameters: { ms: { type: "number", required: true } },
      handler: async (args) => {
        setTimeout(() => {}, args.ms);
        return "OK";
      },
    });
    this.registerTool({
      name: "set_interval",
      description: "Set interval callback (dummy in CLI context).",
      parameters: { ms: { type: "number", required: true } },
      handler: async (args) => {
        setInterval(() => {}, args.ms);
        return "OK";
      },
    });
    this.registerTool({
      name: "cancel_task",
      description: "Cancel a scheduled task (stub).",
      parameters: { id: { type: "string", required: true } },
      handler: async (_args) => {
        /* implement if you wire up timers */ return "OK";
      },
    });
  }
}
