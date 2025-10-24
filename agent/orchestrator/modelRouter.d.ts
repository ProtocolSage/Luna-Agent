import {
  LLMResponse,
  ModelConfig,
  CircuitBreakerState,
  ModelMetrics,
} from "../../types";
export declare class ModelRouter {
  private models;
  private circuitBreakers;
  private metrics;
  private rateLimits;
  private circuitBreakerConfigs;
  private readonly MAX_RETRIES;
  private readonly BASE_DELAY;
  private readonly MAX_DELAY;
  private readonly RECENT_REQUESTS_WINDOW;
  private readonly FAILURE_THRESHOLD;
  private readonly RECOVERY_TIMEOUT;
  constructor(models: ModelConfig[]);
  private initializeModels;
  route(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      preferredModel?: string;
      timeout?: number;
    },
  ): Promise<LLMResponse>;
  private getAvailableModels;
  private selectBestModel;
  private callModelWithRetries;
  private callModel;
  private makeAPICall;
  private callOpenAI;
  private callAnthropic;
  private validateAnthropicMessages;
  private convertToAnthropicMessages;
  private callMistral;
  calculateOpenAICost(
    modelName: string,
    usage: {
      prompt_tokens?: number;
      completion_tokens?: number;
    },
  ): number;
  private calculateAnthropicCost;
  private calculateMistralCost;
  /**
   * Call Ollama local LLM server
   * Provides offline operation capability
   */
  private callOllama;
  /**
   * Call Llama.cpp server (local inference)
   * Alternative local LLM option
   */
  private callLlamaCpp;
  /**
   * Check if Ollama server is running and model is available
   */
  private checkOllamaAvailability;
  /**
   * Estimate token count for local models (rough approximation)
   */
  private estimateTokenCount;
  /**
   * Check network connectivity to determine if offline mode should be used
   */
  private isOnline;
  /**
   * Get available models for offline operation
   */
  getOfflineCapableModels(): Promise<ModelConfig[]>;
  /**
   * Automatically route to offline models when network is unavailable
   */
  routeWithOfflineFallback(
    prompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      preferredModel?: string;
      timeout?: number;
    },
  ): Promise<LLMResponse>;
  private isRateLimited;
  private isNonRetryableError;
  private updateCircuitBreakerOnSuccess;
  private updateCircuitBreakerOnFailure;
  private updateMetricsOnSuccess;
  private updateMetricsOnFailure;
  getMetrics(): Record<string, ModelMetrics>;
  getCircuitBreakerStatus(): Record<string, CircuitBreakerState>;
  getTotalCost(): number;
}
