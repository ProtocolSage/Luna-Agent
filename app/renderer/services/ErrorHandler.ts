/**
 * Error Handler Service
 * Provides centralized error handling for voice system components
 */

export class VoiceError extends Error {
  public readonly type: string;
  public readonly originalError?: Error;
  public readonly timestamp: number;

  constructor(message: string, type: string, originalError?: Error) {
    super(message);
    this.name = 'VoiceError';
    this.type = type;
    this.originalError = originalError;
    this.timestamp = Date.now();
  }
}

export class ErrorHandler {
  handleTTSError(error: Error): VoiceError {
    console.error('TTS Error:', error);
    
    if (error.message.includes('decodeAudioData')) {
      return new VoiceError(
        'Audio format not supported. Please check TTS audio data format.',
        'audio_format_error',
        error
      );
    }
    
    if (error.message.includes('AudioContext')) {
      return new VoiceError(
        'Audio context not available. Please enable audio permissions.',
        'audio_context_error',
        error
      );
    }
    
    if (error.message.includes('ElevenLabs') || error.message.includes('API')) {
      return new VoiceError(
        'TTS service temporarily unavailable. Please check your API key or try again later.',
        'tts_service_error',
        error
      );
    }
    
    return new VoiceError(
      'Text-to-speech failed. Please try again.',
      'tts_general_error',
      error
    );
  }

  handleAudioPlaybackError(error: Error): VoiceError {
    console.error('Audio Playback Error:', error);
    
    if (error.message.includes('parameter 1 is not of type \'ArrayBuffer\'')) {
      return new VoiceError(
        'Invalid audio data format. Audio data must be ArrayBuffer.',
        'invalid_audio_format',
        error
      );
    }
    
    if (error.message.includes('suspended')) {
      return new VoiceError(
        'Audio context suspended. Please interact with the page to enable audio.',
        'audio_context_suspended',
        error
      );
    }
    
    return new VoiceError(
      'Audio playback failed. Please check your audio settings.',
      'audio_playback_error',
      error
    );
  }

  handleVoiceInputError(error: Error): VoiceError {
    console.error('Voice Input Error:', error);
    
    if (error.message.includes('getUserMedia') || error.message.includes('microphone')) {
      return new VoiceError(
        'Microphone access denied. Please enable microphone permissions.',
        'microphone_access_error',
        error
      );
    }
    
    if (error.message.includes('SpeechRecognition') || error.message.includes('Web Speech')) {
      return new VoiceError(
        'Speech recognition not supported in this browser. Please use Chrome or Edge.',
        'speech_recognition_unsupported',
        error
      );
    }
    
    if (error.message.includes('network') || error.message.includes('offline')) {
      return new VoiceError(
        'Speech recognition requires internet connection.',
        'network_error',
        error
      );
    }
    
    return new VoiceError(
      'Voice input failed. Please check your microphone and try again.',
      'voice_input_error',
      error
    );
  }

  handleSTTProviderError(error: Error, provider: string): VoiceError {
    console.error(`STT Provider Error (${provider}):`, error);
    
    if (error.message.includes('Unsupported STT provider')) {
      return new VoiceError(
        `Speech-to-text provider '${provider}' is not supported. Please use webSpeech, whisper, azure, or google.`,
        'unsupported_stt_provider',
        error
      );
    }
    
    if (error.message.includes('API key')) {
      return new VoiceError(
        `API key required for ${provider} speech-to-text service.`,
        'api_key_missing',
        error
      );
    }
    
    return new VoiceError(
      `Speech-to-text service (${provider}) failed. Please try again.`,
      'stt_provider_error',
      error
    );
  }

  handleWakeWordError(error: Error): VoiceError {
    console.error('Wake Word Error:', error);
    
    return new VoiceError(
      'Wake word detection failed. Continuing without wake word functionality.',
      'wake_word_error',
      error
    );
  }

  handleVADError(error: Error): VoiceError {
    console.error('VAD Error:', error);
    
    return new VoiceError(
      'Voice activity detection failed. Continuing with manual controls.',
      'vad_error',
      error
    );
  }

  logError(error: VoiceError): void {
    const errorData = {
      message: error.message,
      type: error.type,
      timestamp: error.timestamp,
      stack: error.stack,
      originalError: error.originalError?.message
    };
    
    console.error('Voice System Error:', errorData);
    
    // In a production app, you might send this to a logging service
    // this.sendToLoggingService(errorData);
  }

  getErrorMessage(error: any): string {
    if (error instanceof VoiceError) {
      return error.message;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    if (typeof error === 'string') {
      return error;
    }
    
    return 'An unknown error occurred';
  }

  isRecoverableError(error: VoiceError): boolean {
    const recoverableTypes = [
      'network_error',
      'audio_context_suspended',
      'tts_service_error'
    ];
    
    return recoverableTypes.includes(error.type);
  }
}

// Singleton instance
const errorHandler = new ErrorHandler();
export { errorHandler };