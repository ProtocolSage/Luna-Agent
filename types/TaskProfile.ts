// Task Profile Types
export interface TaskProfile {
  id: string;
  name: string;
  description: string;
  slo: SLOConfig;
  reasoning: ReasoningConfig;
  policy: PolicyConfig;
  evolution: EvolutionConfig;
  models: ModelConfig[];
}

export interface SLOConfig {
  maxLatencyMs: number;
  minAccuracy: number;
  maxCostPerRequest: number;
  availabilityTarget: number;
}

export interface ReasoningConfig {
  strategy: 'react' | 'cot' | 'tot' | 'reflexion';
  maxSteps: number;
  maxTokens: number;
  selfReflection: boolean;
  multipleHypotheses: boolean;
  consistencyChecks: boolean;
  temperature: number;
  topP: number;
}

export interface PolicyConfig {
  maxInputLength: number;
  blockPII: boolean;
  blockPromptInjection: boolean;
  blockPIIInOutput: boolean;
  mfaEnabled: boolean;
  strictMode: boolean;
  allowedTools?: string[];
  allowlist?: string[];
  allowFileSystemAccess?: boolean;
  allowNetworkAccess?: boolean;
  rateLimits?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    costPerMinute: number;
  };
}

export interface EvolutionConfig {
  enabled: boolean;
  learningRate: number;
  adaptationThreshold: number;
  memoryRetention: number;
  feedbackWeight: number;
}

export interface ModelConfig {
  name: string;
  provider: 'openai' | 'anthropic' | 'mistral' | 'local';
  temperature: number;
  maxTokens: number;
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
  metadata?: Record<string, any>;
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

// Tool Types
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: (args: any, context: ToolContext) => Promise<any>;
  requiresMFA?: boolean;
  allowedScopes?: string[];
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: any[];
  default?: any;
}

export interface ToolContext {
  traceId: string;
  sessionId: string;
  workingDir: string;
  allowlist: string[];
  rateLimits: Map<string, number>;
}

export interface ToolStep {
  tool: string;
  args: Record<string, any>;
  reasoning?: string;
  required?: boolean;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  output?: any;
  error?: string;
  latencyMs: number;
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  sanitizedInput?: string;
  confidence: number;
  piiDetection?: {
    hasPII: boolean;
    detectedTypes: string[];
    redactedText?: string;
  };
  injectionDetection?: {
    isInjection: boolean;
    detectedTechniques: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    sanitizedText?: string;
  };
}

// LLM Response Types
export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: TokenUsage;
  cost: number;
  confidence: number;
  finishReason?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

// Agent Response Types
export interface AgentResponse {
  success: boolean;
  content?: string;
  error?: string;
  model?: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  confidence?: number;
  sessionId: string;
  traceId?: string;
  securityViolation?: boolean;
  toolResults?: ToolResult[];
  metadata?: Record<string, any>;
}

// Chat Types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface ChatContext {
  sessionId: string;
  userId?: string;
  history?: ChatMessage[];
  preferences?: Record<string, any>;
  constraints?: Record<string, any>;
}

// Health Check Types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  components: Record<string, ComponentHealth>;
  details?: Record<string, any>;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  details?: any;
  error?: string;
}

