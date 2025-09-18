// OpenAI Realtime Speech-to-Speech Integration
import OpenAI from 'openai';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class OpenAIRealtimeVoice extends EventEmitter {
  private openai: OpenAI;
  private ws: WebSocket | null = null;
  private apiKey: string;
  private sessionId: string;
  private isConnected: boolean = false;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
    this.sessionId = `realtime-${Date.now()}`;
    this.openai = new OpenAI({ apiKey });
  }

  async connect() {
    try {
      // Note: OpenAI's Realtime API endpoint (when available)
      // For now, we'll implement the pattern that will work when the API is released
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4-realtime`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      this.ws.on('open', () => {
        console.log('Connected to OpenAI Realtime API');
        this.isConnected = true;
        this.emit('connected');
        
        // Send initial configuration
        this.sendMessage({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: 'You are Luna, a helpful voice assistant. Respond naturally and conversationally.',
            voice: 'alloy',
            input_audio_format: 'webm-opus',
            output_audio_format: 'mp3',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        });
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        console.log('Disconnected from OpenAI Realtime API');
        this.isConnected = false;
        this.emit('disconnected');
      });

    } catch (error) {
      console.error('Failed to connect to OpenAI Realtime:', error);
      this.emit('error', error);
    }
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'conversation.item.created':
        if (message.item.role === 'assistant') {
          this.emit('assistant-speaking', message.item);
        }
        break;

      case 'response.audio.delta':
        // Stream audio chunks as they arrive
        this.emit('audio-chunk', Buffer.from(message.delta, 'base64'));
        break;

      case 'response.audio.done':
        // Complete audio response received
        this.emit('audio-complete');
        break;

      case 'response.text.delta':
        // Stream text as it's generated
        this.emit('text-chunk', message.delta);
        break;

      case 'response.text.done':
        // Complete text response
        this.emit('text-complete', message.text);
        break;

      case 'input_audio_buffer.speech_started':
        this.emit('user-started-speaking');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emit('user-stopped-speaking');
        break;

      case 'error':
        console.error('Realtime API error:', message.error);
        this.emit('error', new Error(message.error.message));
        break;
    }
  }

  sendAudioChunk(audioData: ArrayBuffer) {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    // Send audio data as base64
    const base64Audio = Buffer.from(audioData).toString('base64');
    this.sendMessage({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    });
  }

  sendText(text: string) {
    if (!this.isConnected || !this.ws) {
      throw new Error('Not connected to OpenAI Realtime API');
    }

    this.sendMessage({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text
        }]
      }
    });

    // Trigger response generation
    this.sendMessage({
      type: 'response.create'
    });
  }

  private sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  interrupt() {
    if (!this.isConnected || !this.ws) return;

    this.sendMessage({
      type: 'response.cancel'
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

// Fallback implementation using standard APIs until Realtime is available
export class OpenAIVoiceFallback extends EventEmitter {
  private openai: OpenAI;

  constructor(apiKey: string) {
    super();
    this.openai = new OpenAI({ apiKey });
  }

  async processAudioWithWhisper(audioBlob: Blob): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openai.apiKey}`
        },
        body: formData
      });

      const result = await response.json();
      return result.text;
    } catch (error) {
      console.error('Whisper transcription failed:', error);
      throw error;
    }
  }

  async generateResponse(text: string, context: any[]): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'You are Luna, a helpful voice assistant. Be conversational and natural.' },
          ...context,
          { role: 'user', content: text }
        ],
        temperature: 0.7,
        stream: true
      });

      let fullResponse = '';
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
        this.emit('text-chunk', content);
      }

      return fullResponse;
    } catch (error) {
      console.error('OpenAI completion failed:', error);
      throw error;
    }
  }

  async generateSpeech(text: string): Promise<Buffer> {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: 'nova',
        input: text,
        speed: 1.0
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer;
    } catch (error) {
      console.error('OpenAI TTS failed:', error);
      throw error;
    }
  }

  async processConversationTurn(audioBlob: Blob, context: any[]): Promise<{
    transcript: string;
    response: string;
    audioBuffer: Buffer;
  }> {
    // 1. Transcribe user audio
    const transcript = await this.processAudioWithWhisper(audioBlob);
    this.emit('transcription', transcript);

    // 2. Generate text response
    const response = await this.generateResponse(transcript, context);
    this.emit('response', response);

    // 3. Generate speech from response
    const audioBuffer = await this.generateSpeech(response);
    this.emit('audio-ready', audioBuffer);

    return { transcript, response, audioBuffer };
  }
}
