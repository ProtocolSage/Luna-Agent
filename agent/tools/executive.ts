import { PolicyConfig } from '../../types/TaskProfile';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

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
  requiresMFA?: boolean;
  allowedScopes?: string[];
}

export interface ToolContext {
  traceId: string;
  sessionId: string;
  workingDir: string;
  allowlist: string[];
  rateLimits: Map<string, { count: number; resetTime: number }>;
}

export class ToolExecutive {
  private policy: PolicyConfig;
  private tools: Map<string, ToolDefinition>;
  private activeProcesses: Map<string, ChildProcess>;
  private rateLimitCounters: Map<string, { count: number; resetTime: number }>;

  constructor(policy: PolicyConfig) {
    this.policy = policy;
    this.tools = new Map();
    this.activeProcesses = new Map();
    this.rateLimitCounters = new Map();
    
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    // File system operations
    this.registerTool({
      name: 'read_file',
      description: 'Read contents of a file',
      parameters: {
        path: { type: 'string', required: true },
        encoding: { type: 'string', default: 'utf8' }
      },
      handler: this.handleReadFile.bind(this)
    });

    this.registerTool({
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        path: { type: 'string', required: true },
        content: { type: 'string', required: true },
        encoding: { type: 'string', default: 'utf8' }
      },
      handler: this.handleWriteFile.bind(this),
      requiresMFA: true,
      allowedScopes: ['file_write']
    });

    // Code execution
    this.registerTool({
      name: 'execute_code',
      description: 'Execute code in a sandboxed environment',
      parameters: {
        language: { type: 'string', required: true },
        code: { type: 'string', required: true },
        timeout: { type: 'number', default: 30000 }
      },
      handler: this.handleExecuteCode.bind(this)
    });

    // Web requests
    this.registerTool({
      name: 'fetch_url',
      description: 'Fetch content from a URL',
      parameters: {
        url: { type: 'string', required: true },
        method: { type: 'string', default: 'GET' },
        headers: { type: 'object', default: {} }
      },
      handler: this.handleFetchUrl.bind(this)
    });

    // Process management
    this.registerTool({
      name: 'kill_process',
      description: 'Terminate a running process',
      parameters: {
        processId: { type: 'string', required: true }
      },
      handler: this.handleKillProcess.bind(this),
      requiresMFA: true,
      allowedScopes: ['process_kill']
    });
  }

  registerTool(definition: ToolDefinition): void {
    this.tools.set(definition.name, definition);
  }

  async executePlan(steps: ToolStep[], traceId: string): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const context: ToolContext = {
      traceId,
      sessionId: traceId.split('_')[1] || 'unknown',
      workingDir: '/tmp/luna-sandbox',
      allowlist: this.policy.allowlist || [],
      rateLimits: this.rateLimitCounters
    };

    // Ensure sandbox directory exists
    await this.ensureSandboxDir(context.workingDir);

    for (const step of steps) {
      const startTime = Date.now();
      
      try {
        // Validate tool exists
        const tool = this.tools.get(step.tool);
        if (!tool) {
          results.push({
            tool: step.tool,
            success: false,
            error: `Unknown tool: ${step.tool}`,
            latencyMs: Date.now() - startTime
          });
          continue;
        }

        // Check rate limits
        if (this.isRateLimited(step.tool)) {
          results.push({
            tool: step.tool,
            success: false,
            error: 'Rate limit exceeded',
            latencyMs: Date.now() - startTime
          });
          continue;
        }

        // Check MFA requirement
        if (tool.requiresMFA && !this.checkMFA(step.tool, step.args)) {
          results.push({
            tool: step.tool,
            success: false,
            error: 'MFA required for this operation',
            latencyMs: Date.now() - startTime
          });
          continue;
        }

        // Validate parameters
        const validationError = this.validateParameters(tool.parameters, step.args);
        if (validationError) {
          results.push({
            tool: step.tool,
            success: false,
            error: validationError,
            latencyMs: Date.now() - startTime
          });
          continue;
        }

        // Execute tool
        const output = await tool.handler(step.args, context);
        
        this.updateRateLimit(step.tool);
        
        results.push({
          tool: step.tool,
          success: true,
          output,
          latencyMs: Date.now() - startTime
        });

      } catch (error: any) {
        results.push({
          tool: step.tool,
          success: false,
          error: error?.message || 'Unknown error',
          latencyMs: Date.now() - startTime
        });
      }
    }

    return results;
  }

  private async handleReadFile(args: Record<string, any>, context: ToolContext): Promise<string> {
    const filePath = this.sanitizePath(args.path, context.workingDir);
    const content = await fs.readFile(filePath, args.encoding || 'utf8');
    return content.toString();
  }

  private async handleWriteFile(args: Record<string, any>, context: ToolContext): Promise<string> {
    const filePath = this.sanitizePath(args.path, context.workingDir);
    await fs.writeFile(filePath, args.content, args.encoding || 'utf8');
    return `File written: ${filePath}`;
  }

  private async handleExecuteCode(args: Record<string, any>, context: ToolContext): Promise<any> {
    const { language, code, timeout } = args;
    
    if (!['python', 'javascript', 'bash'].includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const scriptPath = path.join(context.workingDir, `script_${Date.now()}.${this.getExtension(language)}`);
    await fs.writeFile(scriptPath, code);

    const command = this.getExecutionCommand(language, scriptPath);
    
    return new Promise((resolve, reject) => {
      const process = spawn(command.cmd, command.args, {
        cwd: context.workingDir,
        timeout: timeout || 30000
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: code });
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });

      process.on('error', reject);
      
      // Store process for potential cleanup
      this.activeProcesses.set(context.traceId, process);
    });
  }

  private async handleFetchUrl(args: Record<string, any>, context: ToolContext): Promise<any> {
    const { url, method, headers } = args;
    
    // Check allowlist
    if (!this.isUrlAllowed(url, context.allowlist)) {
      throw new Error(`URL not in allowlist: ${url}`);
    }

    // Use fetch or similar HTTP client
    const response = await fetch(url, {
      method: method || 'GET',
      headers: headers || {}
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }

  private async handleKillProcess(args: Record<string, any>, context: ToolContext): Promise<string> {
    const { processId } = args;
    
    const process = this.activeProcesses.get(processId);
    if (!process) {
      throw new Error(`Process not found: ${processId}`);
    }

    process.kill('SIGTERM');
    this.activeProcesses.delete(processId);
    
    return `Process ${processId} terminated`;
  }

  private sanitizePath(inputPath: string, workingDir: string): string {
    // Prevent directory traversal
    const resolved = path.resolve(workingDir, inputPath);
    if (!resolved.startsWith(workingDir)) {
      throw new Error('Path outside working directory not allowed');
    }
    return resolved;
  }

  private isUrlAllowed(url: string, allowlist: string[]): boolean {
    try {
      const urlObj = new URL(url);
      const origin = `${urlObj.protocol}//${urlObj.hostname}`;
      return allowlist.some(allowed => origin.startsWith(allowed));
    } catch {
      return false;
    }
  }

  private getExtension(language: string): string {
    switch (language) {
      case 'python': return 'py';
      case 'javascript': return 'js';
      case 'bash': return 'sh';
      default: return 'txt';
    }
  }

  private getExecutionCommand(language: string, scriptPath: string): { cmd: string; args: string[] } {
    switch (language) {
      case 'python':
        return { cmd: 'python3', args: [scriptPath] };
      case 'javascript':
        return { cmd: 'node', args: [scriptPath] };
      case 'bash':
        return { cmd: 'bash', args: [scriptPath] };
      default:
        throw new Error(`No execution command for language: ${language}`);
    }
  }

  private validateParameters(schema: Record<string, any>, args: Record<string, any>): string | null {
    for (const [key, spec] of Object.entries(schema)) {
      if (spec.required && !(key in args)) {
        return `Missing required parameter: ${key}`;
      }
      
      if (key in args && spec.type && typeof args[key] !== spec.type) {
        return `Parameter ${key} must be of type ${spec.type}`;
      }
    }
    return null;
  }

  private isRateLimited(tool: string): boolean {
    const limit = this.rateLimitCounters.get(tool);
    if (!limit) return false;
    
    const now = Date.now();
    if (now > limit.resetTime) {
      this.rateLimitCounters.delete(tool);
      return false;
    }
    
    const rateLimits = this.policy.rateLimits || {
      requestsPerMinute: 60,
      tokensPerMinute: 10000,
      costPerMinute: 1.0
    };
    
    return limit.count >= (rateLimits.requestsPerMinute || 60);
  }

  private updateRateLimit(tool: string): void {
    const now = Date.now();
    const resetTime = now + 60000; // 1 minute
    
    const current = this.rateLimitCounters.get(tool);
    if (!current || now > current.resetTime) {
      this.rateLimitCounters.set(tool, { count: 1, resetTime });
    } else {
      current.count++;
    }
  }

  private checkMFA(tool: string, args: Record<string, any>): boolean {
    // Simplified MFA check - in practice this would integrate with actual MFA system
    return args._mfa_token === 'valid_token';
  }

  private async ensureSandboxDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testContext: ToolContext = {
        traceId: 'health_check',
        sessionId: 'health',
        workingDir: '/tmp/luna-health',
        allowlist: [],
        rateLimits: new Map()
      };

      await this.ensureSandboxDir(testContext.workingDir);
      return true;
    } catch {
      return false;
    }
  }

  cleanup(): void {
    // Kill all active processes
    for (const [id, process] of this.activeProcesses) {
      try {
        process.kill('SIGTERM');
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.activeProcesses.clear();
  }
}

