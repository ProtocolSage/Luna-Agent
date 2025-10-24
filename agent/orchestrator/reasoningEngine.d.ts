import { ModelRouter } from "./modelRouter";
import { ReasoningConfig } from "../../types/TaskProfile";
import { ToolExecutive } from "../tools/executive";
export interface ReasoningResult {
  type: "direct_response" | "tool_use" | "multi_step";
  content: string;
  confidence: number;
  steps?: ReasoningStep[];
  toolCalls?: any[];
  metadata?: Record<string, any>;
}
export interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  observation?: string;
  confidence: number;
}
export type ReasoningMode =
  | "react"
  | "cot"
  | "tot"
  | "reflexion"
  | "chaos"
  | "civil";
export declare class ReasoningEngine {
  private modelRouter;
  private config;
  private pipelineService?;
  constructor(
    modelRouter: ModelRouter,
    config: ReasoningConfig,
    executive?: ToolExecutive,
  );
  reason(
    systemPrompt: string,
    userPrompt: string,
    context?: {
      sessionHistory?: any[];
      availableTools?: string[];
      constraints?: Record<string, any>;
      mode?: ReasoningMode;
      persona?: string;
    },
    civilMode?: boolean,
  ): Promise<ReasoningResult>;
  private adjustPersonaPrompt;
  private requiresToolUse;
  private processReAct;
  private processChainOfThought;
  private processTreeOfThought;
  private processReflexion;
  private processChaosMode;
  private processToolUse;
  private processDirectResponse;
  /**
   * Helper methods for pipeline integration
   */
  private extractConstraints;
  private convertPipelineStepsToReasoningSteps;
  /**
   * Get pipeline service metrics (if available)
   */
  getPipelineMetrics():
    | import("../pipeline/PipelineService").PipelineMetrics
    | null;
  /**
   * Get pipeline service queue status (if available)
   */
  getPipelineQueueStatus(): {
    queueLength: number;
    activeExecutions: number;
    nextExecution?: import("../pipeline/PipelineService").ExecutionRequest;
  } | null;
  /**
   * Shutdown pipeline service gracefully
   */
  shutdown(): Promise<void>;
}
