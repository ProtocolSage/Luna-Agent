/**
 * Example usage of the Luna Agent Tool Pipeline System
 *
 * This file demonstrates various ways to use the tool pipeline for
 * automated task execution and reasoning.
 */

import { ToolExecutive } from "../agent/tools/executive";
import { ToolPipeline, PipelineService } from "../agent/pipeline";
import { ReasoningEngine } from "../agent/orchestrator/reasoningEngine";
import { ModelRouter } from "../agent/orchestrator/modelRouter";

// Initialize core components
async function initializePipeline() {
  // Create tool executive with security policy
  const executive = new ToolExecutive({
    allowlist: ["read_file", "write_file", "web_search", "execute_command"],
  });

  // Create model router (you'll need to configure this with your API keys)
  const modelRouter = new ModelRouter({
    models: [
      {
        name: "gpt-4o-2024-08-06",
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "",
        config: { temperature: 0.7, maxTokens: 2000 },
      },
    ],
    fallbackModel: "gpt-4o-2024-08-06",
  });

  return { executive, modelRouter };
}

// Example 1: Direct Pipeline Usage
async function example1_DirectPipelineUsage() {
  console.log("\n=== Example 1: Direct Pipeline Usage ===");

  const { executive, modelRouter } = await initializePipeline();
  const pipeline = new ToolPipeline(executive, modelRouter, {
    maxSteps: 5,
    timeoutMs: 120000,
    allowParallel: true,
    logExecution: true,
  });

  try {
    const result = await pipeline.execute(
      "Check the current time and save it to a file called current_time.txt",
      {
        sessionId: "example_session_1",
        traceId: "direct_pipeline_001",
        workingDir: process.cwd(),
        constraints: [],
        metadata: { example: "direct_usage" },
      },
      {
        autoPlanning: true,
        allowUnsafeTools: false,
      },
    );

    console.log("Pipeline Result:", {
      success: result.success,
      totalTime: result.totalTimeMs,
      stepCount: result.steps.length,
      finalOutput: result.finalOutput,
    });

    if (result.steps.length > 0) {
      console.log("\nExecution Steps:");
      result.steps.forEach((step, i) => {
        console.log(
          `  ${i + 1}. ${step.tool} - ${step.success ? "SUCCESS" : "FAILED"}`,
        );
        if (step.error) console.log(`     Error: ${step.error}`);
      });
    }
  } catch (error) {
    console.error("Pipeline execution failed:", error);
  }
}

// Example 2: Service-Based Queue Management
async function example2_ServiceBasedExecution() {
  console.log("\n=== Example 2: Service-Based Queue Management ===");

  const { executive, modelRouter } = await initializePipeline();
  const service = new PipelineService(executive, modelRouter, {
    maxConcurrentExecutions: 3,
    enableMetrics: true,
  });

  try {
    // Submit multiple requests with different priorities
    const requests = [
      {
        task: "Search for 'TypeScript best practices' and save the results",
        priority: "high" as const,
        id: "high_priority_search",
      },
      {
        task: "List all files in the current directory and count them",
        priority: "normal" as const,
        id: "file_listing",
      },
      {
        task: "Get system information and create a system report",
        priority: "low" as const,
        id: "system_report",
      },
    ];

    const executionIds: string[] = [];

    // Submit all requests
    for (const req of requests) {
      const execId = (await service.submitRequest(
        req.task,
        {
          sessionId: "example_session_2",
          traceId: req.id,
          workingDir: process.cwd(),
          constraints: [],
          metadata: { requestId: req.id, priority: req.priority },
        },
        {
          priority: req.priority,
          waitForCompletion: false,
        },
      )) as string;

      executionIds.push(execId);
      console.log(`Submitted ${req.priority} priority task: ${execId}`);
    }

    // Monitor queue status
    console.log("\nQueue Status:", service.getQueueStatus());

    // Wait for all executions to complete
    console.log("\nWaiting for executions to complete...");

    const results = await Promise.all(
      executionIds.map(async (id) => {
        const result = await service.getExecutionResult(id);
        return { id, result };
      }),
    );

    // Display results
    console.log("\nResults:");
    results.forEach(({ id, result }) => {
      console.log(`\n${id}:`, {
        success: result?.success,
        executionTime: result?.totalTimeMs,
        stepsExecuted: result?.steps.length,
      });
    });

    // Show metrics
    console.log("\nService Metrics:", service.getMetrics());
  } catch (error) {
    console.error("Service execution failed:", error);
  }
}

// Example 3: Reasoning Engine Integration
async function example3_ReasoningIntegration() {
  console.log("\n=== Example 3: Reasoning Engine Integration ===");

  const { executive, modelRouter } = await initializePipeline();

  const reasoningEngine = new ReasoningEngine(
    modelRouter,
    {
      strategy: "react",
      maxSteps: 8,
      maxTokens: 2000,
      temperature: 0.7,
      timeoutMs: 180000,
    },
    executive, // This enables tool pipeline integration
  );

  try {
    const result = await reasoningEngine.reason(
      `You are a helpful AI assistant that can use tools to help users complete tasks. 
       When a user asks you to do something that requires tools, plan and execute the necessary steps.`,

      `I need to create a simple Node.js project. Please:
       1. Create a package.json with basic information
       2. Create an index.js file with a "Hello World" example
       3. Add a README.md with setup instructions
       4. Check that all files were created successfully`,

      {
        sessionId: "reasoning_session",
        userId: "example_user",
        availableTools: [
          "write_file",
          "read_file",
          "list_directory",
          "stat_file",
        ],
        allowCodeExecution: false,
        mode: "react",
        constraints: ["no_unsafe_operations"],
      },
    );

    console.log("Reasoning Result:", {
      type: result.type,
      confidence: result.confidence,
      content: result.content.substring(0, 200) + "...",
    });

    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log("\nTool Executions:");
      result.toolCalls.forEach((call, i) => {
        console.log(
          `  ${i + 1}. ${call.tool} - ${call.success ? "SUCCESS" : "FAILED"} (${call.latencyMs}ms)`,
        );
      });
    }

    if (result.steps && result.steps.length > 0) {
      console.log("\nReasoning Steps:");
      result.steps.forEach((step, i) => {
        console.log(`  Step ${step.step}: ${step.thought}`);
        if (step.action) console.log(`    Action: ${step.action}`);
        if (step.observation)
          console.log(`    Result: ${step.observation.substring(0, 100)}...`);
      });
    }
  } catch (error) {
    console.error("Reasoning execution failed:", error);
  }
}

// Example 4: Advanced Pipeline with Custom Tools
async function example4_AdvancedPipelineUsage() {
  console.log("\n=== Example 4: Advanced Pipeline with Custom Tools ===");

  const { executive, modelRouter } = await initializePipeline();

  // Register a custom tool
  executive.registerTool({
    name: "analyze_code_quality",
    description: "Analyze code quality and provide suggestions",
    parameters: {
      filePath: { type: "string", required: true },
      language: { type: "string", default: "javascript" },
    },
    handler: async (args) => {
      // Simulate code analysis
      const analysis = {
        linesOfCode: Math.floor(Math.random() * 1000) + 100,
        complexityScore: Math.floor(Math.random() * 10) + 1,
        issues: [
          "Consider using const instead of let where appropriate",
          "Add more descriptive variable names",
          "Consider breaking down large functions",
        ],
        grade: "B+",
      };

      return analysis;
    },
  });

  const pipeline = new ToolPipeline(executive, modelRouter, {
    maxSteps: 10,
    allowParallel: true,
    validateResults: true,
  });

  try {
    const result = await pipeline.execute(
      `Analyze the code quality of all TypeScript files in the current directory. 
       Create a summary report and save it as code_analysis_report.md`,
      {
        sessionId: "advanced_session",
        traceId: "advanced_pipeline_001",
        workingDir: process.cwd(),
        constraints: ["allow_file_operations"],
        metadata: {
          analysisType: "code_quality",
          reportFormat: "markdown",
        },
      },
      {
        autoPlanning: true,
        providedSteps: [
          { tool: "list_directory", args: { path: "." } },
          {
            tool: "analyze_code_quality",
            args: { filePath: "example.ts", language: "typescript" },
          },
          {
            tool: "write_file",
            args: {
              path: "code_analysis_report.md",
              content: "Generated report content...",
            },
          },
        ],
      },
    );

    console.log("Advanced Pipeline Result:", {
      success: result.success,
      executionTime: result.totalTimeMs,
      metadata: result.metadata,
    });

    console.log("\nFinal Output:", result.finalOutput);
  } catch (error) {
    console.error("Advanced pipeline execution failed:", error);
  }
}

// Main execution function
async function runExamples() {
  console.log("Luna Agent Tool Pipeline Examples\n");
  console.log(
    "Note: Make sure you have the required environment variables set:",
  );
  console.log("- OPENAI_API_KEY (for model access)");
  console.log("- Any other API keys for tools you want to use\n");

  try {
    await example1_DirectPipelineUsage();
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait between examples

    await example2_ServiceBasedExecution();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await example3_ReasoningIntegration();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await example4_AdvancedPipelineUsage();

    console.log("\n=== All Examples Completed ===");
  } catch (error) {
    console.error("Example execution failed:", error);
  }
}

// Export examples for individual usage
export {
  example1_DirectPipelineUsage,
  example2_ServiceBasedExecution,
  example3_ReasoningIntegration,
  example4_AdvancedPipelineUsage,
  runExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
