import express from "express";
import crypto from "crypto";
import { readSessionId } from "../helpers/session";
import { sessions, Session } from "../helpers/sessionStore";

const router = express.Router();

console.log("[AuthRoutes] mounted");

/**
 * Auth Routes for Luna Agent
 * Handles session management and authentication
 */

/**
 * POST /api/auth/session
 * Create or retrieve session
 */
router.post("/session", async (req, res) => {
  try {
    // Generate session ID with consistent format
    const sessionId = `session-${Date.now()}`;

    // Create new session
    const session: Session = {
      id: sessionId,
      userId: "anonymous",
      createdAt: new Date(),
      lastAccessed: new Date(),
      data: {},
    };
    sessions.set(sessionId, session);

    // Set session cookie
    res.cookie("sid", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true if you serve HTTPS in prod
      maxAge: 30 * 24 * 3600 * 1000,
    });

    return res.status(200).json({ success: true, sessionId });
  } catch (error) {
    console.error("Session creation error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create session",
      details:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

/**
 * GET /api/auth/validate
 * Validate existing session
 */
router.get("/validate", async (req, res) => {
  try {
    const sid = readSessionId(req);
    console.log("[AuthRoutes] validate using readSessionId(...)=", sid);
    if (!sid)
      return res
        .status(401)
        .json({ success: false, valid: false, error: "missing-session-id" });

    const session = sessions.get(sid);
    if (!session)
      return res
        .status(401)
        .json({ success: false, valid: false, error: "invalid-session-id" });

    // Check if session is expired (30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (session.lastAccessed < thirtyMinutesAgo) {
      sessions.delete(sid);
      return res
        .status(401)
        .json({ success: false, valid: false, error: "session-expired" });
    }

    // Update last accessed
    session.lastAccessed = new Date();

    return res.json({ success: true, valid: true, sessionId: sid });
  } catch (error) {
    console.error("Session validation error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to validate session",
      details:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

/**
 * POST /api/auth/csrf-token
 * Generate CSRF token for session
 */
router.post("/csrf-token", async (req, res) => {
  try {
    const sessionId = readSessionId(req);

    if (!sessionId) {
      return res.status(401).json({ ok: false, error: "No session" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(401).json({ ok: false, error: "Invalid session" });
    }

    const csrfToken = crypto.randomBytes(32).toString("hex");
    session.data.csrfToken = csrfToken;

    return res.json({ ok: true, csrfToken });
  } catch (error) {
    console.error("CSRF token generation error:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to generate CSRF token",
      details:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

/**
 * POST /api/auth/heartbeat
 * Keep session alive
 */
router.post("/heartbeat", async (req, res) => {
  try {
    const sessionId = readSessionId(req);

    if (!sessionId) {
      return res.status(401).json({ ok: false, error: "No session" });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(401).json({ ok: false, error: "Invalid session" });
    }

    // Update last accessed
    session.lastAccessed = new Date();

    return res.json({
      ok: true,
      sessionId: session.id,
      lastAccessed: session.lastAccessed,
    });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return res.status(500).json({
      ok: false,
      error: "Heartbeat failed",
      details:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

export default router;
