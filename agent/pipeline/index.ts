// Pipeline system exports
export { ToolPipeline } from "./ToolPipeline";
export { PipelineService } from "./PipelineService";

// Type exports
export type {
  PipelineConfig,
  PipelineContext,
  PipelineResult,
  ToolPlanning,
} from "./ToolPipeline";

export type {
  PipelineServiceConfig,
  PipelineMetrics,
  ExecutionRequest,
} from "./PipelineService";

// Re-export tool system components for convenience
export { ToolExecutive } from "../tools/executive";

export type {
  ToolStep,
  ToolResult,
  ToolDefinition,
  ToolContext,
} from "../tools/executive";

/**
 * Pipeline System Overview
 *
 * This module provides a comprehensive tool execution pipeline for the Luna Agent.
 * It consists of three main components:
 *
 * 1. ToolPipeline: Core execution engine that handles tool planning, execution,
 *    dependency management, and result processing.
 *
 * 2. PipelineService: Service layer that manages multiple concurrent executions,
 *    queuing, metrics, and provides a clean API for pipeline operations.
 *
 * 3. Integration with ReasoningEngine: Seamless integration that allows the
 *    reasoning system to automatically invoke tools when needed.
 *
 * Key Features:
 * - Automatic tool planning using LLM
 * - Parallel execution where safe
 * - Dependency management between tools
 * - Comprehensive error handling and retry logic
 * - Security validation and constraint enforcement
 * - Execution metrics and monitoring
 * - Memory integration for logging and learning
 *
 * Usage Examples:
 *
 * Basic tool execution:
 * ```typescript
 * const executive = new ToolExecutive();
 * const pipeline = new ToolPipeline(executive, modelRouter);
 *
 * const result = await pipeline.execute(
 *   "Search for the latest Node.js version and save it to a file",
 *   {
 *     sessionId: "user_session",
 *     traceId: "task_123",
 *     workingDir: "/tmp",
 *     constraints: [],
 *     metadata: {}
 *   }
 * );
 * ```
 *
 * Service-based execution with queue management:
 * ```typescript
 * const service = new PipelineService(executive, modelRouter);
 *
 * const executionId = await service.submitRequest(
 *   "Analyze system performance and generate a report",
 *   { sessionId: "monitoring" },
 *   { priority: 'high', waitForCompletion: false }
 * );
 *
 * // Check status later
 * const result = await service.getExecutionResult(executionId);
 * ```
 *
 * Integration with reasoning:
 * ```typescript
 * const reasoningEngine = new ReasoningEngine(modelRouter, config, executive);
 *
 * const result = await reasoningEngine.reason(
 *   systemPrompt,
 *   "Help me set up a new project with TypeScript and testing",
 *   {
 *     availableTools: ["read_file", "write_file", "execute_command"],
 *     allowCodeExecution: true,
 *     mode: 'react'
 *   }
 * );
 * ```
 */
