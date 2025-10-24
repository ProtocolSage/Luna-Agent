import {
  ToolPipeline,
  PipelineContext,
  PipelineResult,
  PipelineConfig,
} from "./ToolPipeline";
import { ToolExecutive } from "../tools/executive";
import { ModelRouter } from "../orchestrator/modelRouter";
import { EventEmitter } from "events";

export interface PipelineServiceConfig {
  maxConcurrentExecutions: number;
  defaultTimeout: number;
  enableMetrics: boolean;
  autoCleanupInterval: number;
}

export interface PipelineMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  toolUsageStats: Record<string, number>;
  activeExecutions: number;
}

export interface ExecutionRequest {
  id: string;
  request: string;
  context: PipelineContext;
  config?: Partial<PipelineConfig>;
  priority: "low" | "normal" | "high";
  createdAt: Date;
}

export class PipelineService extends EventEmitter {
  private pipeline: ToolPipeline;
  private config: PipelineServiceConfig;
  private executionQueue: ExecutionRequest[] = [];
  private activeExecutions: Map<string, Promise<PipelineResult>> = new Map();
  private executionHistory: Map<string, PipelineResult> = new Map();
  private metrics: PipelineMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    toolUsageStats: {},
    activeExecutions: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    executive: ToolExecutive,
    modelRouter: ModelRouter,
    config: Partial<PipelineServiceConfig> = {},
  ) {
    super();

    this.config = {
      maxConcurrentExecutions: 5,
      defaultTimeout: 300000, // 5 minutes
      enableMetrics: true,
      autoCleanupInterval: 3600000, // 1 hour
      ...config,
    };

    this.pipeline = new ToolPipeline(executive, modelRouter, {
      timeoutMs: this.config.defaultTimeout,
    });

    this.startCleanupTimer();
  }

  /**
   * Submit a request for pipeline execution
   */
  async submitRequest(
    request: string,
    context: Partial<PipelineContext> = {},
    options: {
      priority?: "low" | "normal" | "high";
      config?: Partial<PipelineConfig>;
      waitForCompletion?: boolean;
    } = {},
  ): Promise<string | PipelineResult> {
    const executionId = this.generateExecutionId();

    const fullContext: PipelineContext = {
      sessionId: context.sessionId || "default",
      traceId: context.traceId || executionId,
      userId: context.userId,
      metadata: context.metadata || {},
      constraints: context.constraints || [],
      workingDir: context.workingDir || process.cwd(),
      ...context,
    };

    const executionRequest: ExecutionRequest = {
      id: executionId,
      request,
      context: fullContext,
      config: options.config,
      priority: options.priority || "normal",
      createdAt: new Date(),
    };

    // Add to queue
    this.addToQueue(executionRequest);

    // Emit queued event
    this.emit("requestQueued", {
      id: executionId,
      request,
      queuePosition: this.executionQueue.length,
    });

    // Process queue
    this.processQueue();

    if (options.waitForCompletion) {
      return await this.waitForExecution(executionId);
    }

    return executionId;
  }

  /**
   * Get the result of a specific execution
   */
  async getExecutionResult(
    executionId: string,
  ): Promise<PipelineResult | null> {
    // Check if still active
    const activePromise = this.activeExecutions.get(executionId);
    if (activePromise) {
      return await activePromise;
    }

    // Check history
    return this.executionHistory.get(executionId) || null;
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(
    executionId: string,
  ): "queued" | "active" | "completed" | "not_found" {
    if (this.activeExecutions.has(executionId)) {
      return "active";
    }

    if (this.executionHistory.has(executionId)) {
      return "completed";
    }

    if (this.executionQueue.some((req) => req.id === executionId)) {
      return "queued";
    }

    return "not_found";
  }

  /**
   * Cancel a queued or active execution
   */
  cancelExecution(executionId: string): boolean {
    // Remove from queue if queued
    const queueIndex = this.executionQueue.findIndex(
      (req) => req.id === executionId,
    );
    if (queueIndex >= 0) {
      this.executionQueue.splice(queueIndex, 1);
      this.emit("requestCancelled", {
        id: executionId,
        reason: "cancelled_from_queue",
      });
      return true;
    }

    // Abort if active
    if (this.activeExecutions.has(executionId)) {
      this.pipeline.abortExecution(executionId);
      this.emit("requestCancelled", {
        id: executionId,
        reason: "aborted_during_execution",
      });
      return true;
    }

    return false;
  }

  /**
   * Get current metrics
   */
  getMetrics(): PipelineMetrics {
    return {
      ...this.metrics,
      activeExecutions: this.activeExecutions.size,
    };
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    activeExecutions: number;
    nextExecution?: ExecutionRequest;
  } {
    return {
      queueLength: this.executionQueue.length,
      activeExecutions: this.activeExecutions.size,
      nextExecution: this.executionQueue[0],
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(olderThan?: Date): number {
    let cleared = 0;

    if (olderThan) {
      // Clear based on age - would need to track creation time
      // For now, clear all
      cleared = this.executionHistory.size;
      this.executionHistory.clear();
    } else {
      cleared = this.executionHistory.size;
      this.executionHistory.clear();
    }

    this.emit("historyCleaned", { clearedCount: cleared });
    return cleared;
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(timeout = 30000): Promise<void> {
    console.log("Pipeline service shutting down...");

    // Clear cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Wait for active executions to complete or timeout
    const activePromises = Array.from(this.activeExecutions.values());

    if (activePromises.length > 0) {
      console.log(
        `Waiting for ${activePromises.length} active executions to complete...`,
      );

      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(resolve, timeout);
      });

      try {
        await Promise.race([Promise.all(activePromises), timeoutPromise]);
      } catch (error) {
        console.warn("Some executions did not complete during shutdown");
      }
    }

    // Clear remaining state
    this.executionQueue.length = 0;
    this.activeExecutions.clear();

    this.emit("shutdown");
    console.log("Pipeline service shutdown complete");
  }

  /**
   * Private methods
   */

  private addToQueue(request: ExecutionRequest): void {
    // Insert based on priority
    const insertIndex = this.findInsertPosition(request.priority);
    this.executionQueue.splice(insertIndex, 0, request);
  }

  private findInsertPosition(priority: "low" | "normal" | "high"): number {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    const requestPriority = priorityOrder[priority];

    for (let i = 0; i < this.executionQueue.length; i++) {
      const queuePriority = priorityOrder[this.executionQueue[i].priority];
      if (requestPriority > queuePriority) {
        return i;
      }
    }

    return this.executionQueue.length;
  }

  private async processQueue(): Promise<void> {
    while (
      this.executionQueue.length > 0 &&
      this.activeExecutions.size < this.config.maxConcurrentExecutions
    ) {
      const request = this.executionQueue.shift()!;
      this.executeRequest(request);
    }
  }

  private async executeRequest(request: ExecutionRequest): Promise<void> {
    const startTime = Date.now();

    const executionPromise = this.pipeline.execute(
      request.request,
      request.context,
      {
        autoPlanning: true,
        allowUnsafeTools:
          request.context.constraints.includes("allow_unsafe_tools"),
      },
    );

    // Add to active executions
    this.activeExecutions.set(request.id, executionPromise);

    this.emit("executionStarted", {
      id: request.id,
      request: request.request,
      startTime: new Date(startTime),
    });

    try {
      const result = await executionPromise;

      // Update metrics
      this.updateMetrics(result, Date.now() - startTime);

      // Store in history
      this.executionHistory.set(request.id, result);

      this.emit("executionCompleted", {
        id: request.id,
        result,
        executionTime: Date.now() - startTime,
      });
    } catch (error: any) {
      const errorResult: PipelineResult = {
        success: false,
        steps: [],
        totalTimeMs: Date.now() - startTime,
        finalOutput: null,
        error: error.message,
        metadata: { executionId: request.id },
      };

      this.updateMetrics(errorResult, Date.now() - startTime);
      this.executionHistory.set(request.id, errorResult);

      this.emit("executionFailed", {
        id: request.id,
        error: error.message,
        executionTime: Date.now() - startTime,
      });
    } finally {
      // Remove from active executions
      this.activeExecutions.delete(request.id);

      // Process next in queue
      setImmediate(() => this.processQueue());
    }
  }

  private async waitForExecution(executionId: string): Promise<PipelineResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Execution timeout"));
      }, this.config.defaultTimeout + 10000); // Add buffer

      const checkCompletion = () => {
        const result = this.executionHistory.get(executionId);
        if (result) {
          clearTimeout(timeout);
          resolve(result);
          return;
        }

        if (
          !this.activeExecutions.has(executionId) &&
          !this.executionQueue.some((req) => req.id === executionId)
        ) {
          clearTimeout(timeout);
          reject(new Error("Execution not found"));
          return;
        }

        // Check again in 100ms
        setTimeout(checkCompletion, 100);
      };

      checkCompletion();
    });
  }

  private updateMetrics(result: PipelineResult, executionTime: number): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalExecutions++;

    if (result.success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }

    // Update average execution time
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) +
        executionTime) /
      this.metrics.totalExecutions;

    // Update tool usage stats
    result.steps.forEach((step) => {
      this.metrics.toolUsageStats[step.tool] =
        (this.metrics.toolUsageStats[step.tool] || 0) + 1;
    });
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startCleanupTimer(): void {
    if (this.config.autoCleanupInterval > 0) {
      this.cleanupInterval = setInterval(() => {
        this.performCleanup();
      }, this.config.autoCleanupInterval);
    }
  }

  private performCleanup(): void {
    const oldThreshold = new Date(
      Date.now() - this.config.autoCleanupInterval * 2,
    );
    let cleaned = 0;

    // Clean up old history entries
    for (const [id, result] of this.executionHistory.entries()) {
      // Would need to track creation time to do proper cleanup
      // For now, just keep recent entries
      if (this.executionHistory.size > 1000) {
        this.executionHistory.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.emit("autoCleanup", { cleanedEntries: cleaned });
    }
  }
}
