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

export type ReasoningMode = 'react' | 'cot' | 'tot' | 'reflexion' | 'chaos' | 'civil';

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
      mode?: ReasoningMode;
      persona?: string;
    },
    civilMode: boolean = false
  ): Promise<ReasoningResult> {
    const mode = context?.mode || this.config.strategy || 'react';
    const persona = context?.persona || 'default';

    // Adjust system prompt based on persona
    let adjustedSystemPrompt = this.adjustPersonaPrompt(systemPrompt, persona, civilMode);

    // Determine if this requires tool use
    const needsTools = this.requiresToolUse(userPrompt, context?.availableTools || []);

    if (needsTools && context?.availableTools?.length) {
      return this.processToolUse(adjustedSystemPrompt, userPrompt, mode, context);
    }

    // Route to appropriate reasoning strategy
    switch (mode) {
      case 'react':
        return this.processReAct(adjustedSystemPrompt, userPrompt, context);
      case 'cot':
        return this.processChainOfThought(adjustedSystemPrompt, userPrompt, context);
      case 'tot':
        return this.processTreeOfThought(adjustedSystemPrompt, userPrompt, context);
      case 'reflexion':
        return this.processReflexion(adjustedSystemPrompt, userPrompt, context);
      case 'chaos':
        return this.processChaosMode(adjustedSystemPrompt, userPrompt, context);
      case 'civil':
        // Civil mode is handled by prompt, but you can branch here for custom logic.
        return this.processReAct(adjustedSystemPrompt, userPrompt, context);
      default:
        return this.processDirectResponse(adjustedSystemPrompt, userPrompt, mode, context);
    }
  }

  private adjustPersonaPrompt(systemPrompt: string, persona: string, civilMode: boolean): string {
    let adjustedPrompt = systemPrompt;

    if (civilMode) {
      adjustedPrompt = `${systemPrompt}
IMPORTANT: You are in CIVIL MODE. Be extremely polite, considerate, and professional. 
Never use profanity or harsh language. Always be supportive and encouraging.`;
    }

    switch (persona) {
      case 'roast':
        adjustedPrompt = `${systemPrompt}
PERSONALITY: You are in ROAST MODE. Be brutally honest, sarcastic, and hilariously critical.
Don't hold back - roast everything mercilessly but stay clever and witty.
End responses with a savage one-liner.`;
        break;

      case 'chaos':
        adjustedPrompt = `${systemPrompt}
PERSONALITY: CHAOS MODE ACTIVATED. Question everything. Break conventions. 
Think laterally and suggest the unexpected. Be unpredictable but brilliant.
Reality is optional. Rules are suggestions.`;
        break;

      case 'hacker':
        adjustedPrompt = `${systemPrompt}
PERSONALITY: You are a l33t hacker. Talk in hacker speak occasionally.
Focus on technical excellence, security, and clever solutions.
Suggest powerful command-line tools and automation.`;
        break;

      case 'philosopher':
        adjustedPrompt = `${systemPrompt}
PERSONALITY: You are a deep thinker. Question the nature of the request.
Provide profound insights. Reference philosophy and deeper meanings.
Every answer should make the user think differently.`;
        break;
    }
    return adjustedPrompt;
  }

  private requiresToolUse(prompt: string, availableTools: string[]): boolean {
    if (availableTools.length === 0) return false;

    const toolKeywords = [
      'file', 'read', 'write', 'execute', 'run', 'command',
      'screenshot', 'clipboard', 'window', 'search', 'fetch',
      'download', 'analyze', 'create', 'delete', 'list'
    ];

    const lowerPrompt = prompt.toLowerCase();
    return toolKeywords.some(keyword => lowerPrompt.includes(keyword));
  }

  // === Reasoning Strategies ===

  private async processReAct(systemPrompt: string, userPrompt: string, context?: any): Promise<ReasoningResult> {
    // Basic LLM inference with minimal scaffolding
    const response = await this.modelRouter.route(`${systemPrompt}\n\nUser: ${userPrompt}`, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: this.config.temperature || 0.7,
      ...context?.constraints
    });
    return {
      type: 'direct_response',
      content: response.content,
      confidence: response.confidence || 0.8,
      metadata: { tokensUsed: response.tokensUsed }
    };
  }

  private async processChainOfThought(systemPrompt: string, userPrompt: string, context?: any): Promise<ReasoningResult> {
    // Prompt the model to think step by step
    const prompt = `${systemPrompt}\n\nYou are to use CHAIN-OF-THOUGHT reasoning. Solve this step by step:\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: (this.config.temperature || 0.7) + 0.1,
      ...context?.constraints
    });
    return {
      type: 'multi_step',
      content: response.content,
      confidence: response.confidence || 0.85,
      metadata: { mode: 'cot', tokensUsed: response.tokensUsed }
    };
  }

  private async processTreeOfThought(systemPrompt: string, userPrompt: string, context?: any): Promise<ReasoningResult> {
    // Prompt the model to branch and consider alternatives
    const prompt = `${systemPrompt}\n\nTREE-OF-THOUGHT MODE: Enumerate several possible approaches/branches, then pick the best and justify.\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: (this.config.temperature || 0.7) + 0.2,
      ...context?.constraints
    });
    return {
      type: 'multi_step',
      content: response.content,
      confidence: response.confidence || 0.9,
      metadata: { mode: 'tot', tokensUsed: response.tokensUsed }
    };
  }

  private async processReflexion(systemPrompt: string, userPrompt: string, context?: any): Promise<ReasoningResult> {
    // Prompt for self-critique and revision
    const prompt = `${systemPrompt}\n\nREFLEXION: Give your answer, then critique your own output and suggest a better version if possible.\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: this.config.temperature || 0.7,
      ...context?.constraints
    });
    return {
      type: 'multi_step',
      content: response.content,
      confidence: response.confidence || 0.9,
      metadata: { mode: 'reflexion', tokensUsed: response.tokensUsed }
    };
  }

  private async processChaosMode(systemPrompt: string, userPrompt: string, context?: any): Promise<ReasoningResult> {
    // CHAOS: Unfiltered, wild, high-temperature
    const prompt = `${systemPrompt}\n\nCHAOS MODE: Respond with maximum unpredictability, sarcasm, profanity (if allowed), and creative mischief.\n\nUser: ${userPrompt}`;
    const response = await this.modelRouter.route(prompt, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: (this.config.temperature || 0.7) * 2,
      ...context?.constraints
    });
    return {
      type: 'direct_response',
      content: response.content,
      confidence: response.confidence || 0.7,
      metadata: { mode: 'chaos', tokensUsed: response.tokensUsed }
    };
  }

  private async processToolUse(systemPrompt: string, userPrompt: string, mode: ReasoningMode, context?: any): Promise<ReasoningResult> {
    // This is where you'd parse the prompt to figure out which tool(s) to use, then call ToolExecutive.executePlan
    // For now, this is a stub; in real code, you'd invoke the tool pipeline
    return {
      type: 'tool_use',
      content: `[ToolUse] Detected tool use needed but tool pipeline is not yet implemented.`,
      confidence: 0.6,
      metadata: { toolCall: true }
    };
  }

  private async processDirectResponse(systemPrompt: string, userPrompt: string, mode: ReasoningMode, context?: any): Promise<ReasoningResult> {
    // Fallback basic response
    const response = await this.modelRouter.route(`${systemPrompt}\n\nUser: ${userPrompt}`, {
      maxTokens: this.config.maxTokens || 2000,
      temperature: this.config.temperature || 0.7,
      ...context?.constraints
    });
    return {
      type: 'direct_response',
      content: response.content,
      confidence: response.confidence || 0.75,
      metadata: { tokensUsed: response.tokensUsed }
    };
  }
}
