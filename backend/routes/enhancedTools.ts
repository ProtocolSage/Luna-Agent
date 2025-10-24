/**
 * Enhanced Tools Router - Integrates comprehensive ToolExecutive system
 * Replaces the basic tool router with full pipeline capabilities
 */

import { Router, Request, Response } from "express";
import {
  executeTool,
  executeToolPlan,
  submitPipelineRequest,
  getAvailableTools,
  getToolMetrics,
  getToolExecutive,
  getPipelineService,
} from "../services/enhancedToolExecutor";

const router = Router();

/**
 * Execute a single tool (backward compatibility)
 * POST /api/tools/execute
 */
router.post("/execute", async (req: Request, res: Response): Promise<void> => {
  try {
    const { tool, input, sessionId } = req.body || {};

    if (!tool || typeof tool !== "string") {
      res.status(400).json({
        error: "Missing required parameter",
        message: "tool (string) is required",
      });
      return;
    }

    console.log(
      `🔧 Executing tool: ${tool} for session: ${sessionId || "anonymous"}`,
    );

    const result = await executeTool(tool, input, sessionId);

    if (result.ok) {
      res.json({
        success: true,
        executionId: result.id,
        output: result.output,
        tool,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        executionId: result.id,
        error: result.error,
        tool,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("🚨 Tool execution error:", error);
    res.status(500).json({
      success: false,
      error: "Tool execution failed",
      details: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Execute a complex tool plan with AI orchestration
 * POST /api/tools/plan
 */
router.post("/plan", async (req: Request, res: Response): Promise<void> => {
  try {
    const { request, sessionId, options = {} } = req.body || {};

    if (!request || typeof request !== "string") {
      res.status(400).json({
        error: "Missing required parameter",
        message: "request (string) describing the task is required",
      });
      return;
    }

    if (!sessionId) {
      res.status(400).json({
        error: "Missing required parameter",
        message: "sessionId is required for tool plan execution",
      });
      return;
    }

    console.log(
      `🎯 Executing tool plan: "${request}" for session: ${sessionId}`,
    );

    const result = await executeToolPlan(request, sessionId, options);

    if (result.ok) {
      res.json({
        success: true,
        executionId: result.id,
        result: result.result,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        executionId: result.id,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("🚨 Tool plan execution error:", error);
    res.status(500).json({
      success: false,
      error: "Tool plan execution failed",
      details: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Submit a request to the pipeline service queue
 * POST /api/tools/submit
 */
router.post("/submit", async (req: Request, res: Response): Promise<void> => {
  try {
    const { request, sessionId, options = {} } = req.body || {};

    if (!request || typeof request !== "string") {
      res.status(400).json({
        error: "Missing required parameter",
        message: "request (string) describing the task is required",
      });
      return;
    }

    if (!sessionId) {
      res.status(400).json({
        error: "Missing required parameter",
        message: "sessionId is required for pipeline submission",
      });
      return;
    }

    console.log(
      `📥 Submitting to pipeline: "${request}" for session: ${sessionId}`,
    );

    const result = await submitPipelineRequest(request, sessionId, options);

    if (result.ok) {
      res.json({
        success: true,
        executionId: result.executionId,
        result: result.result,
        queued: !result.result, // If no result, it was queued
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error: any) {
    console.error("🚨 Pipeline submission error:", error);
    res.status(500).json({
      success: false,
      error: "Pipeline submission failed",
      details: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get execution result by ID
 * GET /api/tools/result/:executionId
 */
router.get(
  "/result/:executionId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { executionId } = req.params;

      if (!executionId) {
        res.status(400).json({
          error: "Missing parameter",
          message: "executionId is required",
        });
        return;
      }

      const pipelineService = getPipelineService();
      const result = await pipelineService.getExecutionResult(executionId);

      if (result) {
        res.json({
          success: true,
          executionId,
          result,
          status: "completed",
          timestamp: new Date().toISOString(),
        });
      } else {
        const execStatus = pipelineService.getExecutionStatus(executionId);
        const status = execStatus?.status ?? "not_found";
        res.json({
          success: false,
          executionId,
          status,
          message:
            status === "not_found"
              ? "Execution not found"
              : `Execution is ${status}`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error("🚨 Error getting execution result:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get execution result",
        details: error.message || String(error),
        timestamp: new Date().toISOString(),
      });
    }
  },
);

/**
 * Get list of available tools
 * GET /api/tools/list
 */
router.get("/list", async (req: Request, res: Response): Promise<void> => {
  try {
    const tools = getAvailableTools();

    res.json({
      success: true,
      count: tools.length,
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
      categories: {
        filesystem: tools.filter(
          (t) => t.name.includes("file") || t.name.includes("directory"),
        ).length,
        network: tools.filter(
          (t) =>
            t.name.includes("fetch") ||
            t.name.includes("web") ||
            t.name.includes("scrape"),
        ).length,
        memory: tools.filter((t) => t.name.includes("memory")).length,
        system: tools.filter(
          (t) => t.name.includes("system") || t.name === "status",
        ).length,
        productivity: tools.filter(
          (t) => t.name.includes("goal") || t.name.includes("reminder"),
        ).length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("🚨 Error listing tools:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list tools",
      details: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get tool execution metrics and statistics
 * GET /api/tools/metrics
 */
router.get("/metrics", async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = getToolMetrics();
    const pipelineService = getPipelineService();
    const queueStatus = pipelineService.getQueueStatus();

    res.json({
      success: true,
      metrics,
      queue: queueStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("🚨 Error getting metrics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get metrics",
      details: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Cancel a queued or active execution
 * DELETE /api/tools/cancel/:executionId
 */
router.delete(
  "/cancel/:executionId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { executionId } = req.params;

      if (!executionId) {
        res.status(400).json({
          error: "Missing parameter",
          message: "executionId is required",
        });
        return;
      }

      const pipelineService = getPipelineService();
      const cancelled = pipelineService.cancelExecution(executionId);

      if (cancelled) {
        res.json({
          success: true,
          executionId,
          message: "Execution cancelled successfully",
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          success: false,
          executionId,
          message: "Execution not found or cannot be cancelled",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error("🚨 Error cancelling execution:", error);
      res.status(500).json({
        success: false,
        error: "Failed to cancel execution",
        details: error.message || String(error),
        timestamp: new Date().toISOString(),
      });
    }
  },
);

/**
 * Health check for tool system
 * GET /api/tools/health
 */
router.get("/health", async (req: Request, res: Response): Promise<void> => {
  try {
    const executive = getToolExecutive();
    const toolCount = executive.getToolDefinitions().length;
    const metrics = getToolMetrics();

    res.json({
      success: true,
      status: "healthy",
      toolsAvailable: toolCount,
      activeExecutions: metrics.activeExecutions,
      totalExecutions: metrics.totalExecutions,
      version: "2.0.0-enhanced",
      features: [
        "comprehensive-tool-set",
        "ai-orchestration",
        "parallel-execution",
        "memory-integration",
        "goal-management",
        "reminder-system",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("🚨 Tool system health check failed:", error);
    res.status(500).json({
      success: false,
      status: "unhealthy",
      error: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
