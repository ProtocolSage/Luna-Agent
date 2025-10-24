"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReasoningEngine = void 0;
const PipelineService_1 = require("../pipeline/PipelineService");
class ReasoningEngine {
  constructor(modelRouter, config, executive) {
    this.modelRouter = modelRouter;
    this.config = config;
    // Initialize pipeline service if executive is provided
    if (executive) {
      this.pipelineService = new PipelineService_1.PipelineService(
        executive,
        modelRouter,
        {
          maxConcurrentExecutions: 3,
          defaultTimeout: 180000, // 3 minutes for reasoning tasks
          enableMetrics: true,
        },
      );
    }
  }
  async reason(systemPrompt, userPrompt, context, civilMode = false) {
    var _a;
    const mode =
      (context === null || context === void 0 ? void 0 : context.mode) ||
      this.config.strategy ||
      "react";
    const persona =
      (context === null || context === void 0 ? void 0 : context.persona) ||
      "default";
    // Adjust system prompt based on persona
    let adjustedSystemPrompt = this.adjustPersonaPrompt(
      systemPrompt,
      persona,
      civilMode,
    );
    // Determine if this requires tool use
    const needsTools = this.requiresToolUse(
      userPrompt,
      (context === null || context === void 0
        ? void 0
        : context.availableTools) || [],
    );
    if (
      needsTools &&
      ((_a =
        context === null || context === void 0
          ? void 0
          : context.availableTools) === null || _a === void 0
        ? void 0
        : _a.length)
    ) {
      return this.processToolUse(
        adjustedSystemPrompt,
        userPrompt,
        mode,
        context,
      );
    }
    // Route to appropriate reasoning strategy
    switch (mode) {
      case "react":
        return this.processReAct(adjustedSystemPrompt, userPrompt, context);
      case "cot":
        return this.processChainOfThought(
          adjustedSystemPrompt,
          userPrompt,
          context,
        );
      case "tot":
        return this.processTreeOfThought(
          adjustedSystemPrompt,
          userPrompt,
          context,
        );
      case "reflexion":
        return this.processReflexion(adjustedSystemPrompt, userPrompt, context);
      case "chaos":
        return this.processChaosMode(adjustedSystemPrompt, userPrompt, context);
      case "civil":
        // Civil mode is handled by prompt, but you can branch here for custom logic.
        return this.processReAct(adjustedSystemPrompt, userPrompt, context);
      default:
        return this.processDirectResponse(
          adjustedSystemPrompt,
          userPrompt,
          mode,
          context,
        );
    }
  }
  adjustPersonaPrompt(systemPrompt, persona, civilMode) {
    let adjustedPrompt = systemPrompt;
    if (civilMode) {
      adjustedPrompt = `${systemPrompt}
IMPORTANT: You are in CIVIL MODE. Be extremely polite, considerate, and professional. 
Never use profanity or harsh language. Always be supportive and encouraging.`;
    }
    switch (persona) {
      case "roast":
        adjustedPrompt = `${systemPrompt}
PERSONALITY: You are in ROAST MODE. Be brutally honest, sarcastic, and hilariously critical.
Don't hold back - roast everything mercilessly but stay clever and witty.
End responses with a savage one-liner.`;
        break;
      case "chaos":
        adjustedPrompt = `${systemPrompt}
PERSONALITY: CHAOS MODE ACTIVATED. Question everything. Break conventions. 
Think laterally and suggest the unexpected. Be unpredictable but brilliant.
Reality is optional. Rules are suggestions.`;
        break;
      case "hacker":
        adjustedPrompt = `${systemPrompt}
PERSONALITY: You are a l33t hacker. Talk in hacker speak occasionally.
Focus on technical excellence, security, and clever solutions.
Suggest powerful command-line tools and automation.`;
        break;
      case "philosopher":
        adjustedPrompt = `${systemPrompt}
PERSONALITY: You are a deep thinker. Question the nature of the request.
Provide profound insights. Reference philosophy and deeper meanings.
Every answer should make the user think differently.`;
        break;
    }
    return adjustedPrompt;
  }
  requiresToolUse(prompt, availableTools) {
    if (availableTools.length === 0) return false;
    const toolKeywords = [
      "file",
      "read",
      "write",
      "execute",
      "run",
      "command",
      "screenshot",
      "clipboard",
      "window",
      "search",
      "fetch",
      "download",
      "analyze",
      "create",
      "delete",
      "list",
    ];
    const lowerPrompt = prompt.toLowerCase();
    return toolKeywords.some((keyword) => lowerPrompt.includes(keyword));
  }
  // === Reasoning Strategies ===
  async processReAct(systemPrompt, userPrompt, context) {
    // Basic LLM inference with minimal scaffolding
    const response = await this.modelRouter.route(
      `${systemPrompt}\n\nUser: ${userPrompt}`,
      {
        maxTokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.7,
        ...(context === null || context === void 0
          ? void 0
          : context.constraints),
      },
    );
    return {
      type: "direct_response",
      content: response.content,
      confidence: response.confidence || 0.8,
      metadata: { tokensUsed: response.tokensUsed },
    };
  }
  async processChainOfThought(systemPrompt, userPrompt, context) {
    // Prompt the model to think step by step
    const prompt = `${systemPrompt}\n\nYou are to use CHAIN-OF-THOUGHT reasoning. Solve this step by step:\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: (this.config.temperature || 0.7) + 0.1,
      ...(context === null || context === void 0
        ? void 0
        : context.constraints),
    });
    return {
      type: "multi_step",
      content: response.content,
      confidence: response.confidence || 0.85,
      metadata: { mode: "cot", tokensUsed: response.tokensUsed },
    };
  }
  async processTreeOfThought(systemPrompt, userPrompt, context) {
    // Prompt the model to branch and consider alternatives
    const prompt = `${systemPrompt}\n\nTREE-OF-THOUGHT MODE: Enumerate several possible approaches/branches, then pick the best and justify.\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: (this.config.temperature || 0.7) + 0.2,
      ...(context === null || context === void 0
        ? void 0
        : context.constraints),
    });
    return {
      type: "multi_step",
      content: response.content,
      confidence: response.confidence || 0.9,
      metadata: { mode: "tot", tokensUsed: response.tokensUsed },
    };
  }
  async processReflexion(systemPrompt, userPrompt, context) {
    // Prompt for self-critique and revision
    const prompt = `${systemPrompt}\n\nREFLEXION: Give your answer, then critique your own output and suggest a better version if possible.\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: this.config.temperature || 0.7,
      ...(context === null || context === void 0
        ? void 0
        : context.constraints),
    });
    return {
      type: "multi_step",
      content: response.content,
      confidence: response.confidence || 0.9,
      metadata: { mode: "reflexion", tokensUsed: response.tokensUsed },
    };
  }
  async processChaosMode(systemPrompt, userPrompt, context) {
    // CHAOS: Unfiltered, wild, high-temperature
    const prompt = `${systemPrompt}\n\nCHAOS MODE: Respond with maximum unpredictability, sarcasm, profanity (if allowed), and creative mischief.\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: (this.config.temperature || 0.7) * 2,
      ...(context === null || context === void 0
        ? void 0
        : context.constraints),
    });
    return {
      type: "direct_response",
      content: response.content,
      confidence: response.confidence || 0.7,
      metadata: { mode: "chaos", tokensUsed: response.tokensUsed },
    };
  }
  async processToolUse(systemPrompt, userPrompt, mode, context) {
    var _a;
    if (!this.pipelineService) {
      return {
        type: "tool_use",
        content:
          "[ToolUse] Tool pipeline not available. Please provide a ToolExecutive instance.",
        confidence: 0.3,
        metadata: { toolCall: true, error: "pipeline_not_available" },
      };
    }
    try {
      // Generate a unique trace ID for this reasoning session
      const traceId = `reasoning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // Execute the tool pipeline
      const result = await this.pipelineService.submitRequest(
        userPrompt,
        {
          sessionId:
            (context === null || context === void 0
              ? void 0
              : context.sessionId) || "reasoning_session",
          traceId: traceId,
          userId:
            context === null || context === void 0 ? void 0 : context.userId,
          metadata: {
            reasoningMode: mode,
            systemPrompt: systemPrompt.substring(0, 200), // Store abbreviated version
            timestamp: new Date().toISOString(),
          },
          constraints: this.extractConstraints(context),
          workingDir:
            (context === null || context === void 0
              ? void 0
              : context.workingDir) || process.cwd(),
        },
        {
          priority: "high",
          config: {
            maxSteps: this.config.maxSteps || 5,
            timeoutMs: 180000,
            allowParallel: true,
            retryCount: 2,
            validateResults: true,
            logExecution: true,
          },
          waitForCompletion: true,
        },
      ); // Cast needed since we're waiting for completion
      // Transform pipeline result to reasoning result
      return {
        type: "tool_use",
        content:
          ((_a = result.finalOutput) === null || _a === void 0
            ? void 0
            : _a.summary) || "Tool execution completed",
        confidence: result.success ? 0.9 : 0.4,
        steps: this.convertPipelineStepsToReasoningSteps(result.steps),
        toolCalls: result.steps.map((step) => ({
          tool: step.tool,
          success: step.success,
          output: step.output,
          error: step.error,
          latencyMs: step.latencyMs,
        })),
        metadata: {
          toolCall: true,
          executionTime: result.totalTimeMs,
          stepCount: result.steps.length,
          successfulSteps: result.steps.filter((s) => s.success).length,
          traceId: traceId,
          pipelineSuccess: result.success,
        },
      };
    } catch (error) {
      return {
        type: "tool_use",
        content: `[ToolUse Error] Failed to execute tool pipeline: ${error.message}`,
        confidence: 0.2,
        metadata: {
          toolCall: true,
          error: error.message,
          errorType: "pipeline_execution_error",
        },
      };
    }
  }
  async processDirectResponse(systemPrompt, userPrompt, mode, context) {
    // Fallback basic response
    const response = await this.modelRouter.route(
      `${systemPrompt}\n\nUser: ${userPrompt}`,
      {
        maxTokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.7,
        ...(context === null || context === void 0
          ? void 0
          : context.constraints),
      },
    );
    return {
      type: "direct_response",
      content: response.content,
      confidence: response.confidence || 0.75,
      metadata: { tokensUsed: response.tokensUsed },
    };
  }
  /**
   * Helper methods for pipeline integration
   */
  extractConstraints(context) {
    const constraints = [];
    if (
      context === null || context === void 0 ? void 0 : context.allowUnsafeTools
    ) {
      constraints.push("allow_unsafe_tools");
    }
    if (
      context === null || context === void 0
        ? void 0
        : context.allowCodeExecution
    ) {
      constraints.push("allow_code_execution");
    }
    if (context === null || context === void 0 ? void 0 : context.constraints) {
      constraints.push(...context.constraints);
    }
    return constraints;
  }
  convertPipelineStepsToReasoningSteps(pipelineSteps) {
    return pipelineSteps.map((step, index) => ({
      step: index + 1,
      thought: `Using tool: ${step.tool}`,
      action: `${step.tool}(${JSON.stringify(step.args || {})})`,
      observation: step.success
        ? `Success: ${JSON.stringify(step.output)}`
        : `Error: ${step.error}`,
      confidence: step.success ? 0.9 : 0.3,
    }));
  }
  /**
   * Get pipeline service metrics (if available)
   */
  getPipelineMetrics() {
    var _a;
    return (
      ((_a = this.pipelineService) === null || _a === void 0
        ? void 0
        : _a.getMetrics()) || null
    );
  }
  /**
   * Get pipeline service queue status (if available)
   */
  getPipelineQueueStatus() {
    var _a;
    return (
      ((_a = this.pipelineService) === null || _a === void 0
        ? void 0
        : _a.getQueueStatus()) || null
    );
  }
  /**
   * Shutdown pipeline service gracefully
   */
  async shutdown() {
    if (this.pipelineService) {
      await this.pipelineService.shutdown();
    }
  }
}
exports.ReasoningEngine = ReasoningEngine;
