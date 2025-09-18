
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { ElevenLabsService } from '../services/elevenLabsService';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import multer from 'multer';

const router = express.Router();
const elevenLabsService = process.env.ELEVEN_API_KEY ? new ElevenLabsService() : null;
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

const allowedAudioExtensions = new Set([
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'oga',
  'ogg',
  'wav',
  'webm',
]);

const getRequestId = (req: Request, res: Response): string => {
  const header = res.getHeader('X-Request-Id');
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  const fromReq = req.headers['x-request-id'];
  if (Array.isArray(fromReq)) {
    return fromReq[0] ?? '';
  }
  return typeof fromReq === 'string' ? fromReq : '';
};

const normaliseProviderError = (error: any): { status: number; code: string; message: string } => {
  const providerStatus = error?.status ?? error?.statusCode ?? error?.response?.status;
  const providerMessage = error?.response?.data?.error?.message || error?.message || 'Transcription failed';
  const providerCode = (error?.response?.data?.error?.code || error?.code || '').toString();

  const timeoutSignatures = ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ETIME', 'Request timed out'];
  const didTimeout = timeoutSignatures.some(signature =>
    providerCode.includes(signature) || providerMessage.includes(signature)
  );

  if (didTimeout) {
    return { status: 504, code: 'provider-timeout', message: providerMessage };
  }

  if (typeof providerStatus === 'number' && providerStatus >= 400 && providerStatus < 500) {
    const codeMap: Record<number, string> = {
      400: 'bad-request',
      401: 'unauthorized',
      403: 'forbidden',
      404: 'not-found',
      429: 'rate-limited',
    };
    return {
      status: providerStatus,
      code: codeMap[providerStatus] ?? 'transcription-error',
      message: providerMessage,
    };
  }

  return {
    status: 500,
    code: 'transcription-failed',
    message: providerMessage,
  };
};

router.get('/tts/check', (req: Request, res: Response) => {
  const hasElevenLabs = !!process.env.ELEVEN_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const streamingFlag = (process.env.VOICE_STREAMING_ENABLED ?? 'false').toLowerCase() === 'true';
  const streamingAvailable = streamingFlag && hasOpenAI;
  const providers = {
    elevenlabs: hasElevenLabs,
    openai: hasOpenAI,
    webSpeech: true,
    streaming: streamingAvailable,
  } as const;
  const availableProviders = Object.entries(providers)
    .filter(([, available]) => available)
    .map(([provider]) => provider);
  res.json({
    status: 'ok',
    providers,
    availableProviders,
    streaming: { enabled: streamingFlag, available: streamingAvailable },
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
      if (!elevenLabsService) {
        if (provider === 'elevenlabs') {
          res.status(503).json({ error: 'ElevenLabs TTS unavailable' });
          return;
        }
      } else {
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
    }

    // Try OpenAI TTS as fallback or if explicitly requested
    if (process.env.OPENAI_API_KEY && (provider === 'openai' || !provider)) {
      try {
        const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openaiClient.audio.speech.create({
          model: 'tts-1',
          voice: voiceId || 'alloy',
          input: text,
          response_format: 'mp3',
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
        return;
      } catch (openaiError: any) {
        console.error('OpenAI TTS failed:', openaiError.message);
        if (provider === 'openai') {
          res.status(500).json({ error: 'OpenAI TTS failed', details: openaiError.message });
          return;
        }
      }
    }

    res.status(500).json({ error: 'All TTS providers failed' });
  } catch (error: any) {
    console.error('TTS Error:', error.message);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

export const handleTranscribe = async (req: Request, res: Response, _next?: NextFunction): Promise<void> => {
  try {
    console.log('[voice/transcribe] OPENAI_API_KEY:', process.env.OPENAI_API_KEY ?
      `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'NOT SET');

    if (!process.env.OPENAI_API_KEY) {
      const requestId = getRequestId(req, res);
      res.status(500).json({ error: 'configuration-error', message: 'OPENAI_API_KEY not configured', requestId });
      return;
    }

    if (!req.file) {
      const requestId = getRequestId(req, res);
      res.status(400).json({ error: 'bad-request', message: 'Missing multipart field "file"', requestId });
      return;
    }

    const originalExt = path.extname(req.file.originalname || '').replace('.', '').toLowerCase();
    const mimeSubtype = (req.file.mimetype || '').split('/').pop()?.toLowerCase() || '';
    const isAllowedAudio = allowedAudioExtensions.has(originalExt) || allowedAudioExtensions.has(mimeSubtype);

    if (!isAllowedAudio) {
      const requestId = getRequestId(req, res);
      const detected = originalExt || mimeSubtype || 'unknown';
      res.status(400).json({
        error: 'unsupported-media',
        message: 'Unsupported audio format "' + detected + '"',
        requestId,
      });
      return;
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await toFile(req.file.buffer, req.file.originalname || 'audio.webm', {
      type: req.file.mimetype || 'audio/webm'
    });

    const result = await client.audio.transcriptions.create({ model: 'whisper-1', file, language: 'en' });
    const finalText = (result.text ?? '').toString();

    const legacy = (req.query as any)?.legacy === '1';
    res.set('Deprecation', 'true');
    res.set('Link', '</docs/voice#response>; rel="describedby"');

    const payload: { text: string; transcription?: string; result?: { text: string } } = { text: finalText };
    if (legacy) {
      payload.transcription = finalText;
      payload.result = { text: finalText };
    }

    res.json(payload);
  } catch (error: any) {
    const requestId = getRequestId(req, res);
    const { status, code, message } = normaliseProviderError(error);
    console.error('[voice/transcribe]', { requestId, status, message, error });
    res.status(status).json({ error: code, message, requestId });
  }
};

router.post('/transcribe', upload.single('file'), handleTranscribe);
router.post('/stt', upload.single('file'), (req: Request, res: Response, next: NextFunction) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</docs/voice#response>; rel="describedby"');
  return handleTranscribe(req, res, next);
});

export default router;
