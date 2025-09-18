// Fixed tool execution with proper context passing
import { ToolExecutive } from '@agent/tools/executive';
import { ReasoningEngine } from '@agent/orchestrator/reasoningEngine';

export class ToolOrchestrator {
  private toolExecutive: ToolExecutive;
  private activeTools: Map<string, any> = new Map();

  constructor() {
    this.toolExecutive = new ToolExecutive();
    this.initializeTools();
  }

  private initializeTools() {
    // Register all available tools
    const tools = this.toolExecutive.getToolDefinitions();
    tools.forEach(tool => {
      this.activeTools.set(tool.name, tool);
      console.log(`Tool registered: ${tool.name}`);
    });
  }

  async executeToolRequest(toolName: string, args: any, sessionId: string) {
    try {
      const result = await this.toolExecutive.executePlan(
        [{ tool: toolName, args }],
        `${sessionId}_${Date.now()}`
      );
      return result[0];
    } catch (error: unknown) {
      console.error(`Tool execution failed for ${toolName}:`, error);
      return {
        tool: toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: 0
      };
    }
  }

  async processWithTools(message: string, context: any) {
    // Parse message for tool requests
    const toolPattern = /(?:use|run|execute|call)\s+(\w+)\s+(?:tool|function|command)?(?:\s+with\s+(.+))?/i;
    const match = message.match(toolPattern);

    if (match) {
      const [, toolName, argsString] = match;
      const args = this.parseArguments(argsString || '');
      
      const result = await this.executeToolRequest(
        toolName.toLowerCase(),
        args,
        context.sessionId
      );

      return {
        type: 'tool_result',
        tool: toolName,
        result: result,
        message: this.formatToolResult(result)
      };
    }

    // Check for implicit tool needs
    const implicitTools = this.detectImplicitTools(message);
    if (implicitTools.length > 0) {
      const results = [];
      for (const { tool, args } of implicitTools) {
        const result = await this.executeToolRequest(tool, args, context.sessionId);
        results.push(result);
      }
      return {
        type: 'tool_results',
        results,
        message: this.formatMultipleResults(results)
      };
    }

    return null;
  }

  private detectImplicitTools(message: string): Array<{tool: string, args: any}> {
    const tools = [];

    // File operations
    if (message.includes('read') && message.includes('file')) {
      const fileMatch = message.match(/["']([^"']+)["']/);
      if (fileMatch) {
        tools.push({ tool: 'read_file', args: { path: fileMatch[1] } });
      }
    }

    // Web search
    if (message.includes('search') || message.includes('look up') || message.includes('find information')) {
      const query = message.replace(/(search|look up|find information about)/i, '').trim();
      tools.push({ tool: 'search_web', args: { query } });
    }

    // Memory operations
    if (message.includes('remember')) {
      tools.push({ tool: 'remember', args: { content: message } });
    }

    if (message.includes('recall') || message.includes('what did I say about')) {
      const topic = message.replace(/(recall|what did I say about)/i, '').trim();
      tools.push({ tool: 'recall', args: { query: topic } });
    }

    return tools;
  }

  private parseArguments(argsString: string): any {
    if (!argsString) return {};

    try {
      // Try parsing as JSON first
      if (argsString.startsWith('{')) {
        return JSON.parse(argsString);
      }

      // Parse key=value pairs
      const args: any = {};
      const pairs = argsString.split(',').map(s => s.trim());
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          args[key.trim()] = valueParts.join('=').trim().replace(/["']/g, '');
        }
      }
      return args;
    } catch {
      // Fallback to simple string argument
      return { input: argsString };
    }
  }

  private formatToolResult(result: any): string {
    if (!result.success) {
      return `Tool execution failed: ${result.error}`;
    }

    const output = result.output;
    if (typeof output === 'string') {
      return output;
    } else if (Array.isArray(output)) {
      return output.map(item => 
        typeof item === 'object' ? JSON.stringify(item, null, 2) : item
      ).join('\n');
    } else if (typeof output === 'object') {
      return JSON.stringify(output, null, 2);
    }
    return String(output);
  }

  private formatMultipleResults(results: any[]): string {
    return results.map(r => this.formatToolResult(r)).join('\n\n');
  }

  getAvailableTools(): string[] {
    return Array.from(this.activeTools.keys());
  }

  getToolDescription(toolName: string): string {
    const tool = this.activeTools.get(toolName);
    return tool ? tool.description : 'Tool not found';
  }
}
