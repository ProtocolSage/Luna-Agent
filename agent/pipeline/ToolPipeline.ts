import {
  ToolExecutive,
  ToolStep,
  ToolResult,
  ToolDefinition,
} from "../tools/executive";
import { ModelRouter } from "../orchestrator/modelRouter";
import { memoryService } from "../../memory/MemoryService";
import { PlanParser } from "./planParser";

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

export class ToolPipeline {
  private executive: ToolExecutive;
  private modelRouter: ModelRouter;
  private config: PipelineConfig;
  private activeExecutions: Map<string, AbortController> = new Map();

  constructor(
    executive: ToolExecutive,
    modelRouter: ModelRouter,
    config: Partial<PipelineConfig> = {},
  ) {
    this.executive = executive;
    this.modelRouter = modelRouter;
    this.config = {
      maxSteps: 10,
      timeoutMs: 300000, // 5 minutes
      allowParallel: true,
      retryCount: 2,
      validateResults: true,
      logExecution: true,
      ...config,
    };
  }

  /**
   * Main pipeline execution method
   */
  async execute(
    userRequest: string,
    context: PipelineContext,
    options: {
      autoPlanning?: boolean;
      providedSteps?: ToolStep[];
      allowUnsafeTools?: boolean;
    } = {},
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const abortController = new AbortController();

    try {
      this.activeExecutions.set(context.traceId, abortController);

      if (this.config.logExecution) {
        await this.logPipelineStart(userRequest, context);
      }

      // Plan execution steps if not provided
      let steps: ToolStep[];
      if (options.providedSteps) {
        steps = options.providedSteps;
      } else if (options.autoPlanning !== false) {
        const planning = await this.planExecution(userRequest, context);
        steps = planning.steps;
      } else {
        throw new Error(
          "No execution steps provided and auto-planning disabled",
        );
      }

      // Validate and filter steps
      steps = await this.validateAndFilterSteps(
        steps,
        context,
        options.allowUnsafeTools,
      );

      // Execute steps with dependency management
      const results = await this.executeSteps(
        steps,
        context,
        abortController.signal,
      );

      // Validate final results
      const finalOutput = await this.processFinalResults(
        results,
        userRequest,
        context,
      );

      const result: PipelineResult = {
        success: true,
        steps: results,
        totalTimeMs: Date.now() - startTime,
        finalOutput,
        metadata: {
          stepCount: results.length,
          successfulSteps: results.filter((r) => r.success).length,
          failedSteps: results.filter((r) => !r.success).length,
          executionMode: options.autoPlanning ? "auto" : "manual",
        },
      };

      if (this.config.logExecution) {
        await this.logPipelineResult(result, context);
      }

      return result;
    } catch (error: any) {
      const result: PipelineResult = {
        success: false,
        steps: [],
        totalTimeMs: Date.now() - startTime,
        finalOutput: null,
        error: error.message,
        metadata: { aborted: abortController.signal.aborted },
      };

      if (this.config.logExecution) {
        await this.logPipelineError(error, context);
      }

      return result;
    } finally {
      this.activeExecutions.delete(context.traceId);
    }
  }

  /**
   * Plan execution steps using the model router
   */
  async planExecution(
    userRequest: string,
    context: PipelineContext,
  ): Promise<ToolPlanning> {
    const availableTools = this.executive.getToolDefinitionsAsText();

    const planningPrompt = `
You are a tool execution planner. Analyze the user request and create a step-by-step execution plan using the available tools.

Available Tools:
${availableTools.join("\n")}

User Request: "${userRequest}"

Context:
- Session ID: ${context.sessionId}
- Working Directory: ${context.workingDir}
- Constraints: ${context.constraints.join(", ")}

Create a detailed execution plan with the following format:
1. List the specific tools to use in order
2. Provide reasoning for each step
3. Identify any dependencies between steps
4. Estimate execution time

Respond with a JSON object containing:
{
  "steps": [{"tool": "tool_name", "args": {...}}],
  "reasoning": "explanation of the approach",
  "confidence": 0.9,
  "dependencies": ["step dependencies"],
  "estimatedTimeMs": 30000
}
`;

    try {
      const response = await (this.modelRouter as any).generateResponse(
        "You are an expert tool execution planner.",
        planningPrompt,
        {
          model: "gpt-4o-2024-08-06", // Use the most capable model for planning
          temperature: 0.1,
          maxTokens: 2000,
        },
      );

      // SECURITY: Use safe parser with JSON repair and schema validation
      const planning = PlanParser.parsePlan(response.content);

      // SECURITY: Fail-safe - return empty plan instead of unsafe fallback
      if (!planning || !planning.steps || planning.steps.length === 0) {
        console.warn(
          "[ToolPipeline] Planning failed - returning empty plan (safe)",
        );
        return PlanParser.emptyPlan();
      }

      return planning;
    } catch (error) {
      // SECURITY: NEVER execute raw user input as fallback
      // Return empty plan instead - fail-safe behavior
      console.error(
        "[ToolPipeline] Planning error - returning empty plan (safe):",
        error,
      );
      return PlanParser.emptyPlan();
    }
  }

  /**
   * Execute steps with dependency management and parallel execution
   */
  private async executeSteps(
    steps: ToolStep[],
    context: PipelineContext,
    signal: AbortSignal,
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    const stepPromises: Promise<ToolResult>[] = [];

    for (let i = 0; i < steps.length && i < this.config.maxSteps; i++) {
      if (signal.aborted) {
        throw new Error("Pipeline execution aborted");
      }

      const step = steps[i];

      // Create execution promise with timeout and retry logic
      const stepPromise = this.executeStepWithRetry(step, context, signal);

      if (
        this.config.allowParallel &&
        this.canExecuteInParallel(step, steps, i)
      ) {
        stepPromises.push(stepPromise);
      } else {
        // Wait for parallel steps to complete before continuing
        if (stepPromises.length > 0) {
          const parallelResults = await Promise.all(stepPromises);
          results.push(...parallelResults);
          stepPromises.length = 0;
        }

        // Execute step and wait for completion
        const result = await stepPromise;
        results.push(result);

        // Stop execution if step failed and validation is enabled
        if (!result.success && this.config.validateResults) {
          console.warn(
            `Step ${i + 1} failed, stopping pipeline:`,
            result.error,
          );
          break;
        }
      }
    }

    // Wait for any remaining parallel steps
    if (stepPromises.length > 0) {
      const parallelResults = await Promise.all(stepPromises);
      results.push(...parallelResults);
    }

    return results;
  }

  /**
   * Execute a single step with retry logic
   */
  private async executeStepWithRetry(
    step: ToolStep,
    context: PipelineContext,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    let lastError: Error | null = null;
    const maxRetries = this.config.retryCount ?? 2;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal.aborted) {
        throw new Error("Pipeline execution aborted");
      }

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("Step timeout")),
            this.config.timeoutMs,
          );
        });

        const executionPromise = this.executive.executePlan(
          [step],
          context.traceId,
        );

        const results = await Promise.race([executionPromise, timeoutPromise]);
        return results[0]; // Return the first (and only) result
      } catch (error: any) {
        lastError = error;

        if (attempt < this.config.retryCount) {
          console.warn(
            `Step ${step.tool} failed (attempt ${attempt + 1}), retrying:`,
            error.message,
          );
          await this.delay(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    // All retries failed
    return {
      tool: step.tool,
      success: false,
      error: lastError?.message || "Unknown error",
      latencyMs: 0,
      metadata: { retryCount: this.config.retryCount },
    };
  }

  /**
   * Determine if a step can be executed in parallel with previous steps
   */
  private canExecuteInParallel(
    step: ToolStep,
    allSteps: ToolStep[],
    currentIndex: number,
  ): boolean {
    // Simple heuristic: file operations and network requests can often run in parallel
    const parallelizableTools = [
      "fetch_url",
      "download_file",
      "web_search",
      "scrape_text",
      "get_system_info",
      "get_time",
      "list_env_vars",
    ];

    if (!parallelizableTools.includes(step.tool)) {
      return false;
    }

    // Check for conflicts with previous steps
    for (let i = Math.max(0, currentIndex - 3); i < currentIndex; i++) {
      const prevStep = allSteps[i];
      if (this.hasStepConflict(step, prevStep)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if two steps have conflicts that prevent parallel execution
   */
  private hasStepConflict(step1: ToolStep, step2: ToolStep): boolean {
    // File system conflicts
    if (
      (step1.tool.includes("file") || step1.tool.includes("directory")) &&
      (step2.tool.includes("file") || step2.tool.includes("directory"))
    ) {
      const path1 = step1.args.path || step1.args.src || step1.args.dest;
      const path2 = step2.args.path || step2.args.src || step2.args.dest;

      if (path1 && path2 && (path1.includes(path2) || path2.includes(path1))) {
        return true;
      }
    }

    // Environment variable conflicts
    if (step1.tool === "set_env_var" || step2.tool === "set_env_var") {
      return step1.args.name === step2.args.name;
    }

    return false;
  }

  /**
   * Validate and filter steps based on security constraints
   */
  private async validateAndFilterSteps(
    steps: ToolStep[],
    context: PipelineContext,
    allowUnsafeTools = false,
  ): Promise<ToolStep[]> {
    const safeSteps: ToolStep[] = [];
    const availableTools = new Set(
      this.executive.getToolDefinitions().map((t) => t.name),
    );

    for (const step of steps) {
      // Check if tool exists
      if (!availableTools.has(step.tool)) {
        console.warn(`Unknown tool: ${step.tool}, skipping`);
        continue;
      }

      // Security validation
      if (!allowUnsafeTools && this.isUnsafeTool(step, context)) {
        console.warn(`Unsafe tool: ${step.tool}, skipping`);
        continue;
      }

      safeSteps.push(step);
    }

    return safeSteps;
  }

  /**
   * Check if a tool is considered unsafe for the current context
   */
  private isUnsafeTool(step: ToolStep, context: PipelineContext): boolean {
    const unsafeTools = [
      "execute_command",
      "execute_python",
      "execute_javascript",
    ];

    if (unsafeTools.includes(step.tool)) {
      // Check if execution is explicitly allowed
      return !context.constraints.includes("allow_code_execution");
    }

    // Check for dangerous file operations
    if (step.tool === "delete_file" || step.tool === "write_file") {
      const path = step.args.path;
      if (path && (path.includes("/system") || path.includes("C:\\Windows"))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Process final results and generate comprehensive output
   */
  private async processFinalResults(
    results: ToolResult[],
    originalRequest: string,
    context: PipelineContext,
  ): Promise<any> {
    if (results.length === 0) {
      return { message: "No steps were executed", success: false };
    }

    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    if (successfulResults.length === 0) {
      return {
        message: "All steps failed",
        success: false,
        failures: failedResults.map((r) => ({ tool: r.tool, error: r.error })),
      };
    }

    // Use the model to synthesize a final response
    try {
      const synthesisPrompt = `
Based on the execution of the following request: "${originalRequest}"

The following tools were executed with these results:
${results
  .map(
    (r, i) => `
${i + 1}. ${r.tool} - ${r.success ? "SUCCESS" : "FAILED"}`,
  )
  .join("")}

Please provide a comprehensive summary of what was accomplished, any issues encountered, and the final result.
`;

      const response = await (this.modelRouter as any).generateResponse(
        synthesisPrompt,
        { temperature: 0.7, maxTokens: 2000 },
      );

      return {
        summary: response.content,
        success: successfulResults.length > failedResults.length,
        executionDetails: {
          totalSteps: results.length,
          successful: successfulResults.length,
          failed: failedResults.length,
          outputs: successfulResults.map((r) => ({
            tool: r.tool,
            output: r.output,
          })),
        },
      };
    } catch (error) {
      // Fallback to simple result aggregation
      return {
        summary: `Executed ${results.length} steps with ${successfulResults.length} successful and ${failedResults.length} failed`,
        success: successfulResults.length > 0,
        executionDetails: {
          totalSteps: results.length,
          successful: successfulResults.length,
          failed: failedResults.length,
          outputs: successfulResults.map((r) => ({
            tool: r.tool,
            output: r.output,
          })),
        },
      };
    }
  }

  /**
   * Abort a running pipeline execution
   */
  abortExecution(traceId: string): boolean {
    const controller = this.activeExecutions.get(traceId);
    if (controller) {
      controller.abort();
      this.activeExecutions.delete(traceId);
      return true;
    }
    return false;
  }

  /**
   * Get status of all active executions
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Logging methods
   */
  private async logPipelineStart(
    request: string,
    context: PipelineContext,
  ): Promise<void> {
    await memoryService.addMemory(`Pipeline started: ${request}`, "task", {
      type: "pipeline_start",
      traceId: context.traceId,
      sessionId: context.sessionId,
      request,
      timestamp: new Date().toISOString(),
    });
  }

  private async logPipelineResult(
    result: PipelineResult,
    context: PipelineContext,
  ): Promise<void> {
    await memoryService.addMemory(
      `Pipeline completed: ${result.success ? "SUCCESS" : "FAILED"} (${result.totalTimeMs}ms)`,
      "task",
      {
        type: "pipeline_result",
        traceId: context.traceId,
        sessionId: context.sessionId,
        success: result.success,
        stepCount: result.steps.length,
        totalTimeMs: result.totalTimeMs,
        timestamp: new Date().toISOString(),
      },
    );
  }

  private async logPipelineError(
    error: Error,
    context: PipelineContext,
  ): Promise<void> {
    await memoryService.addMemory(`Pipeline error: ${error.message}`, "task", {
      type: "pipeline_error",
      traceId: context.traceId,
      sessionId: context.sessionId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
