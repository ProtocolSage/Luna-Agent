/**
 * Example: Using Chunked Streaming TTS
 * 
 * This example demonstrates how to use the streaming TTS feature
 * in a React component or vanilla JavaScript application.
 */

// ============================================================================
// Example 1: React Component with Streaming TTS
// ============================================================================

import React, { useState, useRef } from 'react';
import { playStreamingTTS, tts } from './services/api/voiceClient';

export function StreamingTTSExample() {
  const [text, setText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [useStreaming, setUseStreaming] = useState(true);
  const controllerRef = useRef<{ stop: () => void } | null>(null);

  const handleSpeak = async () => {
    if (!text.trim()) return;

    try {
      setIsPlaying(true);

      if (useStreaming) {
        // Use streaming TTS for lower latency
        const controller = await playStreamingTTS(text, {
          voiceId: 'alloy',
          provider: 'openai'
        });
        
        controllerRef.current = controller;
        
        // Wait for completion
        await controller.promise;
      } else {
        // Use non-streaming (traditional) approach
        const audioBlob = await tts(text, {
          voiceId: 'alloy',
          provider: 'openai',
          streaming: false
        });
        
        // Play the audio blob
        const audio = new Audio(URL.createObjectURL(audioBlob));
        audio.play();
        
        await new Promise<void>(resolve => {
          audio.onended = () => resolve();
        });
        
        URL.revokeObjectURL(audio.src);
      }
    } catch (error) {
      console.error('TTS Error:', error);
      alert('Failed to generate speech: ' + error.message);
    } finally {
      setIsPlaying(false);
      controllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (controllerRef.current) {
      controllerRef.current.stop();
      controllerRef.current = null;
      setIsPlaying(false);
    }
  };

  return (
    <div className="streaming-tts-demo">
      <h2>Streaming TTS Demo</h2>
      
      <div className="controls">
        <label>
          <input
            type="checkbox"
            checked={useStreaming}
            onChange={(e) => setUseStreaming(e.target.checked)}
          />
          Use Streaming (Lower Latency)
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to speak..."
        rows={4}
        style={{ width: '100%', marginBottom: '10px' }}
      />

      <div className="buttons">
        <button
          onClick={handleSpeak}
          disabled={isPlaying || !text.trim()}
        >
          {isPlaying ? 'Speaking...' : 'Speak'}
        </button>
        
        <button
          onClick={handleStop}
          disabled={!isPlaying}
        >
          Stop
        </button>
      </div>

      <div className="info">
        <p>
          {useStreaming 
            ? '🚀 Streaming mode: Audio starts playing immediately'
            : '⏳ Non-streaming mode: Wait for complete audio before playback'
          }
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Example 2: Vanilla JavaScript with Manual Chunk Processing
// ============================================================================

async function streamingTTSManualChunks() {
  const text = 'This is a test of manual chunk processing.';
  
  // Import the streaming function
  const { ttsStream } = await import('./services/api/voiceClient');
  
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  
  console.log('Starting streaming TTS...');
  const startTime = Date.now();
  
  // Process chunks as they arrive
  for await (const chunk of ttsStream(text, { voiceId: 'nova' })) {
    chunks.push(chunk);
    totalBytes += chunk.length;
    
    const elapsed = Date.now() - startTime;
    console.log(`Received chunk: ${chunk.length} bytes (total: ${totalBytes} bytes, ${elapsed}ms)`);
  }
  
  console.log(`Streaming complete: ${chunks.length} chunks, ${totalBytes} bytes, ${Date.now() - startTime}ms`);
  
  // Combine chunks into a single blob
  const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
  
  // Play the audio
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();
  
  audio.onended = () => {
    URL.revokeObjectURL(audioUrl);
    console.log('Playback complete');
  };
}

// ============================================================================
// Example 3: Comparing Streaming vs Non-Streaming Performance
// ============================================================================

async function comparePerformance() {
  const text = 'This is a performance comparison between streaming and non-streaming TTS.';
  
  console.log('=== Performance Comparison ===\n');
  
  // Test non-streaming
  console.log('Testing non-streaming TTS...');
  const nonStreamingStart = Date.now();
  const nonStreamingBlob = await tts(text, {
    provider: 'openai',
    streaming: false
  });
  const nonStreamingTTFB = Date.now() - nonStreamingStart;
  console.log(`Non-streaming TTFB: ${nonStreamingTTFB}ms`);
  console.log(`Non-streaming size: ${nonStreamingBlob.size} bytes\n`);
  
  // Test streaming
  console.log('Testing streaming TTS...');
  const streamingStart = Date.now();
  let streamingTTFB = 0;
  const streamingChunks: Uint8Array[] = [];
  
  for await (const chunk of ttsStream(text, {})) {
    if (streamingTTFB === 0) {
      streamingTTFB = Date.now() - streamingStart;
      console.log(`Streaming TTFB: ${streamingTTFB}ms (first chunk received)`);
    }
    streamingChunks.push(chunk);
  }
  
  const streamingTotal = Date.now() - streamingStart;
  const streamingSize = streamingChunks.reduce((sum, c) => sum + c.length, 0);
  console.log(`Streaming total: ${streamingTotal}ms`);
  console.log(`Streaming size: ${streamingSize} bytes`);
  console.log(`Streaming chunks: ${streamingChunks.length}\n`);
  
  // Results
  console.log('=== Results ===');
  console.log(`TTFB improvement: ${nonStreamingTTFB - streamingTTFB}ms faster (${Math.round((1 - streamingTTFB/nonStreamingTTFB) * 100)}% reduction)`);
  console.log(`Size difference: ${Math.abs(nonStreamingBlob.size - streamingSize)} bytes`);
}

// ============================================================================
// Example 4: Progressive UI Updates with Streaming
// ============================================================================

import React, { useState } from 'react';
import { ttsStream } from './services/api/voiceClient';

export function ProgressiveStreamingTTS() {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleStreamingSpeak = async () => {
    if (!text.trim()) return;

    setIsStreaming(true);
    setProgress(0);
    setStatus('Starting...');

    try {
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      for await (const chunk of ttsStream(text, {})) {
        chunks.push(chunk);
        receivedBytes += chunk.length;
        
        // Update progress (estimate based on typical audio sizes)
        const estimatedTotal = text.length * 100; // rough estimate
        const progressPercent = Math.min(95, (receivedBytes / estimatedTotal) * 100);
        setProgress(progressPercent);
        setStatus(`Streaming: ${receivedBytes} bytes received...`);
      }

      setProgress(100);
      setStatus('Playing audio...');

      // Combine and play
      const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
      const audio = new Audio(URL.createObjectURL(audioBlob));
      await audio.play();

      await new Promise<void>(resolve => {
        audio.onended = () => {
          URL.revokeObjectURL(audio.src);
          resolve();
        };
      });

      setStatus('Complete!');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setIsStreaming(false);
      setTimeout(() => {
        setProgress(0);
        setStatus('');
      }, 2000);
    }
  };

  return (
    <div className="progressive-streaming-demo">
      <h2>Progressive Streaming TTS</h2>
      
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to speak..."
        rows={4}
        style={{ width: '100%' }}
      />

      <button
        onClick={handleStreamingSpeak}
        disabled={isStreaming || !text.trim()}
      >
        {isStreaming ? 'Streaming...' : 'Speak (Streaming)'}
      </button>

      {isStreaming && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 5: Error Handling and Fallback
// ============================================================================

async function robustTTS(text: string) {
  try {
    // Try streaming first
    console.log('Attempting streaming TTS...');
    const controller = await playStreamingTTS(text, {
      voiceId: 'alloy',
      provider: 'openai'
    });
    await controller.promise;
    console.log('Streaming TTS successful');
  } catch (streamingError) {
    console.warn('Streaming TTS failed, falling back to non-streaming:', streamingError);
    
    try {
      // Fallback to non-streaming
      const audioBlob = await tts(text, {
        voiceId: 'alloy',
        provider: 'openai',
        streaming: false
      });
      
      const audio = new Audio(URL.createObjectURL(audioBlob));
      await audio.play();
      
      await new Promise<void>(resolve => {
        audio.onended = () => {
          URL.revokeObjectURL(audio.src);
          resolve();
        };
      });
      
      console.log('Non-streaming TTS successful');
    } catch (fallbackError) {
      console.error('All TTS methods failed:', fallbackError);
      throw new Error('Unable to generate speech');
    }
  }
}

// ============================================================================
// Example 6: Backend API Usage (curl examples)
// ============================================================================

/*
# Check if streaming is available
curl http://localhost:3001/api/voice/tts/check | jq

# Stream TTS (save to file)
curl -X POST http://localhost:3001/api/voice/tts/stream \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is streaming TTS!","provider":"openai","voiceId":"alloy"}' \
  --output streaming.mp3

# Non-streaming TTS (traditional)
curl -X POST http://localhost:3001/api/voice/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, this is non-streaming TTS!","provider":"openai","voiceId":"alloy"}' \
  --output traditional.mp3

# Play the results
mpv streaming.mp3
mpv traditional.mp3

# Compare sizes
ls -lh streaming.mp3 traditional.mp3
*/

// ============================================================================
// Export all examples
// ============================================================================

export {
  StreamingTTSExample,
  ProgressiveStreamingTTS,
  streamingTTSManualChunks,
  comparePerformance,
  robustTTS
};
