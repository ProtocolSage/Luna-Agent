/**
 * Integration tests for chunked streaming TTS
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import voiceRouter from '../../backend/routes/voice';

describe('Streaming TTS Integration Tests', () => {
  let app: Express;
  let server: any;

  beforeAll(() => {
    // Create a minimal Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/voice', voiceRouter);
    
    server = app.listen(0); // Random available port
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('GET /api/voice/tts/check', () => {
    it('should return streaming capability status', async () => {
      const response = await request(app)
        .get('/api/voice/tts/check')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('streaming');
      expect(response.body.streaming).toHaveProperty('enabled');
      expect(response.body.streaming).toHaveProperty('available');
      expect(response.body.streaming).toHaveProperty('endpoint');
      expect(response.body.streaming).toHaveProperty('supportedProviders');
      
      if (response.body.streaming.available) {
        expect(response.body.streaming.endpoint).toBe('/api/voice/tts/stream');
        expect(response.body.streaming.supportedProviders).toContain('openai');
      }
    });
  });

  describe('POST /api/voice/tts/stream', () => {
    it('should reject requests without text', async () => {
      const response = await request(app)
        .post('/api/voice/tts/stream')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });

    it('should reject non-OpenAI providers', async () => {
      const response = await request(app)
        .post('/api/voice/tts/stream')
        .send({
          text: 'Hello world',
          provider: 'elevenlabs'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('OpenAI');
    });

    // This test requires OPENAI_API_KEY to be set
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    
    (hasOpenAIKey ? it : it.skip)('should stream audio chunks with OpenAI', async () => {
      const response = await request(app)
        .post('/api/voice/tts/stream')
        .send({
          text: 'Hello, this is a streaming test.',
          provider: 'openai',
          voiceId: 'alloy'
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.headers['transfer-encoding']).toBe('chunked');
      expect(response.body).toBeTruthy();
      expect(response.body.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout for API call

    (hasOpenAIKey ? it : it.skip)('should handle long text', async () => {
      const longText = 'This is a longer test text to verify streaming capability. '.repeat(10);
      
      const response = await request(app)
        .post('/api/voice/tts/stream')
        .send({
          text: longText,
          provider: 'openai'
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.body.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('POST /api/voice/tts (non-streaming)', () => {
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    (hasOpenAIKey ? it : it.skip)('should still work for backward compatibility', async () => {
      const response = await request(app)
        .post('/api/voice/tts')
        .send({
          text: 'Hello world',
          provider: 'openai'
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('audio/mpeg');
      expect(response.body).toBeTruthy();
      expect(response.body.length).toBeGreaterThan(0);
    }, 30000);
  });
});
