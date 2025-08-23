export interface ToolStep {
    tool: string;
    args: Record<string, any>;
}
export interface ToolResult {
    tool: string;
    success: boolean;
    output?: any;
    error?: string;
    latencyMs: number;
    metadata?: Record<string, any>;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
    handler: (args: Record<string, any>, context: ToolContext) => Promise<any>;
}
export interface ToolContext {
    traceId: string;
    sessionId: string;
    workingDir: string;
    allowlist: string[];
}
export declare class ToolExecutive {
    private tools;
    private policy;
    private goalManager;
    private reminderManager;
    constructor(policy?: any);
    registerTool(def: ToolDefinition): void;
    getToolDefinitions(): ToolDefinition[];
    getToolDefinitionsAsText(): string[];
    executePlan(steps: ToolStep[], traceId: string): Promise<ToolResult[]>;
    private registerAll;
}
