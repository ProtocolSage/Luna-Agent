import { Router, Request, Response } from 'express';

type Provider = 'openai' | 'azure' | 'deepgram' | 'google';
type ProviderStatus = Record<Provider, 'configured' | 'not_configured'>;

type DiagnosticsMeta = {
  timestamp: string;
  uptimeSeconds: number;
  environment: {
    node: string;
    platform: NodeJS.Platform;
  };
};

type HealthStatusResponse = DiagnosticsMeta & {
  status: 'ok' | 'degraded';
  message?: string;
  services: Record<'streaming' | 'websocket' | 'openaiRealtime', 'available' | 'unavailable'>;
  providers: ProviderStatus;
  endpoints: {
    websocket: string;
    streaming: string;
  };
};

type SystemStatusResponse = DiagnosticsMeta & {
  streamingAvailable: boolean;
  websocketPath: string;
  features: string[];
  activeProviders: Provider[];
  fallbackProviders: Provider[];
};

type CapabilitiesResponse = DiagnosticsMeta & {
  stt: {
    realTime: boolean;
    languages: string[];
    formats: string[];
    primaryProvider: Provider | null;
    fallbackProviders: Provider[];
  };
  tts: {
    realTime: boolean;
    streaming: boolean;
    voices: string[];
    provider: Provider | 'openai';
  };
  features: {
    vad: boolean;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    interruptDetection: boolean;
    continuousConversation: boolean;
  };
};

const router = Router();

const ensureConfigured = (value?: string | null): 'configured' | 'not_configured' =>
  value && value.trim().length > 0 ? 'configured' : 'not_configured';

const getProviderStatus = (): ProviderStatus => ({
  openai: ensureConfigured(process.env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY_VOICE),
  azure: ensureConfigured(process.env.AZURE_SPEECH_KEY),
  deepgram: ensureConfigured(process.env.DEEPGRAM_API_KEY),
  google: ensureConfigured(process.env.GOOGLE_CLOUD_API_KEY)
});

const getDiagnosticsMeta = (): DiagnosticsMeta => ({
  timestamp: new Date().toISOString(),
  uptimeSeconds: Math.round(process.uptime()),
  environment: {
    node: process.version,
    platform: process.platform
  }
});

const getEndpoints = () => ({
  websocket: process.env.VOICE_WS_ENDPOINT || '/ws/voice/stream',
  streaming: process.env.VOICE_STREAM_ENDPOINT || '/api/voice/streaming'
});

const buildHealthStatus = (): HealthStatusResponse => {
  const providers = getProviderStatus();
  const configuredProviders = Object.entries(providers)
    .filter(([, status]) => status === 'configured')
    .map(([name]) => name as Provider);

  const realtimeConfigured = ensureConfigured(process.env.OPENAI_REALTIME_API_KEY ?? process.env.OPENAI_API_KEY);

  return {
    ...getDiagnosticsMeta(),
    status: configuredProviders.length > 0 ? 'ok' : 'degraded',
    message:
      configuredProviders.length > 0
        ? undefined
        : 'No speech providers configured. Configure at least one provider to enable speech features.',
    services: {
      streaming: 'available',
      websocket: 'available',
      openaiRealtime: realtimeConfigured === 'configured' ? 'available' : 'unavailable'
    },
    providers,
    endpoints: getEndpoints()
  };
};

const buildSystemStatus = (): SystemStatusResponse => {
  const providers = getProviderStatus();
  const configuredProviders = Object.entries(providers)
    .filter(([, status]) => status === 'configured')
    .map(([name]) => name as Provider);

  const fallbackProviders = configuredProviders.slice(1);

  return {
    ...getDiagnosticsMeta(),
    streamingAvailable: true,
    websocketPath: getEndpoints().websocket,
    features: [
      'real_time_streaming',
      'voice_activity_detection',
      'echo_cancellation',
      'interrupt_handling',
      'continuous_mode'
    ],
    activeProviders: configuredProviders.length > 0 ? [configuredProviders[0]] : [],
    fallbackProviders
  };
};

const buildCapabilities = (): CapabilitiesResponse => {
  const providers = getProviderStatus();
  const configuredProviders = Object.entries(providers)
    .filter(([, status]) => status === 'configured')
    .map(([name]) => name as Provider);

  const primaryProvider = configuredProviders[0] ?? null;

  return {
    ...getDiagnosticsMeta(),
    stt: {
      realTime: true,
      languages: ['en-US'],
      formats: ['pcm16', 'webm'],
      primaryProvider,
      fallbackProviders: configuredProviders.slice(1)
    },
    tts: {
      realTime: true,
      streaming: true,
      voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      provider: primaryProvider ?? 'openai'
    },
    features: {
      vad: true,
      echoCancellation: true,
      noiseSuppression: true,
      interruptDetection: true,
      continuousConversation: true
    }
  };
};

const handleError = (res: Response, message: string, error: unknown) => {
  console.error(`[PublicVoiceDiagnostics] ${message}:`, error);
  res.status(500).json({
    status: 'error',
    message,
    ...getDiagnosticsMeta()
  });
};

// Voice system health check
router.get('/health', (_req: Request, res: Response) => {
  try {
    res.json(buildHealthStatus());
  } catch (error) {
    handleError(res, 'Health check failed', error);
  }
});

// Voice system status check
router.get('/status', (_req: Request, res: Response) => {
  try {
    res.json(buildSystemStatus());
  } catch (error) {
    handleError(res, 'Status check failed', error);
  }
});

// Voice capabilities endpoint
router.get('/capabilities', (_req: Request, res: Response) => {
  try {
    res.json(buildCapabilities());
  } catch (error) {
    handleError(res, 'Capabilities check failed', error);
  }
});

export default router;
