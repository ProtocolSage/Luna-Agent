import { Router, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import WebSocketSTTService from '../services/WebSocketSTTService';

const router = Router();

// Store active STT sessions
const activeSTTSessions = new Map<string, {
  service: WebSocketSTTService;
  websocket: WebSocket;
  sessionId: string;
  createdAt: number;
}>();

/**
 * Initialize WebSocket server for streaming STT
 */
function initializeWebSocketSTT(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/voice/stt'
  });
  
  console.log('[WebSocketSTT] WebSocket server initialized on /ws/voice/stt');
  
  wss.on('connection', async (ws: WebSocket, request) => {
    const sessionId = generateSessionId();
    console.log(`[WebSocketSTT] New STT session: ${sessionId}`);
    
    try {
      // Create new STT service instance
      const sttService = new WebSocketSTTService();
      
      // Store session
      activeSTTSessions.set(sessionId, {
        service: sttService,
        websocket: ws,
        sessionId,
        createdAt: Date.now()
      });
      
      // Forward STT service events to WebSocket client
      setupSTTServiceForwarding(sttService, ws, sessionId);
      
      // Handle WebSocket messages from client
      ws.on('message', async (message) => {
        try {
          // Check if message is binary (audio data) or text (control message)
          if (message instanceof Buffer) {
            // Binary audio data
            await handleAudioData(sttService, message, sessionId);
          } else {
            // Text control message
            const data = JSON.parse(message.toString());
            await handleControlMessage(sttService, data, sessionId);
          }
        } catch (error) {
          console.error(`[WebSocketSTT] Message error in session ${sessionId}:`, error);
          sendError(ws, 'Invalid message format');
        }
      });
      
      // Handle WebSocket disconnect
      ws.on('close', async () => {
        console.log(`[WebSocketSTT] Session ${sessionId} disconnected`);
        
        const session = activeSTTSessions.get(sessionId);
        if (session) {
          // Flush any remaining audio
          await session.service.flush();
          session.service.reset();
          activeSTTSessions.delete(sessionId);
        }
      });
      
      ws.on('error', (error) => {
        console.error(`[WebSocketSTT] WebSocket error in session ${sessionId}:`, error);
      });
      
      // Send session ready message
      ws.send(JSON.stringify({
        type: 'session-ready',
        sessionId,
        capabilities: {
          streamingSTT: true,
          partialResults: true,
          supportedFormats: ['webm', 'wav', 'mp3', 'ogg', 'opus'],
          models: ['whisper-1'],
          languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh']
        },
        config: sttService.getConfig()
      }));
      
    } catch (error) {
      console.error(`[WebSocketSTT] Failed to initialize session ${sessionId}:`, error);
      ws.close(1011, 'Service initialization failed');
    }
  });
  
  return wss;
}

/**
 * Forward STT service events to WebSocket client
 */
function setupSTTServiceForwarding(service: WebSocketSTTService, ws: WebSocket, sessionId: string) {
  // Transcription events
  service.on('transcription', (data) => {
    sendMessage(ws, { 
      type: 'transcription', 
      sessionId,
      text: data.text,
      isFinal: data.isFinal,
      duration: data.duration,
      language: data.language,
      timestamp: data.timestamp
    });
  });
  
  // Processing status
  service.on('processing', (data) => {
    sendMessage(ws, { 
      type: 'processing', 
      sessionId,
      chunks: data.chunks,
      size: data.size,
      duration: data.duration,
      timestamp: Date.now()
    });
  });
  
  // Errors
  service.on('error', (error) => {
    sendMessage(ws, { 
      type: 'error', 
      sessionId,
      error: typeof error === 'string' ? error : error.message,
      code: typeof error === 'object' && 'code' in error ? error.code : 'UNKNOWN_ERROR',
      timestamp: Date.now()
    });
  });
}

/**
 * Handle audio data from WebSocket client
 */
async function handleAudioData(service: WebSocketSTTService, audioData: Buffer, sessionId: string): Promise<void> {
  try {
    // Default to webm format unless specified otherwise
    await service.processAudioChunk(audioData, 'webm');
  } catch (error) {
    console.error(`[WebSocketSTT] Audio processing error in session ${sessionId}:`, error);
  }
}

/**
 * Handle control messages from WebSocket client
 */
async function handleControlMessage(service: WebSocketSTTService, data: any, sessionId: string): Promise<void> {
  const { type } = data;
  
  switch (type) {
    case 'configure':
      if (data.config) {
        service.updateConfig(data.config);
        const session = activeSTTSessions.get(sessionId);
        if (session) {
          sendMessage(session.websocket, {
            type: 'config-updated',
            sessionId,
            config: service.getConfig(),
            timestamp: Date.now()
          });
        }
      }
      break;
      
    case 'flush':
      await service.flush();
      break;
      
    case 'reset':
      service.reset();
      break;
      
    case 'get-status':
      const status = service.getBufferStatus();
      const session = activeSTTSessions.get(sessionId);
      if (session) {
        sendMessage(session.websocket, {
          type: 'status-update',
          sessionId,
          status,
          timestamp: Date.now()
        });
      }
      break;
      
    case 'audio':
      // Audio data sent as base64 in JSON message
      if (data.audioData) {
        const audioBuffer = Buffer.from(data.audioData, 'base64');
        const format = data.format || 'webm';
        await service.processAudioChunk(audioBuffer, format);
      }
      break;
      
    default:
      console.warn(`[WebSocketSTT] Unknown message type: ${type}`);
      break;
  }
}

/**
 * REST API Endpoints for STT Service Management
 */

/**
 * GET /api/voice/websocket-stt/status
 * Get overall WebSocket STT service status
 */
router.get('/status', (req: Request, res: Response) => {
  const activeSessions = Array.from(activeSTTSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    bufferStatus: session.service.getBufferStatus(),
    config: session.service.getConfig(),
    uptime: Date.now() - session.createdAt
  }));
  
  res.json({
    isAvailable: !!process.env.OPENAI_API_KEY,
    activeSessions: activeSessions.length,
    sessions: activeSessions,
    capabilities: {
      streamingSTT: true,
      partialResults: true,
      supportedFormats: ['webm', 'wav', 'mp3', 'ogg', 'opus'],
      models: ['whisper-1']
    },
    endpoint: '/ws/voice/stt'
  });
});

/**
 * GET /api/voice/websocket-stt/sessions
 * Get all active STT sessions
 */
router.get('/sessions', (req: Request, res: Response) => {
  const sessions = Array.from(activeSTTSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    bufferStatus: session.service.getBufferStatus(),
    config: session.service.getConfig(),
    uptime: Date.now() - session.createdAt
  }));
  
  res.json({
    sessions,
    totalActive: sessions.length
  });
});

/**
 * DELETE /api/voice/websocket-stt/sessions/:sessionId
 * Terminate a specific STT session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  const session = activeSTTSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      error: 'Session not found',
      sessionId
    });
  }
  
  try {
    // Flush any remaining audio
    await session.service.flush();
    
    // Cleanup
    session.service.reset();
    
    // Close WebSocket
    session.websocket.close(1000, 'Session terminated by server');
    
    // Remove from active sessions
    activeSTTSessions.delete(sessionId);
    
    return res.json({
      success: true,
      message: `Session ${sessionId} terminated`,
      sessionId
    });
    
  } catch (error) {
    console.error(`[WebSocketSTT] Failed to terminate session ${sessionId}:`, error);
    return res.status(500).json({
      error: 'Failed to terminate session',
      details: error instanceof Error ? error.message : 'Unknown error',
      sessionId
    });
  }
});

/**
 * GET /api/voice/websocket-stt/health
 * Health check endpoint for WebSocket STT service
 */
router.get('/health', (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    activeSessions: activeSTTSessions.size,
    capabilities: {
      streamingSTT: true,
      partialResults: true
    },
    configured: !!process.env.OPENAI_API_KEY,
    timestamp: Date.now()
  };
  
  res.json(health);
});

// Utility functions
function generateSessionId(): string {
  return `stt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function sendMessage(ws: WebSocket | undefined, message: any): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, error: string): void {
  sendMessage(ws, {
    type: 'error',
    error,
    timestamp: Date.now()
  });
}

export default router;
export { initializeWebSocketSTT };
