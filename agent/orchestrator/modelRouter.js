"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRouter = void 0;
class ModelRouter {
  constructor(models) {
    this.circuitBreakers = new Map();
    this.metrics = new Map();
    this.rateLimits = new Map();
    this.circuitBreakerConfigs = new Map();
    this.MAX_RETRIES = 3;
    this.BASE_DELAY = 1000;
    this.MAX_DELAY = 10000;
    this.RECENT_REQUESTS_WINDOW = 60000; // 1 minute window for recent requests
    this.FAILURE_THRESHOLD = 5;
    this.RECOVERY_TIMEOUT = 30000;
    this.models = models;
    this.initializeModels();
  }
  initializeModels() {
    this.models.forEach((model) => {
      this.circuitBreakers.set(model.name, {
        state: "CLOSED",
        failures: 0,
        lastFailureTime: 0,
        halfOpenCalls: 0,
        recentRequests: [],
        slowCalls: 0,
      });
      this.metrics.set(model.name, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCost: 0,
      });
      this.rateLimits.set(model.name, {
        count: 0,
        resetTime: Date.now() + 60000,
      });
    });
    console.log(
      `Initialized ${this.models.length} models:`,
      this.models.map((m) => m.name),
    );
  }
  async route(prompt, options = {}) {
    if (this.models.length === 0) {
      throw new Error("No models available. Please check your API keys.");
    }
    const availableModels = this.getAvailableModels();
    if (availableModels.length === 0) {
      throw new Error(
        "All models are currently unavailable due to circuit breaker protection.",
      );
    }
    const selectedModel = this.selectBestModel(
      availableModels,
      options.preferredModel,
    );
    let lastError = null;
    try {
      return await this.callModelWithRetries(selectedModel, prompt, options);
    } catch (error) {
      lastError = error;
      console.warn(`Primary model ${selectedModel.name} failed:`, error);
    }
    const fallbackModels = availableModels.filter(
      (m) => m.name !== selectedModel.name,
    );
    for (const model of fallbackModels) {
      try {
        console.log(`Falling back to model: ${model.name}`);
        return await this.callModelWithRetries(model, prompt, options);
      } catch (error) {
        lastError = error;
        console.warn(`Fallback model ${model.name} failed:`, error);
      }
    }
    throw new Error(
      `All models failed. Last error: ${(lastError === null || lastError === void 0 ? void 0 : lastError.message) || "Unknown error"}`,
    );
  }
  getAvailableModels() {
    return this.models.filter((model) => {
      var _a;
      const breaker = this.circuitBreakers.get(model.name);
      if (!breaker) return false;
      if (breaker.state === "OPEN") {
        const lastFailure =
          (_a = breaker.lastFailureTime) !== null && _a !== void 0 ? _a : 0;
        if (Date.now() - lastFailure > this.RECOVERY_TIMEOUT) {
          breaker.state = "HALF_OPEN";
          console.log(`Circuit breaker for ${model.name} moved to HALF_OPEN`);
        } else {
          return false;
        }
      }
      return !this.isRateLimited(model.name);
    });
  }
  selectBestModel(models, preferredModel) {
    if (preferredModel) {
      const preferred = models.find((m) => m.name === preferredModel);
      if (preferred) return preferred;
    }
    return models.reduce((best, current) => {
      const bestMetrics = this.metrics.get(best.name);
      const currentMetrics = this.metrics.get(current.name);
      if (!bestMetrics || !currentMetrics) return best;
      const bestSuccessRate =
        bestMetrics.totalRequests > 0
          ? bestMetrics.successfulRequests / bestMetrics.totalRequests
          : 1;
      const currentSuccessRate =
        currentMetrics.totalRequests > 0
          ? currentMetrics.successfulRequests / currentMetrics.totalRequests
          : 1;
      if (currentSuccessRate > bestSuccessRate) return current;
      // Note: Latency-based selection removed for TypeScript compliance
      // Can be re-added if averageLatency is needed in ModelMetrics interface
      return best;
    });
  }
  async callModelWithRetries(model, prompt, options) {
    let lastError = null;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const startTime = Date.now();
        const response = await this.callModel(model, prompt, options);
        const latency = Date.now() - startTime;
        this.updateCircuitBreakerOnSuccess(model.name);
        this.updateMetricsOnSuccess(
          model.name,
          response.tokensUsed,
          response.cost,
          latency,
        );
        return response;
      } catch (error) {
        lastError = error;
        this.updateCircuitBreakerOnFailure(model.name);
        this.updateMetricsOnFailure(model.name);
        if (this.isNonRetryableError(error)) {
          throw error;
        }
        if (attempt < this.MAX_RETRIES - 1) {
          const delay = Math.min(
            this.BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000,
            this.MAX_DELAY,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError || new Error("Max retries exceeded");
  }
  async callModel(model, prompt, options) {
    const timeout = options.timeout || 30000;
    return Promise.race([
      this.makeAPICall(model, prompt, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), timeout),
      ),
    ]);
  }
  async makeAPICall(model, prompt, options) {
    switch (model.provider) {
      case "openai":
        return this.callOpenAI(model, prompt, options);
      case "anthropic":
        return this.callAnthropic(model, prompt, options);
      case "mistral":
        return this.callMistral(model, prompt, options);
      case "ollama":
        return this.callOllama(model, prompt, options);
      case "llamacpp":
        return this.callLlamaCpp(model, prompt, options);
      default:
        throw new Error(`Unsupported provider: ${model.provider}`);
    }
  }
  async callOpenAI(model, prompt, options) {
    var _a;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.name,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature || model.temperature || 0.7,
        max_tokens: options.maxTokens || model.maxTokens || 2000,
      }),
    });
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} - ${errorData}`,
      );
    }
    const data = await response.json();
    return {
      id: `openai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: data.choices[0].message.content,
      tokensUsed:
        ((_a = data.usage) === null || _a === void 0
          ? void 0
          : _a.total_tokens) || 0,
      cost: this.calculateOpenAICost(model.name, data.usage),
      confidence: 0.9,
    };
  }
  async callAnthropic(model, prompt, options) {
    var _a, _b;
    // Handle message history if provided, otherwise create simple message
    let messages = [];
    if (options.messages && Array.isArray(options.messages)) {
      // Use provided message history and validate it
      messages = this.validateAnthropicMessages(options.messages);
    } else if (
      options.conversationHistory &&
      Array.isArray(options.conversationHistory)
    ) {
      // Convert conversation history to Anthropic format
      messages = this.convertToAnthropicMessages(options.conversationHistory);
    } else {
      // Simple single message
      messages = [{ role: "user", content: prompt }];
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model.name,
        max_tokens: options.maxTokens || model.maxTokens || 2000,
        messages: messages,
        temperature: options.temperature || model.temperature || 0.7,
      }),
    });
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Anthropic API error: ${response.status} ${response.statusText} - ${errorData}`,
      );
    }
    const data = await response.json();
    return {
      id: `anthropic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: data.content[0].text,
      tokensUsed:
        (((_a = data.usage) === null || _a === void 0
          ? void 0
          : _a.input_tokens) || 0) +
        (((_b = data.usage) === null || _b === void 0
          ? void 0
          : _b.output_tokens) || 0),
      cost: this.calculateAnthropicCost(model.name, data.usage),
      confidence: 0.9,
    };
  }
  validateAnthropicMessages(messages) {
    const validated = [];
    let pendingToolUse = null;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // Check if this message contains tool_use blocks
      if (msg.role === "assistant" && msg.content) {
        const hasToolUse =
          Array.isArray(msg.content) &&
          msg.content.some((c) => c.type === "tool_use");
        if (hasToolUse) {
          validated.push(msg);
          pendingToolUse = msg.content.find((c) => c.type === "tool_use");
          // Check if next message has the corresponding tool_result
          if (i + 1 < messages.length) {
            const nextMsg = messages[i + 1];
            if (nextMsg.role === "user" && nextMsg.content) {
              const hasToolResult =
                Array.isArray(nextMsg.content) &&
                nextMsg.content.some((c) => c.type === "tool_result");
              if (!hasToolResult && pendingToolUse) {
                // Insert a synthetic tool_result to fix the structure
                validated.push({
                  role: "user",
                  content: [
                    {
                      type: "tool_result",
                      tool_use_id: pendingToolUse.id,
                      content: "Tool execution skipped or failed",
                    },
                  ],
                });
              }
            } else if (pendingToolUse) {
              // No user message follows, add synthetic tool_result
              validated.push({
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: pendingToolUse.id,
                    content: "Tool execution skipped or failed",
                  },
                ],
              });
            }
            pendingToolUse = null;
          } else if (pendingToolUse) {
            // Last message has tool_use, add synthetic tool_result
            validated.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: pendingToolUse.id,
                  content: "Tool execution skipped or failed",
                },
              ],
            });
            pendingToolUse = null;
          }
        } else {
          validated.push(msg);
        }
      } else {
        validated.push(msg);
      }
    }
    return validated;
  }
  convertToAnthropicMessages(history) {
    // Convert a generic conversation history to Anthropic format
    const messages = [];
    for (const item of history) {
      if (item.role && item.content) {
        messages.push({
          role: item.role === "system" ? "assistant" : item.role,
          content:
            typeof item.content === "string"
              ? item.content
              : JSON.stringify(item.content),
        });
      }
    }
    // Ensure we end with a user message if needed
    if (
      messages.length === 0 ||
      messages[messages.length - 1].role !== "user"
    ) {
      messages.push({ role: "user", content: "Continue" });
    }
    return this.validateAnthropicMessages(messages);
  }
  async callMistral(model, prompt, options) {
    var _a;
    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.name,
        messages: [{ role: "user", content: prompt }],
        temperature: options.temperature || model.temperature || 0.7,
        max_tokens: options.maxTokens || model.maxTokens || 2000,
      }),
    });
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `Mistral API error: ${response.status} ${response.statusText} - ${errorData}`,
      );
    }
    const data = await response.json();
    return {
      id: `mistral-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: data.choices[0].message.content,
      tokensUsed:
        ((_a = data.usage) === null || _a === void 0
          ? void 0
          : _a.total_tokens) || 0,
      cost: this.calculateMistralCost(model.name, data.usage),
      confidence: 0.9,
    };
  }
  calculateOpenAICost(modelName, usage) {
    if (!usage) return 0;
    const pricing = {
      "gpt-4o-2024-08-06": { input: 0.0025, output: 0.01 },
      "gpt-4o": { input: 0.005, output: 0.015 },
      "gpt-4": { input: 0.03, output: 0.06 },
      "gpt-3.5-turbo": { input: 0.0015, output: 0.002 },
    };
    const modelPricing = pricing[modelName] || pricing["gpt-3.5-turbo"];
    return (
      ((usage.prompt_tokens || 0) / 1000) * modelPricing.input +
      ((usage.completion_tokens || 0) / 1000) * modelPricing.output
    );
  }
  calculateAnthropicCost(modelName, usage) {
    if (!usage) return 0;
    const pricing = {
      "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
      "claude-3-sonnet-20240229": { input: 0.003, output: 0.015 },
      "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
    };
    const modelPricing =
      pricing[modelName] || pricing["claude-3-haiku-20240307"];
    return (
      ((usage.input_tokens || 0) / 1000) * modelPricing.input +
      ((usage.output_tokens || 0) / 1000) * modelPricing.output
    );
  }
  calculateMistralCost(modelName, usage) {
    if (!usage) return 0;
    const pricing = {
      "mistral-large-latest": { input: 0.008, output: 0.024 },
      "mistral-medium-latest": { input: 0.0027, output: 0.0081 },
      "mistral-small-latest": { input: 0.002, output: 0.006 },
    };
    const modelPricing = pricing[modelName] || pricing["mistral-small-latest"];
    return (
      ((usage.prompt_tokens || 0) / 1000) * modelPricing.input +
      ((usage.completion_tokens || 0) / 1000) * modelPricing.output
    );
  }
  /**
   * Call Ollama local LLM server
   * Provides offline operation capability
   */
  async callOllama(model, prompt, options) {
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    // First, check if Ollama server is running and model is available
    try {
      await this.checkOllamaAvailability(model.name, ollamaUrl);
    } catch (error) {
      console.warn(
        `[ModelRouter] Ollama model ${model.name} not available:`,
        error,
      );
      throw new Error(
        `Ollama model ${model.name} is not available. Please ensure Ollama is running and model is installed.`,
      );
    }
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.name,
        prompt: prompt,
        options: {
          temperature: options.temperature || model.temperature || 0.7,
          num_predict: options.maxTokens || model.maxTokens || 2000,
          top_k: 40,
          top_p: 0.9,
          repeat_penalty: 1.1,
        },
        stream: false,
      }),
      signal: AbortSignal.timeout(options.timeout || 30000),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    const data = await response.json();
    return {
      id: `ollama-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: data.response,
      tokensUsed:
        this.estimateTokenCount(prompt) +
        this.estimateTokenCount(data.response),
      cost: 0, // Local inference is free
      confidence: 0.8,
    };
  }
  /**
   * Call Llama.cpp server (local inference)
   * Alternative local LLM option
   */
  async callLlamaCpp(model, prompt, options) {
    const llamaCppUrl =
      process.env.LLAMACPP_BASE_URL || "http://localhost:8080";
    try {
      // Check if server is available
      const healthResponse = await fetch(`${llamaCppUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!healthResponse.ok) {
        throw new Error("Llama.cpp server not available");
      }
    } catch (error) {
      throw new Error(
        `Llama.cpp server is not available at ${llamaCppUrl}. Please ensure the server is running.`,
      );
    }
    const response = await fetch(`${llamaCppUrl}/completion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt,
        temperature: options.temperature || model.temperature || 0.7,
        n_predict: options.maxTokens || model.maxTokens || 2000,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.1,
        stop: ["\n\nUser:", "\n\nAssistant:", "###"],
      }),
      signal: AbortSignal.timeout(options.timeout || 30000),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Llama.cpp API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }
    const data = await response.json();
    return {
      id: `llamacpp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content: data.content,
      tokensUsed:
        data.tokens_predicted ||
        this.estimateTokenCount(prompt) + this.estimateTokenCount(data.content),
      cost: 0, // Local inference is free
      confidence: 0.8,
    };
  }
  /**
   * Check if Ollama server is running and model is available
   */
  async checkOllamaAvailability(modelName, baseUrl) {
    // Check if server is running
    const healthResponse = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthResponse.ok) {
      throw new Error("Ollama server not responding");
    }
    const modelsData = await healthResponse.json();
    const availableModels = modelsData.models || [];
    const modelExists = availableModels.some(
      (model) =>
        model.name === modelName || model.name.startsWith(modelName + ":"),
    );
    if (!modelExists) {
      throw new Error(
        `Model ${modelName} not found. Available models: ${availableModels.map((m) => m.name).join(", ")}`,
      );
    }
  }
  /**
   * Estimate token count for local models (rough approximation)
   */
  estimateTokenCount(text) {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }
  /**
   * Check network connectivity to determine if offline mode should be used
   */
  async isOnline() {
    try {
      // Try to reach a reliable endpoint
      const response = await fetch("https://www.google.com/favicon.ico", {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  /**
   * Get available models for offline operation
   */
  async getOfflineCapableModels() {
    const offlineModels = [];
    for (const model of this.models) {
      if (model.provider === "ollama") {
        try {
          const ollamaUrl =
            process.env.OLLAMA_BASE_URL || "http://localhost:11434";
          await this.checkOllamaAvailability(model.name, ollamaUrl);
          offlineModels.push(model);
        } catch {
          // Model not available offline
        }
      } else if (model.provider === "llamacpp") {
        try {
          const llamaCppUrl =
            process.env.LLAMACPP_BASE_URL || "http://localhost:8080";
          const healthResponse = await fetch(`${llamaCppUrl}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          if (healthResponse.ok) {
            offlineModels.push(model);
          }
        } catch {
          // Server not available
        }
      }
    }
    return offlineModels;
  }
  /**
   * Automatically route to offline models when network is unavailable
   */
  async routeWithOfflineFallback(prompt, options = {}) {
    const isOnline = await this.isOnline();
    if (!isOnline) {
      console.log(
        "[ModelRouter] Network unavailable, using offline models only",
      );
      const offlineModels = await this.getOfflineCapableModels();
      if (offlineModels.length === 0) {
        throw new Error(
          "No offline models available. Please install Ollama or Llama.cpp with models.",
        );
      }
      // Temporarily switch to offline-only models
      const originalModels = this.models;
      this.models = offlineModels;
      try {
        return await this.route(prompt, options);
      } finally {
        this.models = originalModels;
      }
    }
    // Normal online routing with offline fallback
    try {
      return await this.route(prompt, options);
    } catch (error) {
      console.warn(
        "[ModelRouter] Online models failed, trying offline fallback:",
        error,
      );
      const offlineModels = await this.getOfflineCapableModels();
      if (offlineModels.length > 0) {
        const originalModels = this.models;
        this.models = offlineModels;
        try {
          return await this.route(prompt, options);
        } finally {
          this.models = originalModels;
        }
      }
      throw error;
    }
  }
  isRateLimited(modelName) {
    const limit = this.rateLimits.get(modelName);
    if (!limit) return false;
    const now = Date.now();
    if (now > limit.resetTime) {
      limit.count = 0;
      limit.resetTime = now + 60000;
    }
    return limit.count >= 60;
  }
  isNonRetryableError(error) {
    if (!(error === null || error === void 0 ? void 0 : error.message))
      return false;
    const message = error.message.toLowerCase();
    return (
      message.includes("401") ||
      message.includes("403") ||
      message.includes("invalid_api_key") ||
      message.includes("quota_exceeded") ||
      message.includes("content_policy_violation")
    );
  }
  updateCircuitBreakerOnSuccess(modelName) {
    const breaker = this.circuitBreakers.get(modelName);
    if (breaker) {
      breaker.failures = 0;
      breaker.state = "CLOSED";
    }
  }
  updateCircuitBreakerOnFailure(modelName) {
    const breaker = this.circuitBreakers.get(modelName);
    if (breaker) {
      breaker.failures++;
      breaker.lastFailureTime = Date.now();
      if (breaker.failures >= this.FAILURE_THRESHOLD) {
        breaker.state = "OPEN";
        console.warn(
          `Circuit breaker OPENED for model ${modelName} after ${breaker.failures} failures`,
        );
      }
    }
  }
  updateMetricsOnSuccess(modelName, tokensUsed, cost, latency) {
    const metrics = this.metrics.get(modelName);
    if (metrics) {
      metrics.totalRequests++;
      metrics.successfulRequests++;
      // Distribute total tokens between input/output (assuming 60/40 split for estimation)
      const estimatedInput = Math.floor(tokensUsed * 0.6);
      const estimatedOutput = tokensUsed - estimatedInput;
      metrics.totalTokensIn += estimatedInput;
      metrics.totalTokensOut += estimatedOutput;
      metrics.totalCost += cost;
      // Note: averageLatency and lastUsed tracking removed for TypeScript compliance
      // Can be re-added if these properties are needed in ModelMetrics interface
    }
  }
  updateMetricsOnFailure(modelName) {
    const metrics = this.metrics.get(modelName);
    if (metrics) {
      metrics.totalRequests++;
      metrics.failedRequests++;
    }
  }
  getMetrics() {
    const result = {};
    this.metrics.forEach((metrics, modelName) => {
      result[modelName] = { ...metrics };
    });
    return result;
  }
  getCircuitBreakerStatus() {
    const result = {};
    this.circuitBreakers.forEach((state, modelName) => {
      result[modelName] = { ...state };
    });
    return result;
  }
  getTotalCost() {
    let total = 0;
    this.metrics.forEach((metrics) => {
      total += metrics.totalCost;
    });
    return total;
  }
}
exports.ModelRouter = ModelRouter;
