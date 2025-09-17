import express, { Request, Response } from 'express';
import { ElevenLabsService } from '../services/elevenLabsService';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import multer from 'multer';

const router = express.Router();
const elevenLabsService = new ElevenLabsService();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

// Initialize OpenAI client - removed global initialization as it causes issues with env loading
// const openai = process.env.OPENAI_API_KEY ? new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// }) : null;

router.get('/tts/check', (req: Request, res: Response) => {
  const hasElevenLabs = !!process.env.ELEVEN_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const providers = {
    elevenlabs: hasElevenLabs,
    openai: hasOpenAI,
    webSpeech: true, // Always available in browsers
  };
  const availableProviders = Object.entries(providers)
    .filter(([, available]) => available)
    .map(([provider]) => provider);
  res.json({
    status: 'ok',
    providers,
    availableProviders,
    recommended: availableProviders[0] || 'webSpeech',
    timestamp: new Date().toISOString(),
  });
});

router.post('/tts', async (req: Request, res: Response) => {
  try {
    const { text, voiceId, stability, similarityBoost, provider } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    // Try ElevenLabs first (if no provider specified or explicitly requested)
    if (!provider || provider === 'elevenlabs') {
      try {
        const audioStream = await elevenLabsService.fetchAudioStream(text, voiceId, { stability, similarityBoost });
        res.setHeader('Content-Type', 'audio/mpeg');
        audioStream.pipe(res);
        return;
      } catch (elevenLabsError: any) {
        console.warn('ElevenLabs TTS failed, trying OpenAI fallback:', elevenLabsError.message);
        // Fall through to OpenAI
      }
    }

    // Try OpenAI TTS as fallback or if explicitly requested
    if (process.env.OPENAI_API_KEY && (provider === 'openai' || !provider)) {
      try {
        const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openaiClient.audio.speech.create({
          model: 'tts-1',
          voice: voiceId || 'alloy', // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
          input: text,
          response_format: 'mp3',
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        
        // Convert the response to a readable stream
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
        return;
      } catch (openaiError: any) {
        console.error('OpenAI TTS failed:', openaiError.message);
        if (provider === 'openai') {
          // If OpenAI was explicitly requested, return the error
          res.status(500).json({ error: 'OpenAI TTS failed', details: openaiError.message });
          return;
        }
      }
    }

    // If all providers fail
    res.status(500).json({ error: 'All TTS providers failed' });
    return;
  } catch (error: any) {
    console.error('TTS Error:', error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
    return;
  }
});

// Temporary alias handler for legacy clients posting to /stt directly
router.post('/stt', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'audio file missing: field "file"' });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await toFile(req.file.buffer, req.file.originalname || 'audio.webm', {
      type: req.file.mimetype || 'audio/webm'
    });

    const result = await client.audio.transcriptions.create({ model: 'whisper-1', file, language: 'en' });
    // Return both keys temporarily for compatibility (renderer tolerates either)
    res.json({ text: result.text ?? '', transcription: result.text ?? '' });
  } catch (e: any) {
    console.error('[voice/stt]', e);
    res.status(500).json({ error: 'transcription-failed', details: String(e?.message || e) });
  }
});

const handleTranscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[voice/transcribe] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ?
      `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'NOT SET');
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'audio file missing: field "file"' });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await toFile(req.file.buffer, req.file.originalname || 'audio.webm', {
      type: req.file.mimetype || 'audio/webm'
    });

    const result = await client.audio.transcriptions.create({ model: 'whisper-1', file, language: 'en' });
    const finalText = (result.text ?? '').toString();

    // Standardized response shape with a temporary legacy toggle for this release
    const legacy = (req.query as any)?.legacy === '1';
    res.set('Deprecation', 'true');
    res.set('Link', '</docs/voice#response>; rel="describedby"');

    const payload = legacy
      ? { text: finalText, transcription: finalText, result: { text: finalText } }
      : { text: finalText };

    res.json(payload);
    return;
  } catch (e: any) {
    console.error('[voice/transcribe]', e);
    res.status(500).json({ error: 'transcription-failed', details: String(e?.message || e) });
  }
};

router.post('/transcribe', upload.single('file'), handleTranscribe);
router.post('/stt', upload.single('file'), handleTranscribe);

export default router;
