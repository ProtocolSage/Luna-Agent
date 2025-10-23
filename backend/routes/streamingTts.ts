/**
 * Streaming TTS Route
 * Chunked audio streaming for low-latency playback
 */

import { Router, Request, Response } from 'express';
import OpenAI from 'openai';

const router = Router();

router.post('/stream', async (req: Request, res: Response) => {
  const { text, voice = 'alloy' } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Set headers for streaming audio
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    // Stream TTS audio
    const mp3Stream = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice as any,
      input: text,
      response_format: 'mp3',
      speed: 1.0
    });

    // Pipe the audio stream to response
    const buffer = Buffer.from(await mp3Stream.arrayBuffer());
    const chunkSize = 4096; // 4KB chunks for smooth playback

    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, Math.min(i + chunkSize, buffer.length));
      res.write(chunk);

      // Small delay to simulate streaming (adjust as needed)
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    res.end();

  } catch (error: any) {
    console.error('[StreamingTTS] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'TTS streaming failed' });
    }
  }
});

export default router;
