"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolPipeline = void 0;
const MemoryService_1 = require("../../memory/MemoryService");
class ToolPipeline {
  constructor(executive, modelRouter, config = {}) {
    this.activeExecutions = new Map();
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
  async execute(userRequest, context, options = {}) {
    const startTime = Date.now();
    const abortController = new AbortController();
    try {
      this.activeExecutions.set(context.traceId, abortController);
      if (this.config.logExecution) {
        await this.logPipelineStart(userRequest, context);
      }
      // Plan execution steps if not provided
      let steps;
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
      const result = {
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
    } catch (error) {
      const result = {
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
  async planExecution(userRequest, context) {
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
      const response = await this.modelRouter.generateResponse(
        "You are an expert tool execution planner.",
        planningPrompt,
        {
          model: "gpt-4o-2024-08-06", // Use the most capable model for planning
          temperature: 0.1,
          maxTokens: 2000,
        },
      );
      const planning = JSON.parse(response.content);
      // Validate the planning structure
      if (!planning.steps || !Array.isArray(planning.steps)) {
        throw new Error("Invalid planning response: missing steps array");
      }
      return {
        steps: planning.steps,
        reasoning: planning.reasoning || "Auto-generated plan",
        confidence: planning.confidence || 0.7,
        dependencies: planning.dependencies || [],
        estimatedTimeMs: planning.estimatedTimeMs || 60000,
      };
    } catch (error) {
      // Fallback to simple single-step execution
      console.warn("Planning failed, using fallback approach:", error);
      return {
        steps: [{ tool: "execute_command", args: { command: userRequest } }],
        reasoning: "Fallback execution plan due to planning failure",
        confidence: 0.3,
        dependencies: [],
        estimatedTimeMs: 30000,
      };
    }
  }
  /**
   * Execute steps with dependency management and parallel execution
   */
  async executeSteps(steps, context, signal) {
    const results = [];
    const stepPromises = [];
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
  async executeStepWithRetry(step, context, signal) {
    var _a;
    let lastError = null;
    const maxRetries =
      (_a = this.config.retryCount) !== null && _a !== void 0 ? _a : 2;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (signal.aborted) {
        throw new Error("Pipeline execution aborted");
      }
      try {
        const timeoutPromise = new Promise((_, reject) => {
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
      } catch (error) {
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
      error:
        (lastError === null || lastError === void 0
          ? void 0
          : lastError.message) || "Unknown error",
      latencyMs: 0,
      metadata: { retryCount: this.config.retryCount },
    };
  }
  /**
   * Determine if a step can be executed in parallel with previous steps
   */
  canExecuteInParallel(step, allSteps, currentIndex) {
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
  hasStepConflict(step1, step2) {
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
  async validateAndFilterSteps(steps, context, allowUnsafeTools = false) {
    const safeSteps = [];
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
  isUnsafeTool(step, context) {
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
  async processFinalResults(results, originalRequest, context) {
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
      const response = await this.modelRouter.generateResponse(
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
  abortExecution(traceId) {
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
  getActiveExecutions() {
    return Array.from(this.activeExecutions.keys());
  }
  /**
   * Logging methods
   */
  async logPipelineStart(request, context) {
    await MemoryService_1.memoryService.addMemory(
      `Pipeline started: ${request}`,
      "task",
      {
        type: "pipeline_start",
        traceId: context.traceId,
        sessionId: context.sessionId,
        request,
        timestamp: new Date().toISOString(),
      },
    );
  }
  async logPipelineResult(result, context) {
    await MemoryService_1.memoryService.addMemory(
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
  async logPipelineError(error, context) {
    await MemoryService_1.memoryService.addMemory(
      `Pipeline error: ${error.message}`,
      "task",
      {
        type: "pipeline_error",
        traceId: context.traceId,
        sessionId: context.sessionId,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    );
  }
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
exports.ToolPipeline = ToolPipeline;
