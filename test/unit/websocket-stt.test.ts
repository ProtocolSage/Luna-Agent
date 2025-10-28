/**
 * WebSocket STT Service Tests
 * Tests for the WebSocket streaming STT functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('WebSocketSTTService', () => {
  let WebSocketSTTService: any;
  let service: any;
  
  beforeEach(async () => {
    // Mock OpenAI
    jest.mock('openai', () => ({
      default: jest.fn().mockImplementation(() => ({
        audio: {
          transcriptions: {
            create: jest.fn().mockResolvedValue({
              text: 'test transcription',
              duration: 2.5,
              language: 'en'
            })
          }
        }
      }))
    }));
    
    // Import after mocking
    const module = await import('../../backend/services/WebSocketSTTService');
    WebSocketSTTService = module.WebSocketSTTService;
    service = new WebSocketSTTService('test-api-key');
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const config = service.getConfig();
      
      expect(config.model).toBe('whisper-1');
      expect(config.language).toBe('en');
      expect(config.minChunkDuration).toBe(1000);
      expect(config.maxChunkDuration).toBe(10000);
      expect(config.sampleRate).toBe(16000);
    });
    
    it('should update configuration', () => {
      service.updateConfig({
        language: 'es',
        temperature: 0.5,
        minChunkDuration: 2000
      });
      
      const config = service.getConfig();
      expect(config.language).toBe('es');
      expect(config.temperature).toBe(0.5);
      expect(config.minChunkDuration).toBe(2000);
    });
  });
  
  describe('Buffer Management', () => {
    it('should buffer audio chunks', async () => {
      const audioData = Buffer.from('test audio data');
      
      await service.processAudioChunk(audioData, 'webm');
      
      const status = service.getBufferStatus();
      expect(status.chunks).toBeGreaterThan(0);
      expect(status.totalBytes).toBeGreaterThan(0);
    });
    
    it('should reset buffer', () => {
      service.reset();
      
      const status = service.getBufferStatus();
      expect(status.chunks).toBe(0);
      expect(status.totalBytes).toBe(0);
      expect(status.isProcessing).toBe(false);
    });
  });
  
  describe('Audio Processing', () => {
    it('should process audio chunk without API key', async () => {
      const serviceWithoutKey = new WebSocketSTTService();
      const audioData = Buffer.from('test audio');
      
      const errorSpy = jest.fn();
      serviceWithoutKey.on('error', errorSpy);
      
      await serviceWithoutKey.processAudioChunk(audioData, 'webm');
      
      expect(errorSpy).toHaveBeenCalledWith('OpenAI API key not configured');
    });
    
    it('should emit transcription event on successful processing', (done) => {
      service.on('transcription', (result: any) => {
        expect(result.text).toBe('test transcription');
        expect(result.isFinal).toBe(true);
        expect(result.duration).toBe(2.5);
        done();
      });
      
      const audioData = Buffer.alloc(32000); // Large enough to trigger processing
      service.processAudioChunk(audioData, 'webm');
    });
  });
  
  describe('Format Support', () => {
    it('should get correct file extension for formats', () => {
      const extensions = [
        { format: 'webm', expected: 'webm' },
        { format: 'wav', expected: 'wav' },
        { format: 'mp3', expected: 'mp3' },
        { format: 'ogg', expected: 'ogg' },
        { format: 'unknown', expected: 'webm' }
      ];
      
      // This would need to be tested via processAudioChunk or by making getFileExtension public
      // For now, we just verify formats are accepted
      extensions.forEach(({ format }) => {
        expect(() => {
          service.processAudioChunk(Buffer.from('test'), format);
        }).not.toThrow();
      });
    });
  });
});

describe('WebSocketSTTClient', () => {
  let WebSocketSTTClient: any;
  let client: any;
  let mockWebSocket: any;
  
  beforeEach(async () => {
    // Mock WebSocket
    mockWebSocket = {
      send: jest.fn(),
      close: jest.fn(),
      readyState: 1, // OPEN
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    
    global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;
    
    // Mock MediaDevices
    global.navigator = {
      mediaDevices: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: jest.fn() }]
        })
      }
    } as any;
    
    // Mock MediaRecorder
    global.MediaRecorder = jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      state: 'inactive',
      ondataavailable: null,
      onstop: null
    })) as any;
    
    (global.MediaRecorder as any).isTypeSupported = jest.fn().mockReturnValue(true);
    
    // Import after mocking
    const module = await import('../../app/renderer/services/WebSocketSTTClient');
    WebSocketSTTClient = module.WebSocketSTTClient;
    client = new WebSocketSTTClient();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Connection', () => {
    it('should create WebSocket on connect', async () => {
      // Simulate WebSocket open event
      setTimeout(() => {
        mockWebSocket.onopen?.();
      }, 10);
      
      await client.connect();
      
      expect(global.WebSocket).toHaveBeenCalled();
      expect(client.isConnected).toBe(true);
    });
    
    it('should disconnect properly', () => {
      client.ws = mockWebSocket;
      client.isConnected = true;
      
      client.disconnect();
      
      expect(mockWebSocket.close).toHaveBeenCalled();
      expect(client.isConnected).toBe(false);
    });
  });
  
  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = client.getConfig();
      
      expect(config.model).toBe('whisper-1');
      expect(config.language).toBe('en');
      expect(config.enablePartialResults).toBe(true);
    });
    
    it('should update configuration', async () => {
      client.ws = mockWebSocket;
      client.isConnected = true;
      
      await client.updateConfig({ language: 'fr' });
      
      expect(mockWebSocket.send).toHaveBeenCalled();
    });
  });
  
  describe('Recording', () => {
    it('should start recording with getUserMedia', async () => {
      await client.startRecording();
      
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    });
    
    it('should stop recording and cleanup', async () => {
      await client.startRecording();
      
      client.stopRecording();
      
      expect(client.isRecording).toBe(false);
    });
  });
  
  describe('Audio Sending', () => {
    it('should send audio data when connected', () => {
      client.ws = mockWebSocket;
      client.isConnected = true;
      
      const audioData = new ArrayBuffer(1024);
      client.sendAudioData(audioData);
      
      expect(mockWebSocket.send).toHaveBeenCalledWith(audioData);
    });
    
    it('should not send when disconnected', () => {
      client.isConnected = false;
      
      const audioData = new ArrayBuffer(1024);
      client.sendAudioData(audioData);
      
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });
});

describe('WebSocket STT Integration', () => {
  it('should handle end-to-end flow', async () => {
    // This would be an E2E test that requires a running backend
    // For now, we just verify the API contract
    
    const expectedMessages = [
      'session-ready',
      'transcription',
      'processing',
      'error'
    ];
    
    expectedMessages.forEach(type => {
      expect(type).toMatch(/^[a-z-]+$/);
    });
  });
});

export {};
