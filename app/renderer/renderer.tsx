import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { getAudioService } from './services/AudioService';

// Global error handlers for unhandled promise rejections and errors
function setupGlobalErrorHandlers() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Check if it's a voice-related error
    const isVoiceError = event.reason?.message?.includes('Speech recognition') ||
                        event.reason?.message?.includes('Microphone') ||
                        event.reason?.message?.includes('audio') ||
                        event.reason?.message?.includes('voice');
    
    if (isVoiceError) {
      console.warn('Voice-related unhandled promise rejection:', event.reason);
      // Don't prevent default for voice errors - let them be handled gracefully
    } else {
      // For non-voice errors, you might want to show user notification
      console.error('Non-voice unhandled promise rejection:', event.reason);
    }
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
  });

  console.log('Global error handlers initialized');
}

// Initialize audio service and IPC listeners for TTS
function initializeTTSHandlers() {
  const audioService = getAudioService();
  
  try {
    if (!window.voiceIPC) {
      console.warn('VoiceIPC not available');
      return;
    }
    
    // Handle TTS audio data from main process
    // Listen for TTS-ready events from main process
    window.voiceIPC.on('tts-ready', (audioBuffer: ArrayBuffer) => {
      audioService.playAudioBuffer(audioBuffer).catch(error => {
        console.error('TTS playback error:', error);
      });
    });

    console.log('TTS audio handlers initialized');
  } catch (error) {
    console.error('Failed to initialize TTS handlers:', error);
  }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element not found');
  }

  const root = createRoot(container);
  root.render(
    <ErrorBoundary 
      onError={(error, errorInfo) => {
        console.error('Global error boundary caught:', error, errorInfo);
      }}
    >
      <App />
    </ErrorBoundary>
  );

  // Setup global error handlers
  setupGlobalErrorHandlers();
  
  // Initialize TTS handlers after DOM is ready
  initializeTTSHandlers();
});

// Handle hot reload in development
declare const module: any;
if (typeof module !== 'undefined' && module.hot) {
  module.hot.accept('./App', async () => {
    const { default: NextApp } = await import('./App');
    const container = document.getElementById('root');
    if (container) {
      const root = createRoot(container);
      root.render(<NextApp />);
    }
  });
}

