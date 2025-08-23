import { ToolExecutive, ToolStep, ToolResult } from '../tools/executive';
import { ModelRouter } from '../orchestrator/modelRouter';
export interface PipelineConfig {
    maxSteps: number;
    timeoutMs: number;
    allowParallel: boolean;
    retryCount: number;
    validateResults: boolean;
    logExecution: boolean;
}
export interface PipelineContext {
    sessionId: string;
    traceId: string;
    userId?: string;
    metadata: Record<string, any>;
    constraints: string[];
    workingDir: string;
}
export interface PipelineResult {
    success: boolean;
    steps: ToolResult[];
    totalTimeMs: number;
    finalOutput: any;
    error?: string;
    metadata: Record<string, any>;
}
export interface ToolPlanning {
    steps: ToolStep[];
    reasoning: string;
    confidence: number;
    dependencies: string[];
    estimatedTimeMs: number;
}
export declare class ToolPipeline {
    private executive;
    private modelRouter;
    private config;
    private activeExecutions;
    constructor(executive: ToolExecutive, modelRouter: ModelRouter, config?: Partial<PipelineConfig>);
    /**
     * Main pipeline execution method
     */
    execute(userRequest: string, context: PipelineContext, options?: {
        autoPlanning?: boolean;
        providedSteps?: ToolStep[];
        allowUnsafeTools?: boolean;
    }): Promise<PipelineResult>;
    /**
     * Plan execution steps using the model router
     */
    planExecution(userRequest: string, context: PipelineContext): Promise<ToolPlanning>;
    /**
     * Execute steps with dependency management and parallel execution
     */
    private executeSteps;
    /**
     * Execute a single step with retry logic
     */
    private executeStepWithRetry;
    /**
     * Determine if a step can be executed in parallel with previous steps
     */
    private canExecuteInParallel;
    /**
     * Check if two steps have conflicts that prevent parallel execution
     */
    private hasStepConflict;
    /**
     * Validate and filter steps based on security constraints
     */
    private validateAndFilterSteps;
    /**
     * Check if a tool is considered unsafe for the current context
     */
    private isUnsafeTool;
    /**
     * Process final results and generate comprehensive output
     */
    private processFinalResults;
    /**
     * Abort a running pipeline execution
     */
    abortExecution(traceId: string): boolean;
    /**
     * Get status of all active executions
     */
    getActiveExecutions(): string[];
    /**
     * Logging methods
     */
    private logPipelineStart;
    private logPipelineResult;
    private logPipelineError;
    private delay;
}
