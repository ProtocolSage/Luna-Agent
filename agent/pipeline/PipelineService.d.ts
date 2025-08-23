import { PipelineContext, PipelineResult, PipelineConfig } from './ToolPipeline';
import { ToolExecutive } from '../tools/executive';
import { ModelRouter } from '../orchestrator/modelRouter';
import { EventEmitter } from 'events';
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
    priority: 'low' | 'normal' | 'high';
    createdAt: Date;
}
export declare class PipelineService extends EventEmitter {
    private pipeline;
    private config;
    private executionQueue;
    private activeExecutions;
    private executionHistory;
    private metrics;
    private cleanupInterval?;
    constructor(executive: ToolExecutive, modelRouter: ModelRouter, config?: Partial<PipelineServiceConfig>);
    /**
     * Submit a request for pipeline execution
     */
    submitRequest(request: string, context?: Partial<PipelineContext>, options?: {
        priority?: 'low' | 'normal' | 'high';
        config?: Partial<PipelineConfig>;
        waitForCompletion?: boolean;
    }): Promise<string | PipelineResult>;
    /**
     * Get the result of a specific execution
     */
    getExecutionResult(executionId: string): Promise<PipelineResult | null>;
    /**
     * Get current execution status
     */
    getExecutionStatus(executionId: string): 'queued' | 'active' | 'completed' | 'not_found';
    /**
     * Cancel a queued or active execution
     */
    cancelExecution(executionId: string): boolean;
    /**
     * Get current metrics
     */
    getMetrics(): PipelineMetrics;
    /**
     * Get queue status
     */
    getQueueStatus(): {
        queueLength: number;
        activeExecutions: number;
        nextExecution?: ExecutionRequest;
    };
    /**
     * Clear execution history
     */
    clearHistory(olderThan?: Date): number;
    /**
     * Shutdown the service gracefully
     */
    shutdown(timeout?: number): Promise<void>;
    /**
     * Private methods
     */
    private addToQueue;
    private findInsertPosition;
    private processQueue;
    private executeRequest;
    private waitForExecution;
    private updateMetrics;
    private generateExecutionId;
    private startCleanupTimer;
    private performCleanup;
}
