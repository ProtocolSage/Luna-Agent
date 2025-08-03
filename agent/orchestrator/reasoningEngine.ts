import { ModelRouter } from './modelRouter';
import { ReasoningConfig } from '../../types/TaskProfile';

export interface ReasoningResult {
  type: 'direct_response' | 'tool_use' | 'multi_step';
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

export type ReasoningMode = 'react' | 'cot' | 'tot' | 'reflexion';

export class ReasoningEngine {
  private modelRouter: ModelRouter;
  private config: ReasoningConfig;

  constructor(modelRouter: ModelRouter, config: ReasoningConfig) {
    this.modelRouter = modelRouter;
    this.config = config;
  }

  async reason(
    systemPrompt: string,
    userPrompt: string,
    context?: {
      sessionHistory?: any[];
      availableTools?: string[];
      constraints?: Record<string, any>;
    }
  ): Promise<ReasoningResult> {
    const mode = this.config.strategy;
    
    // Determine if this requires tool use
    const needsTools = this.requiresToolUse(userPrompt, context?.availableTools || []);
    
    if (needsTools) {
      return this.processToolUse(systemPrompt, userPrompt, mode, context);
    } else {
      return this.processDirectResponse(systemPrompt, userPrompt, mode, context);
    }
  }

  private requiresToolUse(input: string, availableTools: string[]): boolean {
    // Simple heuristic to determine if tools are needed
    const toolKeywords = [
      'search', 'calculate', 'compute', 'find', 'lookup', 'get', 'fetch',
      'create', 'generate', 'write', 'save', 'file', 'data', 'api',
      'current', 'latest', 'today', 'now', 'weather', 'news'
    ];
    
    const lowercaseInput = input.toLowerCase();
    return toolKeywords.some(keyword => lowercaseInput.includes(keyword));
  }

  private async processDirectResponse(
    systemPrompt: string, 
    userPrompt: string, 
    mode: ReasoningMode,
    context?: any
  ): Promise<ReasoningResult> {
    try {
      const response = await this.modelRouter.route(userPrompt, {
        maxTokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.7
      });

      // Parse the response to determine type
      const responseType = this.determineResponseType(response.content);
      
      return {
        type: responseType,
        content: response.content,
        confidence: response.confidence || 0.8,
        metadata: {
          model: response.model,
          tokensUsed: response.tokensUsed,
          cost: response.cost,
          mode: mode
        }
      };
    } catch (error: any) {
      return {
        type: 'direct_response',
        content: `I apologize, but I encountered an error: ${error.message}`,
        confidence: 0.1,
        metadata: { error: error.message, mode: mode }
      };
    }
  }

  private async processToolUse(
    systemPrompt: string,
    userPrompt: string,
    mode: ReasoningMode,
    context?: any
  ): Promise<ReasoningResult> {
    const steps: ReasoningStep[] = [];
    let currentStep = 1;
    let finalResponse = '';
    let toolCalls: any[] = [];

    try {
      // Step 1: Plan the approach
      const planningPrompt = this.buildPlanningPrompt(systemPrompt, userPrompt, context);
      const planResponse = await this.modelRouter.route(planningPrompt, {
        maxTokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.7
      });

      steps.push({
        step: currentStep++,
        thought: 'Planning approach to solve the user\'s request',
        action: 'analyze_requirements',
        observation: planResponse.content,
        confidence: planResponse.confidence || 0.8
      });

      // Step 2: Execute the plan (simplified for now)
      const executionPrompt = this.buildExecutionPrompt(userPrompt, planResponse.content);
      const executionResponse = await this.modelRouter.route(executionPrompt, {
        maxTokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.7
      });

      steps.push({
        step: currentStep++,
        thought: 'Executing the planned approach',
        action: 'execute_plan',
        observation: executionResponse.content,
        confidence: executionResponse.confidence || 0.8
      });

      finalResponse = executionResponse.content;

      // Calculate overall confidence
      const overallConfidence = steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length;

      return {
        type: 'multi_step',
        content: finalResponse,
        confidence: overallConfidence,
        steps: steps,
        toolCalls: toolCalls,
        metadata: {
          mode: mode,
          totalSteps: steps.length,
          planningTokens: planResponse.tokensUsed,
          executionTokens: executionResponse.tokensUsed
        }
      };

    } catch (error: any) {
      return {
        type: 'tool_use',
        content: `I encountered an error while processing your request: ${error.message}`,
        confidence: 0.1,
        steps: steps,
        toolCalls: toolCalls,
        metadata: { error: error.message, mode: mode }
      };
    }
  }

  private buildPlanningPrompt(systemPrompt: string, userPrompt: string, context?: any): string {
    return `${systemPrompt}

You are in planning mode. Analyze the following user request and create a step-by-step plan to address it.

User Request: ${userPrompt}

Available Context: ${JSON.stringify(context?.sessionHistory?.slice(-3) || [])}

Please provide a clear, structured plan with specific steps to solve this request.`;
  }

  private buildExecutionPrompt(userPrompt: string, plan: string): string {
    return `Based on the following plan, provide a comprehensive response to the user's request.

User Request: ${userPrompt}

Plan: ${plan}

Please execute this plan and provide a helpful, detailed response.`;
  }

  private determineResponseType(content: string): 'direct_response' | 'tool_use' | 'multi_step' {
    // Simple heuristic to determine response type
    if (content.includes('step') || content.includes('first') || content.includes('then')) {
      return 'multi_step';
    } else if (content.includes('tool') || content.includes('search') || content.includes('calculate')) {
      return 'tool_use';
    } else {
      return 'direct_response';
    }
  }

  // Self-reflection capability
  async reflect(
    originalPrompt: string,
    response: ReasoningResult,
    feedback?: string
  ): Promise<ReasoningResult> {
    if (!this.config.selfReflection) {
      return response;
    }

    try {
      const reflectionPrompt = `
Please review and improve the following response:

Original Question: ${originalPrompt}
Current Response: ${response.content}
${feedback ? `Feedback: ${feedback}` : ''}

Provide an improved response that addresses any issues or gaps.`;

      const reflectionResponse = await this.modelRouter.route(reflectionPrompt, {
        maxTokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature * 0.8 // Lower temperature for reflection
      });

      return {
        ...response,
        content: reflectionResponse.content,
        confidence: Math.min(response.confidence + 0.1, 1.0), // Slight confidence boost
        metadata: {
          ...response.metadata,
          reflected: true,
          originalContent: response.content
        }
      };

    } catch (error: any) {
      console.error('Reflection failed:', error);
      return response; // Return original if reflection fails
    }
  }

  // Multiple hypothesis generation
  async generateHypotheses(
    prompt: string,
    count: number = 3
  ): Promise<ReasoningResult[]> {
    if (!this.config.multipleHypotheses) {
      const single = await this.reason('', prompt);
      return [single];
    }

    const hypotheses: ReasoningResult[] = [];

    for (let i = 0; i < count; i++) {
      try {
        const hypothesis = await this.reason('', prompt, {
          constraints: { hypothesisNumber: i + 1 }
        });
        
        hypotheses.push({
          ...hypothesis,
          metadata: {
            ...hypothesis.metadata,
            hypothesisIndex: i,
            temperature: this.config.temperature + (i * 0.1) // Vary temperature
          }
        });
      } catch (error) {
        console.error(`Failed to generate hypothesis ${i + 1}:`, error);
      }
    }

    return hypotheses;
  }

  // Consistency checking
  async checkConsistency(results: ReasoningResult[]): Promise<{
    consistent: boolean;
    confidence: number;
    explanation: string;
  }> {
    if (!this.config.consistencyChecks || results.length < 2) {
      return {
        consistent: true,
        confidence: 1.0,
        explanation: 'Consistency checking disabled or insufficient results'
      };
    }

    try {
      const consistencyPrompt = `
Analyze the following responses for consistency and accuracy:

${results.map((result, i) => `Response ${i + 1}: ${result.content}`).join('\n\n')}

Are these responses consistent with each other? Explain any discrepancies and provide a confidence score (0-1).`;

      const consistencyResponse = await this.modelRouter.route(consistencyPrompt, {
        maxTokens: 1000,
        temperature: 0.3 // Low temperature for analysis
      });

      // Simple parsing of consistency check
      const content = consistencyResponse.content.toLowerCase();
      const consistent = content.includes('consistent') && !content.includes('not consistent');
      const confidence = consistent ? 0.8 : 0.4;

      return {
        consistent,
        confidence,
        explanation: consistencyResponse.content
      };

    } catch (error: any) {
      return {
        consistent: false,
        confidence: 0.1,
        explanation: `Consistency check failed: ${error.message}`
      };
    }
  }

  // Configuration updates
  updateConfig(newConfig: Partial<ReasoningConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): ReasoningConfig {
    return { ...this.config };
  }

  // Health check
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  } {
    try {
      const modelRouterHealthy = this.modelRouter.getMetrics();
      const hasModels = Object.keys(modelRouterHealthy).length > 0;

      return {
        status: hasModels ? 'healthy' : 'degraded',
        details: {
          config: this.config,
          availableModels: Object.keys(modelRouterHealthy),
          modelMetrics: modelRouterHealthy
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

