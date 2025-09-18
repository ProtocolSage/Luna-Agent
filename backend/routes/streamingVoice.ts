import { Router, Request, Response } from 'express';
import { StreamingVoiceService } from '../services/StreamingVoiceService';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

const router = Router();

// Store active streaming voice sessions
const activeVoiceSessions = new Map<string, {
  service: StreamingVoiceService;
  websocket: WebSocket;
  sessionId: string;
}>();

/**
 * Initialize WebSocket server for real-time voice communication
 */
function initializeVoiceWebSocket(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/voice/stream'
  });
  
  console.log('[StreamingVoice] WebSocket server initialized on /ws/voice/stream');
  
  wss.on('connection', async (ws: WebSocket, request) => {
    const sessionId = generateSessionId();
    console.log(`[StreamingVoice] New voice session: ${sessionId}`);
    
    try {
      // Create new streaming voice service instance
      const voiceService = new StreamingVoiceService();
      
      // Store session
      activeVoiceSessions.set(sessionId, {
        service: voiceService,
        websocket: ws,
        sessionId
      });
      
      // Forward voice service events to WebSocket client
      setupVoiceServiceForwarding(voiceService, ws, sessionId);
      
      // Handle WebSocket messages from client
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await handleVoiceMessage(voiceService, data, sessionId);
        } catch (error) {
          console.error(`[StreamingVoice] Message error in session ${sessionId}:`, error);
          sendError(ws, 'Invalid message format');
        }
      });
      
      // Handle WebSocket disconnect
      ws.on('close', async () => {
        console.log(`[StreamingVoice] Session ${sessionId} disconnected`);
        
        const session = activeVoiceSessions.get(sessionId);
        if (session) {
          await session.service.cleanup();
          activeVoiceSessions.delete(sessionId);
        }
      });
      
      ws.on('error', (error) => {
        console.error(`[StreamingVoice] WebSocket error in session ${sessionId}:`, error);
      });
      
      // Send session ready message
      ws.send(JSON.stringify({
        type: 'session-ready',
        sessionId,
        capabilities: {
          realTimeSTT: true,
          realTimeTTS: true,
          interruption: true,
          continuousMode: true,
          voiceActivityDetection: true,
          echoSuppression: true
        }
      }));
      
    } catch (error) {
      console.error(`[StreamingVoice] Failed to initialize session ${sessionId}:`, error);
      ws.close(1011, 'Service initialization failed');
    }
  });
  
  return wss;
}

/**
 * Forward voice service events to WebSocket client
 */
function setupVoiceServiceForwarding(service: StreamingVoiceService, ws: WebSocket, sessionId: string) {
  // Core events
  service.on('initialized', () => {
    sendMessage(ws, { type: 'voice-initialized', sessionId });
  });
  
  service.on('listening-started', () => {
    sendMessage(ws, { type: 'listening-started', sessionId });
  });
  
  service.on('listening-stopped', () => {
    sendMessage(ws, { type: 'listening-stopped', sessionId });
  });
  
  // Speech detection
  service.on('speech-detected', () => {
    sendMessage(ws, { type: 'speech-detected', sessionId });
  });
  
  service.on('speech-ended', () => {
    sendMessage(ws, { type: 'speech-ended', sessionId });
  });
  
  service.on('user-speaking', (data) => {
    sendMessage(ws, { 
      type: 'user-speaking', 
      sessionId,
      level: data.level,
      timestamp: data.timestamp
    });
  });
  
  // Transcription
  service.on('transcription', (text) => {
    sendMessage(ws, { 
      type: 'transcription', 
      sessionId,
      text,
      timestamp: Date.now()
    });
  });
  
  // AI responses
  service.on('ai-response-text', (text) => {
    sendMessage(ws, { 
      type: 'ai-response-text', 
      sessionId,
      text,
      timestamp: Date.now()
    });
  });
  
  service.on('ai-speaking', (data) => {
    sendMessage(ws, { 
      type: 'ai-speaking', 
      sessionId,
      timestamp: Date.now()
    });
  });
  
  service.on('ai-finished-speaking', () => {
    sendMessage(ws, { 
      type: 'ai-finished-speaking', 
      sessionId,
      timestamp: Date.now()
    });
  });
  
  // Conversation flow
  service.on('user-interrupted', () => {
    sendMessage(ws, { type: 'user-interrupted', sessionId });
  });
  
  service.on('response-complete', () => {
    sendMessage(ws, { type: 'response-complete', sessionId });
  });
  
  service.on('continuous-mode-started', () => {
    sendMessage(ws, { type: 'continuous-mode-started', sessionId });
  });
  
  service.on('continuous-mode-stopped', () => {
    sendMessage(ws, { type: 'continuous-mode-stopped', sessionId });
  });
  
  // Errors
  service.on('error', (error) => {
    sendMessage(ws, { 
      type: 'error', 
      sessionId,
      error: error.message || error,
      timestamp: Date.now()
    });
  });
  
  service.on('connection-error', (error) => {
    sendMessage(ws, { 
      type: 'connection-error', 
      sessionId,
      error: error.message || error,
      timestamp: Date.now()
    });
  });
}

/**
 * Handle voice messages from WebSocket client
 */
async function handleVoiceMessage(service: StreamingVoiceService, data: any, sessionId: string): Promise<void> {
  const { type } = data;
  
  switch (type) {
    case 'initialize':
      console.log(`[StreamingVoice] Initializing session ${sessionId}`);
      await service.initialize();
      break;
      
    case 'start-continuous':
      console.log(`[StreamingVoice] Starting continuous mode for ${sessionId}`);
      await service.startContinuousMode();
      break;
      
    case 'stop-continuous':
      console.log(`[StreamingVoice] Stopping continuous mode for ${sessionId}`);
      await service.stopContinuousMode();
      break;
      
    case 'start-listening':
      await service.startListening();
      break;
      
    case 'stop-listening':
      await service.stopListening();
      break;
      
    case 'update-config':
      if (data.config) {
        service.updateConfig(data.config);
      }
      break;
      
    case 'get-state':
      const state = service.getState();
      sendMessage(activeVoiceSessions.get(sessionId)?.websocket, {
        type: 'state-update',
        sessionId,
        state,
        timestamp: Date.now()
      });
      break;
      
    case 'get-config':
      const config = service.getConfig();
      sendMessage(activeVoiceSessions.get(sessionId)?.websocket, {
        type: 'config-update',
        sessionId,
        config,
        timestamp: Date.now()
      });
      break;
      
    default:
      console.warn(`[StreamingVoice] Unknown message type: ${type}`);
      break;
  }
}

/**
 * REST API Endpoints for Voice Service Management
 */

/**
 * GET /api/voice/streaming/status
 * Get overall streaming voice service status
 */
router.get('/status', (req: Request, res: Response) => {
  const activeSessions = Array.from(activeVoiceSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    state: session.service.getState(),
    config: session.service.getConfig()
  }));
  
  res.json({
    isAvailable: true,
    activeSessions: activeSessions.length,
    sessions: activeSessions,
    capabilities: {
      realTimeSTT: true,
      realTimeTTS: true,
      interruption: true,
      continuousMode: true,
      voiceActivityDetection: true,
      echoSuppression: true
    }
  });
});

/**
 * GET /api/voice/streaming/sessions
 * Get all active voice sessions
 */
router.get('/sessions', (req: Request, res: Response) => {
  const sessions = Array.from(activeVoiceSessions.entries()).map(([id, session]) => ({
    sessionId: id,
    state: session.service.getState(),
    connectedAt: Date.now() // TODO: track actual connection time
  }));
  
  res.json({
    sessions,
    totalActive: sessions.length
  });
});

/**
 * DELETE /api/voice/streaming/sessions/:sessionId
 * Terminate a specific voice session
 */
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  
  const session = activeVoiceSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      error: 'Session not found',
      sessionId
    });
  }
  
  try {
    // Cleanup voice service
    await session.service.cleanup();
    
    // Close WebSocket
    session.websocket.close(1000, 'Session terminated by server');
    
    // Remove from active sessions
    activeVoiceSessions.delete(sessionId);
    
    return res.json({
      success: true,
      message: `Session ${sessionId} terminated`,
      sessionId
    });
    
  } catch (error) {
    console.error(`[StreamingVoice] Failed to terminate session ${sessionId}:`, error);
    return res.status(500).json({
      error: 'Failed to terminate session',
      details: error instanceof Error ? error.message : 'Unknown error',
      sessionId
    });
  }
});

/**
 * POST /api/voice/streaming/broadcast
 * Broadcast a message to all active voice sessions
 */
router.post('/broadcast', (req: Request, res: Response) => {
  const { message, type = 'broadcast' } = req.body;
  
  if (!message) {
    return res.status(400).json({
      error: 'Message is required'
    });
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const [sessionId, session] of activeVoiceSessions.entries()) {
    try {
      sendMessage(session.websocket, {
        type,
        message,
        sessionId,
        timestamp: Date.now()
      });
      successCount++;
    } catch (error) {
      console.error(`[StreamingVoice] Failed to broadcast to session ${sessionId}:`, error);
      errorCount++;
    }
  }
  
  return res.json({
    success: true,
    broadcastTo: successCount,
    errors: errorCount,
    totalSessions: activeVoiceSessions.size
  });
});

/**
 * GET /api/voice/streaming/health
 * Health check endpoint for streaming voice service
 */
router.get('/health', (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    activeSessions: activeVoiceSessions.size,
    capabilities: {
      realTimeSTT: true,
      realTimeTTS: true,
      interruption: true,
      continuousMode: true
    },
    timestamp: Date.now()
  };
  
  res.json(health);
});

// Utility functions
function generateSessionId(): string {
  return `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
export { initializeVoiceWebSocket };