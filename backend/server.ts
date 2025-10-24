// Load module aliases for runtime path resolution
import "module-alias/register";

// Load environment variables first, before any other imports
import dotenv from "dotenv";
import fs from "fs";

const DEV = process.env.NODE_ENV !== "production";
// In dev, let .env override OS envs; in prod, never override
dotenv.config({ override: DEV });

// Fail fast on placeholder/missing key (before starting server)
const badKey =
  !process.env.OPENAI_API_KEY ||
  /(^your_api_key$|^sk-?live-?placeholder)/i.test(process.env.OPENAI_API_KEY);

if (badKey) {
  console.error(
    "[FATAL] OPENAI_API_KEY is missing or placeholder. Check .env or secrets.",
  );
  process.exit(1);
}

// Debug: Log loaded OpenAI API key
const shown = (process.env.OPENAI_API_KEY || "").slice(0, 7) + "…";
console.log("[ENV] OPENAI_API_KEY loaded:", shown);

// Optionally load .env.local if present (overrides default .env)
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local", override: true });
}

// Load File polyfill before any other imports
if (typeof globalThis.File === "undefined") {
  const { Blob } = require("buffer");

  class File extends Blob {
    public name: string;
    public lastModified: number;

    constructor(
      chunks: BlobPart[],
      filename: string,
      options: FilePropertyBag = {},
    ) {
      super(chunks, options);
      this.name = filename;
      this.lastModified = options.lastModified || Date.now();
    }
  }

  (globalThis as any).File = File;
  if (typeof global !== "undefined") (global as any).File = File;
}

import express, { Request, Response, NextFunction } from "express";
import type { Response as ExpressResponse } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { readSessionId } from "./helpers/session";
import compression from "compression";
import authRoutes from "./routes/auth";
// import securityRoutes from './routes/security'; // Temporarily disabled
import { ModelRouter } from "@agent/orchestrator/modelRouter";
import { PIIFilter } from "@agent/validators/piiFilter";
import { ChatRequest, ChatResponse, ModelConfig } from "../types";
import { createAgentRouter } from "./routes/agent";
import voiceRouter from "./routes/voice";
import streamingVoiceRouter, {
  initializeVoiceWebSocket,
} from "./routes/streamingVoice";
import publicVoiceDiagnosticsRouter from "./routes/publicVoiceDiagnostics";
import memoryRoutes from "./routes/memory";
import toolsRoutes from "./routes/tools";
import { getDatabaseService } from "./DatabaseService";
import { SecurityService } from "./utils/SecurityService";
// import { securityInitializer } from './services/SecurityInitializer'; // Temporarily disabled
import { execSync } from "child_process";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// Import AI SDKs with graceful fallback
let OpenAI: any = null;
let Anthropic: any = null;

try {
  OpenAI = require("openai");
} catch (error) {
  console.warn("OpenAI SDK not installed. Install with: npm install openai");
}

try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (error) {
  console.warn(
    "Anthropic SDK not installed. Install with: npm install @anthropic-ai/sdk",
  );
}

// Load environment variables - already loaded at the top of the file

// For Windows: Force load system environment variables if not already loaded
if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
  try {
    const openaiKey = execSync(
      "powershell -Command \"[Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User')\"",
      { encoding: "utf8" },
    ).trim();
    const anthropicKey = execSync(
      "powershell -Command \"[Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User')\"",
      { encoding: "utf8" },
    ).trim();

    if (openaiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = openaiKey;
    }
    if (anthropicKey && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = anthropicKey;
    }
  } catch (error) {
    console.warn("Could not load system environment variables:", error);
  }
}

// Debug: confirm provider key presence at startup
console.log("[config] OPENAI_API_KEY set?", !!process.env.OPENAI_API_KEY);

// Generate JWT secret if not provided
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const API_VERSION = "v1";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    sessionId: string;
    permissions: string[];
  };
  sessionId?: string;
  clientIP?: string;
}

/**
 * Production-ready Express server with comprehensive security
 * Features: Authentication, Rate limiting, Input validation, CORS, Compression
 */
class SecureExpressServer {
  private app: express.Application;
  private securityService: SecurityService;
  private databaseService: any;
  private modelRouter!: ModelRouter;
  private piiFilter!: PIIFilter;
  private openai: any;
  private anthropic: any;
  private port: number;
  private server: any;
  private voiceWebSocketServer: any;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || "3000", 10); // Ensure PORT is respected
    this.securityService = new SecurityService();
    this.databaseService = getDatabaseService();

    // Initialize AI providers
    this.initializeAIProviders();
    this.initializeComponents();
  }

  private initializeAIProviders(): void {
    this.openai =
      process.env.OPENAI_API_KEY && OpenAI
        ? new OpenAI.default({ apiKey: process.env.OPENAI_API_KEY })
        : null;

    this.anthropic =
      process.env.ANTHROPIC_API_KEY && Anthropic
        ? new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
        : null;
  }

  private initializeComponents(): void {
    // Initialize model configurations
    const models: ModelConfig[] = [];

    if (process.env.OPENAI_API_KEY) {
      models.push({
        name: "gpt-4o-2024-08-06",
        provider: "openai",
        temperature: 0.7,
        maxTokens: 2000,
        costPer1kTokensIn: 0.0025,
        costPer1kTokensOut: 0.01,
      });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      models.push({
        name: "claude-3-sonnet-20240229",
        provider: "anthropic",
        temperature: 0.7,
        maxTokens: 2000,
        costPer1kTokensIn: 0.003,
        costPer1kTokensOut: 0.015,
      });
    }

    this.modelRouter = new ModelRouter(models);
    this.piiFilter = new PIIFilter();
  }

  public async initialize(): Promise<void> {
    console.log("[SecureServer] Initializing secure server...");

    // Initialize services
    await this.securityService.initialize();
    await this.databaseService.initialize();

    // Initialize enterprise security system
    // await securityInitializer.initialize(); // Temporarily disabled

    // Setup middleware in correct order
    this.setupSecurityMiddleware();
    this.setupCoreMiddleware();
    this.setupAuthenticationMiddleware();
    this.setupValidationMiddleware();
    await this.setupRoutes();
    this.setupErrorHandling();

    console.log("[SecureServer] Server initialization complete");
  }

  private setupSecurityMiddleware(): void {
    // Trust proxy for accurate IP addresses
    this.app.set("trust proxy", 1);

    // Security headers with Helmet - production vs development CSP
    const isDevelopment = process.env.NODE_ENV !== "production";

    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: isDevelopment
              ? ["'self'", "'unsafe-inline'"] // Dev: allow inline styles for HMR
              : ["'self'"], // Prod: remove unsafe-inline (use hashes/nonces)
            scriptSrc: ["'self'", "'unsafe-eval'"], // Keep for dynamic imports
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: isDevelopment
              ? [
                  "'self'",
                  "ws:",
                  "wss:",
                  "http://localhost:5173",
                  "http://127.0.0.1:5173",
                ] // Dev: include dev server
              : ["'self'", "ws:", "wss:"], // Prod: remove dev server entries
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            scriptSrcAttr: ["'none'"],
            ...(isDevelopment ? {} : { upgradeInsecureRequests: [] }), // Only in production
          },
        },
        crossOriginEmbedderPolicy: false, // Disable for compatibility
      }),
    );

    // CORS configuration - production vs development
    const corsOptions = {
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        // Production: allow !origin (Electron packaged apps send no Origin)
        // Development: allow !origin for testing tools (Postman, curl, etc.)
        if (!origin) return callback(null, true);

        if (this.securityService.validateOrigin(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"), false);
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      // Include all headers actually used by the application
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "X-CSRF-Token",
        "x-session-id",
        "x-api-key",
        "X-Request-Id",
        "X-Client-Version",
      ],
    };

    this.app.use(cors(corsOptions));

    // Global OPTIONS handler for preflight requests
    this.app.options("*", cors(corsOptions));

    // Compression
    this.app.use(
      compression({
        level: 6,
        threshold: 1024, // Only compress responses > 1KB
        filter: (req, res) => {
          if (req.headers["x-no-compression"]) {
            return false;
          }
          return compression.filter(req, res);
        },
      }),
    );

    // Rate limiting with different tiers
    const createRateLimit = (
      windowMs: number,
      max: number,
      message: string,
    ) => {
      return rateLimit({
        windowMs,
        max,
        message: { error: message },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req: Request, res: Response) => {
          const clientIP = this.getClientIP(req);
          this.securityService.logAuditEvent("rate_limit_exceeded", {
            ipAddress: clientIP,
            details: `Rate limit exceeded: ${max} requests per ${windowMs}ms`,
          });

          res.status(429).json({
            error: message,
            retryAfter: Math.ceil(windowMs / 1000),
          });
        },
      });
    };

    // Global rate limit
    this.app.use(
      "/api",
      createRateLimit(
        15 * 60 * 1000,
        1000,
        "Too many requests, please try again later",
      ),
    ); // 1000 per 15 minutes

    // Stricter rate limit for auth endpoints
    this.app.use(
      "/api/auth",
      createRateLimit(15 * 60 * 1000, 50, "Too many authentication attempts"),
    ); // 50 per 15 minutes

    // Very strict rate limit for chat endpoints
    this.app.use(
      "/api/agent/chat",
      createRateLimit(1 * 60 * 1000, 60, "Too many chat requests"),
    ); // 60 per minute

    // Rate limit for voice endpoints (especially TTS which can be expensive)
    this.app.use(
      "/api/voice/tts",
      createRateLimit(1 * 60 * 1000, 30, "Too many TTS requests"),
    ); // 30 per minute
    this.app.use(
      "/api/voice/stt",
      createRateLimit(1 * 60 * 1000, 100, "Too many STT requests"),
    ); // 100 per minute
    this.app.use(
      "/api/voice/transcribe",
      createRateLimit(1 * 60 * 1000, 100, "Too many STT requests"),
    ); // match /stt alias
    this.app.use(
      "/api/voice/*",
      createRateLimit(1 * 60 * 1000, 120, "Too many voice requests"),
    ); // 120 per minute general voice
  }

  private setupCoreMiddleware(): void {
    // Cookie parsing - MUST be before routes - ENSURE this line exists
    this.app.use(cookieParser(process.env.COOKIE_SECRET || "dev-secret"));

    // Body parsing with size limits (5MB per ship checklist)
    this.app.use(
      express.json({
        limit: "5mb",
        verify: (req: any, res, buf) => {
          req.rawBody = buf;
        },
      }),
    );

    this.app.use(
      express.urlencoded({
        extended: true,
        limit: "5mb",
      }),
    );

    // Request logging, ID generation, and timeout configuration
    this.app.use(
      (req: AuthenticatedRequest, res: Response, next: NextFunction): any => {
        // Generate unique request ID for structured logging
        const requestId = crypto.randomUUID();
        req.headers["x-request-id"] = requestId;
        res.setHeader("X-Request-Id", requestId);

        req.clientIP = this.getClientIP(req);

        // Set request timeout (30s default, 60s for voice endpoints)
        const isVoiceEndpoint = req.path.startsWith("/api/voice/");
        const timeout = isVoiceEndpoint ? 60000 : 30000; // 60s for voice, 30s otherwise

        const timeoutId = setTimeout(() => {
          if (!res.headersSent) {
            console.warn(
              `[${requestId}] Request timeout after ${timeout}ms: ${req.method} ${req.path}`,
            );
            res.status(408).json({
              error: "Request timeout",
              requestId,
              timeout: timeout / 1000,
            });
          }
        }, timeout);

        // Clear timeout when response finishes
        res.on("finish", () => clearTimeout(timeoutId));
        res.on("close", () => clearTimeout(timeoutId));

        // Structured logging with request ID
        console.log(
          `[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.path} from ${req.clientIP}`,
        );

        // Check if IP is banned
        if (this.securityService.isIPBanned(req.clientIP)) {
          clearTimeout(timeoutId);
          return res.status(403).json({ error: "Access denied", requestId });
        }

        // Add security headers
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-XSS-Protection", "1; mode=block");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

        next();
      },
    );
  }

  private setupAuthenticationMiddleware(): void {
    // Session-based authentication middleware
    const authenticateSession = async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ) => {
      try {
        const sessionId = readSessionId(req);

        if (!sessionId) {
          // Create anonymous session for public endpoints
          const newSessionId = this.securityService.createSession(
            req.headers,
            req.cookies,
          );
          req.sessionId = newSessionId;
          res.cookie("sid", newSessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 24 * 3600 * 1000, // 30 days
          });
          return next();
        }

        // Validate existing session
        if (!this.securityService.validateSession(sessionId)) {
          return res.status(401).json({ error: "Invalid or expired session" });
        }

        // Get session data from database
        const sessionResult = await this.databaseService.getSession(sessionId);

        if (!sessionResult.success || !sessionResult.data) {
          return res.status(401).json({ error: "Session not found" });
        }

        // Update session access time
        await this.databaseService.updateSessionAccess(sessionId);

        req.sessionId = sessionId;
        req.user = {
          id: sessionResult.data.user_id || "anonymous",
          sessionId,
          permissions: ["read", "write"], // Default permissions
        };

        next();
      } catch (error) {
        console.error("[SecureServer] Authentication error:", error);
        res.status(500).json({ error: "Authentication system error" });
      }
    };

    // JWT token authentication (for API keys)
    const authenticateToken = (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ): any => {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

      if (!token) {
        return authenticateSession(req, res, next);
      }

      jwt.verify(token, JWT_SECRET, (err: any, decoded: any): any => {
        if (err) {
          return res.status(403).json({ error: "Invalid token" });
        }

        req.user = {
          id: decoded.userId,
          sessionId: decoded.sessionId,
          permissions: decoded.permissions || ["read"],
        };

        next();
      });
    };

    // Mount public voice diagnostic endpoints before authentication
    console.log(
      "[SecureServer] Mounting public voice diagnostics at /api/voice/diagnostics",
    );
    this.app.use("/api/voice/diagnostics", publicVoiceDiagnosticsRouter);

    // Apply authentication to protected routes
    this.app.use("/api/agent", authenticateToken);
    this.app.use("/api/voice", authenticateToken);
  }

  private setupValidationMiddleware(): void {
    // Input validation middleware
    const validateInput = (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ) => {
      const contentType = req.headers["content-type"];

      // Skip validation for file uploads
      if (contentType && contentType.includes("multipart/form-data")) {
        return next();
      }

      // Validate JSON input
      if (req.body && typeof req.body === "object") {
        const jsonString = JSON.stringify(req.body);
        const validation = this.securityService.validateInput(jsonString);

        if (!validation.valid) {
          const errors = validation.issues.filter(
            (issue) => issue.severity === "error",
          );
          if (errors.length > 0) {
            return res.status(400).json({
              error: "Invalid input detected",
              details: errors.map((e) => e.message),
            });
          }
        }
      }

      // Validate query parameters
      if (req.query) {
        const queryString = JSON.stringify(req.query);
        const validation = this.securityService.validateInput(queryString);

        if (!validation.valid) {
          const errors = validation.issues.filter(
            (issue) => issue.severity === "error",
          );
          if (errors.length > 0) {
            return res.status(400).json({
              error: "Invalid query parameters",
              details: errors.map((e) => e.message),
            });
          }
        }
      }

      next();
    };

    // CSRF protection for state-changing operations
    const csrfProtection = (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ): any => {
      if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
        const csrfToken = req.headers["x-csrf-token"] as string;
        const sessionId = req.sessionId;

        if (!sessionId || !this.securityService.validateCSRFToken(csrfToken)) {
          return res
            .status(403)
            .json({ error: "CSRF token validation failed" });
        }
      }

      next();
    };

    // Apply validation to API routes
    this.app.use("/api", validateInput);
    // this.app.use('/api', csrfProtection); // Enable when CSRF tokens are implemented in frontend
  }

  private async setupRoutes(): Promise<void> {
    // Configuration endpoint for frontend - no auth needed for local use
    this.app.get("/api/config/openai-key", (req: Request, res: Response) => {
      // Only return if API key exists
      if (process.env.OPENAI_API_KEY) {
        res.json({ apiKey: process.env.OPENAI_API_KEY });
      } else {
        res.status(404).json({ error: "OpenAI API key not configured" });
      }
    });

    // Health check endpoint (no authentication required) - ENSURE this line exists
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        version: API_VERSION,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });

    // Security status endpoint
    this.app.get(
      "/api/security/status",
      (req: AuthenticatedRequest, res: Response) => {
        const metrics = this.securityService.getSecurityMetrics();
        res.json({
          ...metrics,
          timestamp: new Date().toISOString(),
        });
      },
    );

    // ENSURE auth routes are mounted - this line exists
    this.app.use("/api/auth", authRoutes);

    // Security credential management routes
    // this.app.use('/api/security', securityRoutes); // Temporarily disabled

    // Enhanced SSE Streaming Chat Route with security
    this.app.post(
      "/api/agent/chat/stream",
      async (req: AuthenticatedRequest, res: Response): Promise<any> => {
        // Rate limiting check
        const clientIP = req.clientIP!;
        if (!this.securityService.checkRateLimit("chat_stream")) {
          return res
            .status(429)
            .json({ error: "Rate limit exceeded for streaming chat" });
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");

        const { messages, model, sessionId } = req.body as {
          messages: Array<{
            role: "user" | "assistant" | "system";
            content: string;
          }>;
          model?: string;
          sessionId?: string;
        };

        if (!messages?.length) {
          this.sseWrite(res, "error", { message: "messages[] is required" });
          return res.end();
        }

        // Validate and sanitize messages
        const sanitizedMessages = messages.map((msg) => ({
          role: msg.role,
          content: this.securityService.sanitizeText(msg.content),
        }));

        // Log chat interaction
        await this.databaseService.logAuditEvent({
          eventType: "chat_stream",
          details: `User chat with ${sanitizedMessages.length} messages`,
          ipAddress: clientIP,
          userId: req.user?.id,
        });

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => res.write(":\n\n"), 15000);
        let closed = false;

        req.on("close", () => {
          closed = true;
          clearInterval(heartbeat);
        });

        try {
          // Filter PII before sending to AI provider
          const filteredMessages = await Promise.all(
            sanitizedMessages.map(async (msg) => ({
              ...msg,
              content: await this.piiFilter.filter(msg.content),
            })),
          );

          // Try OpenAI first if available
          if (this.openai && (!model || model.includes("gpt"))) {
            const stream = await this.openai.chat.completions.create({
              model: model || "gpt-4o-mini",
              stream: true,
              temperature: 0.6,
              messages: filteredMessages,
            });

            let fullResponse = "";
            for await (const chunk of stream) {
              if (closed) break;
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                fullResponse += delta;
                this.sseWrite(res, "token", { text: delta });
              }
            }

            // Store conversation
            if (sessionId && fullResponse) {
              await this.storeConversation(
                sessionId,
                filteredMessages,
                fullResponse,
              );
            }

            this.sseWrite(res, "done", {});
            return res.end();
          }

          // Try Anthropic if available
          if (this.anthropic && (!model || model.includes("claude"))) {
            const stream = await this.anthropic.messages.create({
              model: model || "claude-3-5-sonnet-20240620",
              max_tokens: 4096,
              temperature: 0.6,
              stream: true,
              messages: filteredMessages,
            });

            let fullResponse = "";
            for await (const event of stream) {
              if (closed) break;
              if (event.type === "content_block_delta" && event.delta?.text) {
                fullResponse += event.delta.text;
                this.sseWrite(res, "token", { text: event.delta.text });
              }
            }

            // Store conversation
            if (sessionId && fullResponse) {
              await this.storeConversation(
                sessionId,
                filteredMessages,
                fullResponse,
              );
            }

            this.sseWrite(res, "done", {});
            return res.end();
          }

          // Fallback: no streaming provider available
          const fallbackMessage =
            "[Streaming disabled] No streaming provider available. Please configure OPENAI_API_KEY or ANTHROPIC_API_KEY.";

          for (const chunk of fallbackMessage.match(/.{1,40}/g) || []) {
            if (closed) break;
            this.sseWrite(res, "token", { text: chunk });
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          this.sseWrite(res, "done", {});
          res.end();
        } catch (error: any) {
          console.error("Streaming error:", error);

          // Log error
          await this.databaseService.logAuditEvent({
            eventType: "chat_stream_error",
            details: error?.message || "Unknown streaming error",
            ipAddress: clientIP,
            userId: req.user?.id,
            severity: "high",
          });

          this.sseWrite(res, "error", { message: "Stream error occurred" });
          res.end();
        } finally {
          clearInterval(heartbeat);
        }
      },
    );

    // Mount auth routes directly
    console.log("[SecureServer] Auth routes mounted directly");

    // Agent routes - await the async initialization
    await this.initializeAgentRoutes();
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        error: "Not Found",
        message: `Cannot ${req.method} ${req.originalUrl}`,
      });
    });

    // Global error handler
    this.app.use(
      (
        error: Error,
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction,
      ) => {
        console.error("[SecureServer] Unhandled error:", error);

        // Log security event
        this.databaseService
          .logAuditEvent({
            eventType: "server_error",
            details: error.message,
            ipAddress: req.clientIP,
            userId: req.user?.id,
            severity: "high",
          })
          .catch(console.error);

        // Don't leak error details in production
        const isDevelopment = process.env.NODE_ENV === "development";

        res.status(500).json({
          error: "Internal Server Error",
          message: isDevelopment
            ? error.message
            : "An unexpected error occurred",
          ...(isDevelopment && { stack: error.stack }),
        });
      },
    );

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("[SecureServer] Uncaught Exception:", error);
      // In production, you might want to restart the process
      if (process.env.NODE_ENV === "production") {
        setTimeout(() => process.exit(1), 1000);
      }
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      console.error(
        "[SecureServer] Unhandled Rejection at:",
        promise,
        "reason:",
        reason,
      );
      // In production, you might want to restart the process
    });
  }

  // Helper methods
  private sseWrite(res: ExpressResponse, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private getClientIP(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown"
    );
  }

  private async storeConversation(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    response: string,
  ): Promise<void> {
    try {
      // Create conversation if it doesn't exist
      const conversationId = `conv_${sessionId}_${Date.now()}`;

      await this.databaseService.createConversation(
        conversationId,
        "Chat Session",
      );

      // Store user messages
      for (const message of messages) {
        await this.databaseService.storeMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          conversationId,
          role: message.role as "user" | "assistant" | "system",
          content: message.content,
        });
      }

      // Store assistant response
      await this.databaseService.storeMessage({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conversationId,
        role: "assistant",
        content: response,
      });
    } catch (error) {
      console.error("[SecureServer] Failed to store conversation:", error);
    }
  }

  private async initializeAgentRoutes(): Promise<void> {
    try {
      // Import routes - auth is now handled by routes/index.ts
      const routes = (await import("./routes")).default;

      console.log("[SecureServer] Creating agent router...");
      const agentRouter = await createAgentRouter(this.modelRouter);
      console.log("[SecureServer] Agent router created successfully");

      // Mount specific routes first
      console.log("[SecureServer] Mounting voice routes at /api/voice");
      this.app.use("/api/voice", voiceRouter);
      console.log("[SecureServer] Voice routes mounted successfully");

      // Mount memory and tools routes
      console.log("[SecureServer] Mounting memory routes at /api/memory");
      this.app.use("/api/memory", memoryRoutes);
      console.log("[SecureServer] Memory routes mounted successfully");

      console.log("[SecureServer] Mounting tools routes at /api/tools");
      this.app.use("/api/tools", toolsRoutes);
      console.log("[SecureServer] Tools routes mounted successfully");

      console.log(
        "[SecureServer] Mounting streaming voice routes at /api/voice/streaming",
      );
      this.app.use("/api/voice/streaming", streamingVoiceRouter);
      console.log("[SecureServer] Streaming voice routes mounted successfully");

      // Then mount auth routes
      this.app.use("/api", routes); // This mounts /api/auth from routes/index.ts

      // Finally mount the general agent router
      console.log("[SecureServer] Mounting agent router at /api/agent");
      this.app.use("/api/agent", agentRouter);
      console.log("[SecureServer] Agent router mounted successfully");

      // Metrics endpoint with authentication
      this.app.get(
        "/api/metrics",
        (req: AuthenticatedRequest, res: Response) => {
          try {
            const metrics = this.modelRouter.getMetrics();
            const circuitBreakers = this.modelRouter.getCircuitBreakerStatus();
            const totalCost = this.modelRouter.getTotalCost();
            const securityMetrics = this.securityService.getSecurityMetrics();
            const dbHealth = this.databaseService.healthCheck();

            res.json({
              models: metrics,
              circuitBreakers,
              totalCost,
              security: securityMetrics,
              database: dbHealth,
              server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
              },
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error("Metrics endpoint error:", error);
            res.status(500).json({ error: "Internal server error" });
          }
        },
      );

      console.log("[SecureServer] Agent routes initialized");
    } catch (error) {
      console.error("[SecureServer] Failed to initialize agent routes:", error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tryPort = (currentPort: number, maxRetries: number = 10) => {
        if (maxRetries === 0) {
          reject(
            new Error("Could not find an available port after 10 attempts"),
          );
          return;
        }

        this.server = this.app
          .listen(currentPort)
          .on("listening", () => {
            this.port = currentPort;
            // ENSURE this line exists
            console.log(`[backend] listening on http://localhost:${this.port}`);
            console.log(
              `?? Health check: http://localhost:${this.port}/health`,
            );
            console.log(
              `?? Security metrics: http://localhost:${this.port}/api/security/status`,
            );
            console.log(
              `?? System metrics: http://localhost:${this.port}/api/metrics`,
            );

            // Initialize WebSocket server for streaming voice
            try {
              this.voiceWebSocketServer = initializeVoiceWebSocket(this.server);
              console.log(
                `?? Streaming voice WebSocket: ws://localhost:${this.port}/ws/voice/stream`,
              );
            } catch (error) {
              console.error(
                "[StreamingVoice] Failed to initialize WebSocket server:",
                error,
              );
            }

            resolve();
          })
          .on("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
              console.log(
                `Port ${currentPort} is in use, trying ${currentPort + 1}...`,
              );
              this.server.close();
              tryPort(currentPort + 1, maxRetries - 1);
            } else {
              reject(err);
            }
          });
      };

      tryPort(this.port);
    });
  }

  public async stop(): Promise<void> {
    console.log("[SecureServer] Shutting down server...");

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          console.log("[SecureServer] HTTP server closed");
          resolve();
        });
      });
    }

    // Shutdown enterprise security system
    // await securityInitializer.shutdown(); // Temporarily disabled

    // Close database connections
    await this.databaseService.close();

    // Cleanup security service
    this.securityService.cleanup();

    console.log("[SecureServer] Server shutdown complete");
  }

  public getPort(): number {
    return this.port;
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// Create and initialize server
const server = new SecureExpressServer();

// Graceful shutdown handling
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await server.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");
  await server.stop();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Export for testing and external use
export { SecureExpressServer, server as serverInstance };
export const app = server.getApp();
export const getPort = () => server.getPort();

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}
