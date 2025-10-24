import { Router, Request, Response } from "express";

const router = Router();

/**
 * Public voice diagnostic endpoints - no authentication required
 * These endpoints are used by the UI for health checks and don't expose sensitive data
 */

// Voice system health check
router.get("/health", (req: Request, res: Response) => {
  try {
    const healthStatus = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        streaming: "available",
        websocket: "available",
        openai: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
      },
      endpoints: {
        websocket: "/ws/voice/stream",
        streaming: "/api/voice/streaming",
      },
    };

    res.json(healthStatus);
  } catch (error) {
    console.error("[PublicVoiceDiagnostics] Health check error:", error);
    res.status(500).json({
      status: "error",
      message: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Voice system status check
router.get("/status", (req: Request, res: Response) => {
  try {
    const systemStatus = {
      streaming_available: true,
      websocket_path: "/ws/voice/stream",
      features: [
        "real_time_streaming",
        "voice_activity_detection",
        "echo_cancellation",
        "interrupt_handling",
        "continuous_mode",
      ],
      timestamp: new Date().toISOString(),
    };

    res.json(systemStatus);
  } catch (error) {
    console.error("[PublicVoiceDiagnostics] Status check error:", error);
    res.status(500).json({
      status: "error",
      message: "Status check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Voice capabilities endpoint
router.get("/capabilities", (req: Request, res: Response) => {
  try {
    const capabilities = {
      stt: {
        provider: "openai_realtime",
        real_time: true,
        languages: ["en-US"],
        formats: ["pcm16", "webm"],
      },
      tts: {
        provider: "openai_realtime",
        real_time: true,
        streaming: true,
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
      },
      features: {
        vad: true,
        echo_cancellation: true,
        noise_suppression: true,
        interrupt_detection: true,
        continuous_conversation: true,
      },
      latency: {
        target: "<200ms",
        optimized_for: "real_time_conversation",
      },
    };

    res.json(capabilities);
  } catch (error) {
    console.error("[PublicVoiceDiagnostics] Capabilities check error:", error);
    res.status(500).json({
      status: "error",
      message: "Capabilities check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
