import type { Request } from 'express';

/**
 * Session helper utilities for Luna Agent
 * Handles session ID reading from headers and cookies
 */

export function readSessionId(req: Request): string | undefined {
  const h = (req.headers['x-session-id'] as string) || req.get('x-session-id') || '';
  const headerId = Array.isArray(h) ? h[0] : h;
  const cookieId = (req as any).signedCookies?.sid || (req as any).cookies?.sid || (req as any).cookies?.sessionId;
  return headerId || cookieId;
}
