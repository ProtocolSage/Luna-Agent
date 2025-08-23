export interface MemoryDocument {
    id: string;
    content: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    timestamp: string;
    type: 'conversation' | 'document' | 'goal' | 'reminder' | 'journal';
    sessionId?: string;
}
export interface Vector {
    id: string;
    embedding: number[];
}
export interface SearchResult {
    document: MemoryDocument;
    similarity: number;
}
export interface SearchOptions {
    limit?: number;
    threshold?: number;
    type?: string;
    sessionId?: string;
    dateRange?: {
        start: string;
        end: string;
    };
}
export interface ToolContext {
    traceId: string;
    sessionId: string;
    workingDir: string;
    allowlist: string[];
}
export interface ToolResult {
    tool: string;
    success: boolean;
    output?: any;
    error?: string;
    latencyMs: number;
    metadata?: Record<string, any>;
}
export interface LLMResponse {
    id: string;
    content: string;
    tokensUsed: number;
    cost: number;
    /** Optional confidence score from RAG pipeline */
    confidence?: number;
}
export interface TokenUsage {
    input: number;
    output: number;
}
export interface ModelConfig {
    name: string;
    provider: string;
    maxTokens: number;
    temperature: number;
    apiKey?: string;
    endpoint?: string;
    costPer1kTokensIn?: number;
    costPer1kTokensOut?: number;
}
export interface CircuitBreakerState {
    /** "CLOSED" normal, "OPEN" tripped, "HALF_OPEN" probing */
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failures: number;
    lastFailureTime?: number;
    nextAttemptTime?: number;
}
export interface ModelMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCost: number;
}
export interface PIIDetectionResult {
    hasPII: boolean;
    detectedTypes: string[];
    confidence: number;
    sanitizedText?: string;
}
export interface ChatRequest {
    message: string;
    sessionId?: string;
    model?: string;
    context?: Record<string, any>;
}
export interface ChatResponse {
    message: string;
    sessionId: string;
    model: string;
    usage: TokenUsage;
    timestamp: string;
}
