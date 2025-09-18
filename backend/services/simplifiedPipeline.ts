/**
 * Simplified Pipeline Implementation
 * Compatible with our self-contained ToolExecutive
 */

import { ToolExecutive, ToolStep, ToolResult } from '@agent/tools/executive';
import { ModelRouter } from '@agent/orchestrator/modelRouter';

export interface PipelineContext {
  sessionId: string;
  userId?: string;
  maxSteps?: number;
  timeoutMs?: number;
  allowParallel?: boolean;
  retryCount?: number;
  validateResults?: boolean;
  logExecution?: boolean;
  traceId?: string;
  metadata?: Record<string, any>;
  /**
   * Optional execution constraints.
   */
  constraints?: string[];
  /**
   * Working directory for tool execution.
   */
  workingDir?: string;
}

export interface PipelineResult {
  success: boolean;
  steps: ToolResult[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface PipelineRequest {
  sessionId: string;
  prompt?: string;
  steps?: ToolStep[];
  context?: Record<string, any>;
  priority?: 'high' | 'normal' | 'low';
}

/**
 * Simplified ToolPipeline for orchestrated execution
 */
export class ToolPipeline {
  private options: PipelineContext;
  
  constructor(
    private toolExecutive: ToolExecutive,
    private modelRouter: ModelRouter | null,
    options: Partial<PipelineContext> = {}
  ) {
    this.options = {
      sessionId: options.sessionId || 'default',
      maxSteps: options.maxSteps || 10,
      timeoutMs: options.timeoutMs || 300000,
      allowParallel: options.allowParallel || false,
      retryCount: options.retryCount || 2,
      validateResults: options.validateResults || true,
      logExecution: options.logExecution || true,
      ...options
    };
  }

  async execute(steps: ToolStep[], sessionId: string, context?: Partial<PipelineContext>): Promise<PipelineResult> {
    const traceId = context?.traceId || `pipeline_${sessionId}_${Date.now()}`;
    
    try {
      const results = await this.toolExecutive.executePlan(steps, traceId);
      
      return {
        success: results.every((r: ToolResult) => r.success),
        steps: results,
        metadata: {
          traceId,
          executedAt: new Date().toISOString(),
          totalSteps: steps.length
        }
      };
    } catch (error: any) {
      return {
        success: false,
        steps: [],
        error: error.message || 'Pipeline execution failed'
      };
    }
  }

  async executeWithOrchestration(prompt: string, sessionId: string, context?: Partial<PipelineContext>): Promise<PipelineResult> {
    // Simplified orchestration - just execute any provided steps
    // In a real implementation, this would use the model router to generate steps
    return this.execute([], sessionId, context);
  }
}

/**
 * Simplified PipelineService for queue management
 */
export class PipelineService {
  private executions: Map<string, PipelineResult> = new Map();
  
  constructor(
    private toolExecutive: ToolExecutive,
    private modelRouter: ModelRouter | null,
    private options: any
  ) {}

  async submitRequest(request: PipelineRequest, sessionId?: string, options?: any): Promise<PipelineResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const finalSessionId = sessionId || request.sessionId;
    
    // Execute immediately in simplified version
    const traceId = `service_${finalSessionId}_${Date.now()}`;
    const steps = request.steps || [];
    
    try {
      const results = await this.toolExecutive.executePlan(steps, traceId);
      
      const pipelineResult: PipelineResult = {
        success: results.every((r: ToolResult) => r.success),
        steps: results,
        metadata: {
          executionId,
          sessionId: finalSessionId,
          priority: request.priority || 'normal'
        }
      };
      
      this.executions.set(executionId, pipelineResult);
      return pipelineResult;
    } catch (error: any) {
      const errorResult: PipelineResult = {
        success: false,
        steps: [],
        error: error.message
      };
      
      this.executions.set(executionId, errorResult);
      return errorResult;
    }
  }

  getExecution(executionId: string): PipelineResult | undefined {
    return this.executions.get(executionId);
  }

  // Alias for compatibility
  getExecutionResult(executionId: string): PipelineResult | undefined {
    return this.getExecution(executionId);
  }

  // Alias for compatibility  
  getExecutionStatus(executionId: string): { status: string; result?: PipelineResult } | undefined {
    const result = this.getExecution(executionId);
    if (!result) return undefined;
    
    return {
      status: result.success ? 'completed' : 'failed',
      result
    };
  }

  getQueueStatus(): any {
    return {
      queueSize: 0,
      activeExecutions: this.executions.size,
      totalProcessed: this.executions.size
    };
  }

  cancelExecution(executionId: string): boolean {
    return this.executions.delete(executionId);
  }

  getMetrics(): any {
    return {
      activeExecutions: this.executions.size,
      totalProcessed: this.executions.size,
      queueSize: 0
    };
  }

  async shutdown(): Promise<void> {
    this.executions.clear();
  }
}
