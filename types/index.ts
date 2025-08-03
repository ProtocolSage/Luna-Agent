// Core Types
export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: TokenUsage;
  cost: number;
  confidence: number;
  finishReason: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface ModelConfig {
  name: string;
  provider: 'openai' | 'anthropic' | 'mistral';
  temperature?: number;
  maxTokens?: number;
  costPer1kTokensIn?: number;
  costPer1kTokensOut?: number;
}

// Memory Types
export interface MemoryDocument {
  id: string;
  content: string;
  type: 'conversation' | 'document' | 'context' | 'preference';
  sessionId?: string;
  userId?: string;
  timestamp: string;
  tags?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface MemoryQuery {
  query: string;
  type?: string;
  sessionId?: string;
  userId?: string;
  limit?: number;
  threshold?: number;
}

// Security Types
export interface PIIDetectionResult {
  hasPII: boolean;
  piiTypes: string[];
  confidence: number;
  redactedText: string;
}

export interface InjectionDetectionResult {
  isInjection: boolean;
  confidence: number;
  patterns: string[];
  sanitizedText: string;
}

// Circuit Breaker Types
export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime: number;
}

export interface ModelMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
  averageLatency: number;
  lastUsed: number;
}

// Configuration Types
export interface AgentConfig {
  models: ModelConfig[];
  security: {
    enablePIIDetection: boolean;
    enableInjectionDetection: boolean;
    maxInputLength: number;
  };
  memory: {
    maxDocuments: number;
    vectorDimensions: number;
  };
  telemetry: {
    enabled: boolean;
    exporters: string[];
  };
}

// API Types
export interface ChatRequest {
  message: string;
  sessionId?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  model: string;
  tokensUsed: TokenUsage;
  cost: number;
}

// Vector Store Types
export interface VectorSearchResult {
  document: MemoryDocument;
  similarity: number;
  distance: number;
}

export interface EmbeddingResponse {
  embedding: number[];
  tokens: number;
  cost: number;
}

// Session Types
export interface SessionData {
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
  messageCount: number;
  userPreferences: string;
  contextVariables: string;
  temporaryData: string;
}

