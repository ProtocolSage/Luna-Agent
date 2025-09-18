/**
 * Enhanced Tool Executor - Integrates the comprehensive ToolExecutive system
 * This replaces the basic toolExecutor with full ToolPipeline integration
 */

import { ToolExecutive, ToolStep, ToolResult } from '@agent/tools/executive';
import { ToolPipeline, PipelineContext, PipelineResult, PipelineRequest, PipelineService } from './simplifiedPipeline';
import { ModelRouter } from '@agent/orchestrator/modelRouter';
import { ModelConfig } from '../../types';
import { getDB } from './sqlite';
import { randomUUID } from 'crypto';

// Singleton instances
let toolExecutive: ToolExecutive | null = null;
let toolPipeline: ToolPipeline | null = null;
let pipelineService: PipelineService | null = null;
let modelRouter: ModelRouter | null = null;

/**
 * Initialize the enhanced tool system
 */
export function initializeToolSystem(router?: ModelRouter): void {
  console.log('🔧 Initializing Enhanced Tool System...');
  
  try {
    // Initialize ModelRouter if not provided
    if (!modelRouter) {
      // Create default model configurations
      const defaultModels: ModelConfig[] = [];
      
      // Add OpenAI model if API key is available
      if (process.env.OPENAI_API_KEY) {
        defaultModels.push({
          name: 'gpt-4o-2024-08-06',
          provider: 'openai',
          temperature: 0.7,
          maxTokens: 2000,
          costPer1kTokensIn: 0.0025,
          costPer1kTokensOut: 0.01
        });
      }
      
      // Add Anthropic model if API key is available
      if (process.env.ANTHROPIC_API_KEY) {
        defaultModels.push({
          name: 'claude-3-sonnet-20240229',
          provider: 'anthropic',
          temperature: 0.7,
          maxTokens: 2000,
          costPer1kTokensIn: 0.003,
          costPer1kTokensOut: 0.015
        });
      }

      // Fallback to basic configuration if no API keys
      if (defaultModels.length === 0) {
        console.warn('⚠️ No API keys found, using basic model configuration');
        defaultModels.push({
          name: 'gpt-4o-2024-08-06',
          provider: 'openai',
          temperature: 0.7,
          maxTokens: 2000,
          costPer1kTokensIn: 0.0025,
          costPer1kTokensOut: 0.01
        });
      }
      
      modelRouter = router || new ModelRouter(defaultModels);
    }

    // Initialize ToolExecutive with comprehensive tool set
    toolExecutive = new ToolExecutive({
      allowlist: [
        'read_file', 'write_file', 'list_directory', 'stat_file',
        'fetch_url', 'web_search', 'scrape_text', 'scrape_links',
        'get_system_info', 'get_time', 'status',
        'add_memory', 'search_memory', 'list_memories',
        'add_goal', 'list_goals', 'complete_goal',
        'set_reminder', 'list_reminders'
      ]
    });

    // Initialize ToolPipeline for orchestrated execution
    toolPipeline = new ToolPipeline(toolExecutive, modelRouter, {
      maxSteps: 10,
      timeoutMs: 300000, // 5 minutes
      allowParallel: true,
      retryCount: 2,
      validateResults: true,
      logExecution: true
    });

    // Initialize PipelineService for advanced management
    pipelineService = new PipelineService(toolExecutive, modelRouter, {
      maxConcurrentExecutions: 5,
      defaultTimeout: 300000,
      enableMetrics: true,
      autoCleanupInterval: 3600000 // 1 hour
    });

    console.log('✅ Enhanced Tool System initialized successfully');
    console.log(`🛠️  Available tools: ${toolExecutive.getToolDefinitions().length}`);
    
  } catch (error) {
    console.error('❌ Failed to initialize Enhanced Tool System:', error);
    throw error;
  }
}

/**
 * Get the ToolExecutive instance (creates if needed)
 */
export function getToolExecutive(): ToolExecutive {
  if (!toolExecutive) {
    console.log('⚠️  ToolExecutive not initialized, creating with defaults...');
    toolExecutive = new ToolExecutive({ allowlist: [] });
  }
  return toolExecutive!;
}

/**
 * Get the ToolPipeline instance (creates if needed)  
 */
export function getToolPipeline(): ToolPipeline {
  if (!toolPipeline) {
    console.log('⚠️  ToolPipeline not initialized, creating with defaults...');
    initializeToolSystem();
  }
  return toolPipeline!;
}

/**
 * Get the PipelineService instance (creates if needed)
 */
export function getPipelineService(): PipelineService {
  if (!pipelineService) {
    console.log('⚠️  PipelineService not initialized, creating with defaults...');
    initializeToolSystem();
  }
  return pipelineService!;
}

/**
 * Execute a single tool directly (backward compatibility)
 */
export async function executeTool(
  toolName: string, 
  input: any, 
  sessionId?: string
): Promise<{ ok: boolean; id: string; output?: any; error?: string }> {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  const db = getDB();

  try {
    const executive = getToolExecutive();
    
    // Create tool step
    const step: ToolStep = {
      tool: toolName,
      args: input || {}
    };

    // Execute using ToolExecutive
    const results = await executive.executePlan([step], `trace_${id}`);
    const result = results[0];

    if (!result) {
      throw new Error('No result returned from tool execution');
    }

    // Log to database
    db.prepare(`
      INSERT INTO tool_audit (id, tool, input, output, error, created_at, sessionId)
      VALUES (@id, @tool, @input, @output, @error, @timestamp, @sessionId)
    `).run({
      id,
      tool: toolName,
      input: JSON.stringify(input || {}),
      output: result.success ? JSON.stringify(result.output || {}) : null,
      error: result.success ? null : result.error,
      timestamp,
      sessionId: sessionId || null
    });

    if (result.success) {
      return { ok: true, id, output: result.output };
    } else {
      return { ok: false, id, error: result.error };
    }

  } catch (error: any) {
    const errorMessage = error.message || String(error);
    
    // Log error to database
    db.prepare(`
      INSERT INTO tool_audit (id, tool, input, output, error, created_at, sessionId)
      VALUES (@id, @tool, @input, NULL, @error, @timestamp, @sessionId)
    `).run({
      id,
      tool: toolName,
      input: JSON.stringify(input || {}),
      error: errorMessage,
      timestamp,
      sessionId: sessionId || null
    });

    return { ok: false, id, error: errorMessage };
  }
}

/**
 * Execute multiple tools with orchestration (advanced usage)
 */
export async function executeToolPlan(
  userRequest: string,
  sessionId: string,
  options: {
    allowUnsafeTools?: boolean;
    maxSteps?: number;
    timeout?: number;
  } = {}
): Promise<{ ok: boolean; id: string; result?: PipelineResult; error?: string }> {
  const id = randomUUID();
  
  try {
    const pipeline = getToolPipeline();
    
    const context: PipelineContext = {
      sessionId,
      traceId: id,
      userId: sessionId,
      metadata: { 
        requestId: id,
        userRequest,
        timestamp: new Date().toISOString()
      },
      constraints: options.allowUnsafeTools ? ['allow_unsafe_tools'] : [],
      workingDir: process.cwd()
    };

    // Execute with orchestration for AI-driven planning
    const result = await pipeline.executeWithOrchestration(userRequest, id, context);

    return { ok: result.success, id, result };

  } catch (error: any) {
    console.error('executeToolPlan error:', error);
    return { ok: false, id, error: error.message || String(error) };
  }
}

/**
 * Submit a request to the pipeline service (queue-based execution)
 */
export async function submitPipelineRequest(
  userRequest: string,
  sessionId: string,
  options: {
    priority?: 'low' | 'normal' | 'high';
    waitForCompletion?: boolean;
    allowUnsafeTools?: boolean;
  } = {}
): Promise<{ ok: boolean; executionId?: string; result?: PipelineResult; error?: string }> {
  try {
    const service = getPipelineService();
    
    const context: Partial<PipelineContext> = {
      sessionId,
      userId: sessionId,
      metadata: { 
        userRequest,
        timestamp: new Date().toISOString()
      },
      constraints: options.allowUnsafeTools ? ['allow_unsafe_tools'] : [],
      workingDir: process.cwd()
    };

    const request: PipelineRequest = {
      sessionId,
      prompt: userRequest,
      context
    };
    const result = await service.submitRequest(request, undefined, {
      priority: options.priority || 'normal',
      waitForCompletion: options.waitForCompletion || false
    });

    if (typeof result === 'string') {
      // Execution ID returned (async mode)
      return { ok: true, executionId: result };
    } else {
      // PipelineResult returned (sync mode)
      return { ok: result.success, result };
    }

  } catch (error: any) {
    console.error('submitPipelineRequest error:', error);
    return { ok: false, error: error.message || String(error) };
  }
}

/**
 * Get available tools list
 */
export function getAvailableTools(): Array<{name: string; description: string; parameters: any}> {
  const executive = getToolExecutive();
  return executive.getToolDefinitions().map((tool: any) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

/**
 * Get tool execution metrics
 */
export function getToolMetrics() {
  try {
    const service = getPipelineService();
    return service.getMetrics();
  } catch (error) {
    console.error('getToolMetrics error:', error);
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      toolUsageStats: {},
      activeExecutions: 0
    };
  }
}

/**
 * Graceful shutdown
 */
export async function shutdownToolSystem(): Promise<void> {
  console.log('🔧 Shutting down Enhanced Tool System...');
  
  try {
    if (pipelineService) {
      await pipelineService.shutdown();
    }
    console.log('✅ Enhanced Tool System shutdown complete');
  } catch (error) {
    console.error('❌ Error during tool system shutdown:', error);
  }
}
