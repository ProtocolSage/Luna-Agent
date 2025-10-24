# Luna Agent Tool Pipeline System

A comprehensive tool execution pipeline that enables the Luna Agent to automatically plan, execute, and manage complex multi-step tasks using a variety of tools.

## Overview

The Tool Pipeline System consists of three main components:

1. **ToolPipeline**: Core execution engine
2. **PipelineService**: Service layer for queue management and concurrency
3. **Integration with ReasoningEngine**: Seamless AI-driven tool usage

## Key Features

- 🤖 **Automatic Tool Planning**: Uses LLM to automatically plan execution steps
- ⚡ **Parallel Execution**: Executes independent tools simultaneously for better performance
- 🔒 **Security Validation**: Enforces constraints and validates tool safety
- 🔄 **Retry Logic**: Handles failures with intelligent retry mechanisms
- 📊 **Metrics & Monitoring**: Comprehensive execution metrics and logging
- 🧠 **Memory Integration**: Stores execution history for learning and debugging
- 🎯 **Dependency Management**: Handles tool dependencies and execution order

## Quick Start

### Basic Usage

```typescript
import { ToolExecutive } from "../tools/executive";
import { ToolPipeline } from "../pipeline";
import { ModelRouter } from "../orchestrator/modelRouter";

// Initialize components
const executive = new ToolExecutive();
const modelRouter = new ModelRouter(/* config */);
const pipeline = new ToolPipeline(executive, modelRouter);

// Execute a task
const result = await pipeline.execute(
  "Check system status and create a report",
  {
    sessionId: "user_session",
    traceId: "task_001",
    workingDir: process.cwd(),
    constraints: [],
    metadata: {},
  },
);

console.log("Task completed:", result.success);
console.log("Steps executed:", result.steps.length);
console.log("Final output:", result.finalOutput);
```

### Service-Based Usage

```typescript
import { PipelineService } from "../pipeline";

const service = new PipelineService(executive, modelRouter);

// Submit task for execution
const executionId = await service.submitRequest(
  "Analyze project structure and generate documentation",
  { sessionId: "docs_generation" },
  { priority: "high", waitForCompletion: false },
);

// Check status
const status = service.getExecutionStatus(executionId);
console.log("Execution status:", status);

// Get result when complete
const result = await service.getExecutionResult(executionId);
```

### Reasoning Engine Integration

```typescript
import { ReasoningEngine } from "../orchestrator/reasoningEngine";

const reasoningEngine = new ReasoningEngine(modelRouter, config, executive);

const result = await reasoningEngine.reason(
  systemPrompt,
  "Help me set up a new React project with TypeScript",
  {
    availableTools: ["write_file", "execute_command", "web_search"],
    allowCodeExecution: true,
    mode: "react",
  },
);
```

## Available Tools

The ToolExecutive comes with a comprehensive set of built-in tools:

### File System Tools

- `read_file` - Read file contents
- `write_file` - Write content to file
- `append_file` - Append content to file
- `copy_file` - Copy files
- `move_file` - Move/rename files
- `delete_file` - Delete files
- `list_directory` - List directory contents
- `stat_file` - Get file statistics

### Network & Web Tools

- `fetch_url` - Fetch content from URLs
- `download_file` - Download files from URLs
- `upload_file` - Upload files to URLs
- `web_search` - DuckDuckGo web search
- `scrape_text` - Extract text from web pages
- `scrape_links` - Extract links from web pages

### Code Execution Tools

- `execute_command` - Run shell commands
- `execute_python` - Execute Python scripts
- `execute_javascript` - Execute JavaScript code

### System Tools

- `get_system_info` - Get system information
- `status` - Get comprehensive system status
- `get_time` - Get current time
- `sleep` - Wait for specified duration

### Memory & Knowledge Tools

- `add_memory` - Store information in memory
- `search_memory` - Search stored memories
- `get_memory` - Retrieve specific memories
- `update_memory` - Modify existing memories
- `delete_memory` - Remove memories

### Desktop Automation (Windows)

- `desktop_screenshot` - Take screenshots
- `list_windows` - List open windows
- `focus_window` - Focus specific windows

### Clipboard Tools

- `clipboard_read` - Read clipboard content
- `clipboard_write` - Write to clipboard

## Configuration

### Pipeline Configuration

```typescript
interface PipelineConfig {
  maxSteps: number; // Maximum execution steps (default: 10)
  timeoutMs: number; // Execution timeout (default: 300000)
  allowParallel: boolean; // Enable parallel execution (default: true)
  retryCount: number; // Retry attempts for failed steps (default: 2)
  validateResults: boolean; // Validate step results (default: true)
  logExecution: boolean; // Log execution details (default: true)
}
```

### Service Configuration

```typescript
interface PipelineServiceConfig {
  maxConcurrentExecutions: number; // Max parallel executions (default: 5)
  defaultTimeout: number; // Default timeout (default: 300000)
  enableMetrics: boolean; // Enable metrics collection (default: true)
  autoCleanupInterval: number; // Cleanup interval (default: 3600000)
}
```

### Security Constraints

You can enforce security constraints on pipeline execution:

```typescript
const context = {
  sessionId: "secure_session",
  constraints: [
    "allow_code_execution", // Allow code execution tools
    "allow_unsafe_tools", // Allow potentially unsafe tools
    "allow_file_operations", // Allow file system operations
    "no_network_access", // Disable network tools
  ],
  // ...
};
```

## Advanced Features

### Custom Tool Registration

```typescript
executive.registerTool({
  name: "custom_analysis",
  description: "Perform custom data analysis",
  parameters: {
    data: { type: "string", required: true },
    method: { type: "string", default: "standard" },
  },
  handler: async (args, context) => {
    // Your custom tool implementation
    return { result: "analysis complete" };
  },
});
```

### Execution Monitoring

```typescript
service.on("requestQueued", (event) => {
  console.log("Request queued:", event.id);
});

service.on("executionStarted", (event) => {
  console.log("Execution started:", event.id);
});

service.on("executionCompleted", (event) => {
  console.log("Execution completed:", event.id, event.result.success);
});

service.on("executionFailed", (event) => {
  console.log("Execution failed:", event.id, event.error);
});
```

### Metrics Collection

```typescript
const metrics = service.getMetrics();
console.log("Pipeline Metrics:", {
  totalExecutions: metrics.totalExecutions,
  successRate: metrics.successfulExecutions / metrics.totalExecutions,
  averageTime: metrics.averageExecutionTime,
  toolUsage: metrics.toolUsageStats,
});
```

## Error Handling

The pipeline system includes comprehensive error handling:

- **Tool Failures**: Individual tool failures don't stop the entire pipeline
- **Timeouts**: Configurable timeouts with automatic cleanup
- **Retry Logic**: Automatic retries with exponential backoff
- **Validation**: Result validation to catch issues early
- **Graceful Degradation**: Fallback mechanisms when tools are unavailable

## Best Practices

### 1. Security First

- Always validate user inputs before execution
- Use appropriate constraints for different contexts
- Regularly audit available tools and permissions

### 2. Performance Optimization

- Enable parallel execution for independent tasks
- Set appropriate timeouts for different task types
- Use priority queues for better resource allocation

### 3. Monitoring and Debugging

- Enable execution logging for development
- Monitor metrics in production
- Store execution history for analysis

### 4. Resource Management

- Set reasonable concurrency limits
- Implement proper cleanup procedures
- Monitor memory usage for long-running services

## Examples

See the complete examples in `/examples/pipeline-usage.ts` which demonstrate:

1. Direct pipeline usage
2. Service-based queue management
3. Reasoning engine integration
4. Advanced features with custom tools

## API Reference

### ToolPipeline

- `execute(request, context, options)` - Execute a task
- `abortExecution(traceId)` - Abort running execution
- `getActiveExecutions()` - Get active execution IDs

### PipelineService

- `submitRequest(request, context, options)` - Submit execution request
- `getExecutionResult(executionId)` - Get execution result
- `getExecutionStatus(executionId)` - Get execution status
- `cancelExecution(executionId)` - Cancel execution
- `getMetrics()` - Get service metrics
- `getQueueStatus()` - Get queue information
- `shutdown(timeout?)` - Graceful shutdown

### ReasoningEngine (with Pipeline Integration)

- `reason(systemPrompt, userPrompt, context)` - Reason with tool usage
- `getPipelineMetrics()` - Get pipeline metrics
- `getPipelineQueueStatus()` - Get pipeline queue status
- `shutdown()` - Shutdown pipeline service

## Contributing

When adding new tools or features to the pipeline system:

1. Follow the existing tool interface patterns
2. Include comprehensive error handling
3. Add appropriate security validations
4. Include usage examples and tests
5. Update documentation

## License

This pipeline system is part of the Luna Agent project and follows the same licensing terms.
