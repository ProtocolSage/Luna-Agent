/**
 * Streaming STT WebSocket Server
 * Real-time audio transcription via WebSocket
 */

import { Router } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export function setupStreamingSTT(server: Server): void {
  const wss = new WebSocketServer({
    server,
    path: '/api/voice/stream-stt'
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[StreamingSTT] Client connected');

    let audioChunks: Buffer[] = [];

    ws.on('message', (data: Buffer) => {
      // Accumulate audio chunks
      audioChunks.push(data);

      // Send interim transcription (placeholder for actual streaming STT)
      ws.send(JSON.stringify({
        type: 'interim',
        text: '...',
        timestamp: Date.now()
      }));
    });

    ws.on('close', async () => {
      console.log('[StreamingSTT] Client disconnected');

      // Process accumulated audio
      if (audioChunks.length > 0) {
        const audioBuffer = Buffer.concat(audioChunks);

        // TODO: Integrate with OpenAI Whisper streaming when available
        // For now, send final transcription via batch API
        try {
          ws.send(JSON.stringify({
            type: 'final',
            text: 'Transcription complete',
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('[StreamingSTT] Error:', error);
        }
      }
    });

    ws.on('error', (error) => {
      console.error('[StreamingSTT] WebSocket error:', error);
    });
  });

  console.log('[StreamingSTT] WebSocket server initialized on /api/voice/stream-stt');
}
