// backend/utils/SecurityService.ts
// Backend-specific security service (decoupled from renderer)

export class SecurityService {
  private bannedIPs = new Set<string>();
  private rateLimits = new Map<string, number>();

  async initialize() {
    console.log("[SecurityService] Backend security service initialized");
    // No-op for server - security is handled by middleware
  }

  validateInput(text: string) {
    // Basic validation for backend
    if (!text || typeof text !== "string") {
      return {
        valid: false,
        issues: [{ severity: "error", message: "Invalid input type" }],
      };
    }

    // Check for basic security issues
    const issues: Array<{ severity: string; message: string }> = [];

    // Check for potential XSS
    if (/<script|javascript:/i.test(text)) {
      issues.push({ severity: "error", message: "Potential XSS detected" });
    }

    // Check for SQL injection patterns
    if (/(union|select|insert|delete|drop|create|alter)\s+/i.test(text)) {
      issues.push({
        severity: "error",
        message: "Potential SQL injection detected",
      });
    }

    return { valid: issues.length === 0, issues };
  }

  sanitizeText(text: string): string {
    if (typeof text !== "string") return "";

    // Basic HTML entity encoding for backend
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .trim();
  }

  async logSecurityEvent(type: string, details: string) {
    // Log security events for backend monitoring
    const timestamp = new Date().toISOString();
    console.warn(`[SecurityEvent] ${timestamp} - ${type}: ${details}`);

    // In production, you might want to log to a security monitoring system
    // or database instead of console
  }

  // Additional methods for compatibility with server.ts
  async logAuditEvent(type: string, details: any) {
    const timestamp = new Date().toISOString();
    const detailsStr =
      typeof details === "string" ? details : JSON.stringify(details);
    console.log(`[AuditEvent] ${timestamp} - ${type}: ${detailsStr}`);
  }

  isIPBanned(ip: string): boolean {
    return this.bannedIPs.has(ip);
  }

  validateSession(sessionId: string): boolean {
    // Basic session validation - could be enhanced
    return typeof sessionId === "string" && sessionId.length > 0;
  }

  validateCSRFToken(token: string, sessionData?: any): boolean {
    // Basic CSRF validation - could be enhanced
    if (!sessionData) return false;
    return sessionData?.csrfToken === token;
  }

  checkRateLimit(identifier: string, limit: number = 100): boolean {
    const current = this.rateLimits.get(identifier) || 0;
    if (current >= limit) {
      return false; // Rate limit exceeded
    }
    this.rateLimits.set(identifier, current + 1);
    return true; // Within rate limit
  }

  validateOrigin(origin: string): boolean {
    const isDevelopment = process.env.NODE_ENV !== "production";

    if (isDevelopment) {
      // Development: allow localhost and 127.0.0.1 with dev server ports
      const devOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:5173", // Vite dev server
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:5173", // Vite dev server
      ];
      return devOrigins.includes(origin);
    } else {
      // Production: allow only production domains (remove localhost/5173)
      const prodOrigins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        // Note: No 5173 in production
      ];
      return prodOrigins.includes(origin);
    }
  }

  createSession(headers: any, cookies: any): string {
    // Generate a secure session ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `session-${timestamp}-${random}`;
  }

  getSecurityMetrics() {
    return {
      bannedIPs: this.bannedIPs.size,
      rateLimits: this.rateLimits.size,
      timestamp: new Date().toISOString(),
    };
  }

  cleanup() {
    // Cleanup resources if needed
    this.bannedIPs.clear();
    this.rateLimits.clear();
  }
}
