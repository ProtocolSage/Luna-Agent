import React, { useState, useEffect, useRef, useCallback } from 'react';
import { memAdd, memSearch, transcribeAudio } from '../services/MemoryClient';
import { tts, playMp3Blob, transcribe } from '../services/api/voiceClient';
import { transcribeBlob } from '../services/api/sttClient';
import { addMemory, memAdd as memAddCompat, memSearch as memSearchCompat } from '../services/api/memoryClient';
import * as THREE from 'three';
import './FuturisticUI.css';
import { apiFetch } from '../services/config';
import { API } from '../config/endpoints';

/** ---------- Types ---------- */
interface SpeechRecognitionInterface {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: ((event: Event) => void) | null;
}
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}
interface VoiceStatus {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  error?: string;
  useWhisper?: boolean;
}
interface PerformanceMetrics {
  model: string;
  gpuMode: boolean;
  tokensPerSec?: number;
  latency?: string;
}

/** ---------- API base ---------- */
const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
const URL_API_BASE = params.get('apiBase');
const ENV_API_BASE = (window as any)?.API_BASE || process.env.API_BASE;
const API_BASE = (URL_API_BASE || ENV_API_BASE || 'http://localhost:3000').replace(/\/+$/, '');

/** ---------- Response Parser ---------- */
function extractAssistantResponse(payload: any): string {
  if (!payload) return 'No response received.';

  // 1) Direct content field (current backend format)
  if (typeof payload.content === 'string' && payload.content.trim()) {
    return payload.content;
  }

  // 2) Legacy response/message/reasoning fields
  if (typeof payload.response === 'string' && payload.response.trim()) {
    return payload.response;
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.reasoning === 'string' && payload.reasoning.trim()) {
    return payload.reasoning;
  }

  // 3) Nested response envelope
  if (payload.response?.content && typeof payload.response.content === 'string') {
    return payload.response.content;
  }

  // 4) OpenAI chat completions format
  if (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) {
    return payload.choices[0].message.content;
  }

  // 5) Anthropic format (array of content blocks)
  if (Array.isArray(payload.content) && payload.content[0]?.text) {
    return payload.content.map((block: any) => block.text || '').join('\n');
  }

  // 6) Tool use response
  if (payload.type === 'tool_results' && payload.results) {
    return `Tool execution completed: ${JSON.stringify(payload.results, null, 2)}`;
  }

  // 7) Error responses
  if (payload.error) {
    return `Error: ${payload.error}`;
  }

  // 8) Plain string response
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  // 9) Fallback with debug info
  console.warn('Unknown response format:', payload);
  return 'Neural pathways synchronized. Response calculated.';
}

/** ---------- Persistent helpers ---------- */
const getPersist = (k: string, def: string) => {
  try { const v = localStorage.getItem(k); return v === null ? def : v; } catch { return def; }
};
const setPersist = (k: string, v: string | null) => {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {}
};

const MODE_KEY = 'luna-mode-override';           // 'gpu' | 'cpu'
const MATRIX_KEY = 'luna-matrix-on';             // 'true' | 'false'
const CV_KEY = 'luna-continuous-voice';          // 'true' | 'false'

/** ---------- Component ---------- */
const FuturisticUI: React.FC = () => {
  // Conversation
  const [messages, setMessages] = useState<Message[]>([
    { id: 'boot', role: 'system', content: 'Neural interface initialized. Ready for hyperdimensional processing...', timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastUserText, setLastUserText] = useState<string>('');

  // Voice & status
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({ isListening: false, isProcessing: false, isSpeaking: false });
  const [continuousVoice, setContinuousVoice] = useState<boolean>(getPersist(CV_KEY, 'false') === 'true');

  // Auto-transmit state
  const [autoTransmit, setAutoTransmit] = useState<boolean>(getPersist('luna-auto-transmit', 'true') === 'true');

  // UI flags
  const [partyMode, setPartyMode] = useState(false);
  const [matrixOn, setMatrixOn] = useState<boolean>(getPersist(MATRIX_KEY, 'false') === 'true');

  // Metrics (no fake counters)
  const [metrics, setMetrics] = useState<PerformanceMetrics>({ model: 'GPT-4o', gpuMode: false });

  // IDs
  const [sessionId] = useState(`luna-session-${Date.now()}`);

  // Refs
  const conversationRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);          // neural net (ThreeJS)
  const matrixCanvasRef = useRef<HTMLCanvasElement>(null);    // matrix rain
  const recognitionRef = useRef<SpeechRecognitionInterface | null>(null);

  // Visualizer refs
  const barsContainerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  // ThreeJS refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);

  /** ---------- GPU detection & mode ---------- */
  const detectGPU = useCallback(() => {
    try {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter((ext as any).UNMASKED_RENDERER_WEBGL) : '';
      const r = (renderer || '').toLowerCase();
      const software = ['swiftshader', 'llvmpipe', 'software', 'basic render', 'angle'].some(s => r.includes(s));
      return !software;
    } catch { return false; }
  }, []);

  const applyComputeMode = useCallback((mode: 'gpu'|'cpu', persist = false) => {
    setMetrics(prev => ({ ...prev, gpuMode: mode === 'gpu' }));
    if (persist) setPersist(MODE_KEY, mode);
  }, []);

  useEffect(() => {
    const override = getPersist(MODE_KEY, '');
    if (override === 'gpu' || override === 'cpu') {
      applyComputeMode(override as 'gpu'|'cpu');
    } else {
      applyComputeMode(detectGPU() ? 'gpu' : 'cpu');
    }
  }, [applyComputeMode, detectGPU]);

  /** ---------- Neural Network (ThreeJS) ---------- */
  const initNeuralNetwork = useCallback(() => {
    if (!canvasRef.current || !metrics.gpuMode) return;

    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    const nodeGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const nodes: THREE.Mesh[][] = [];
    const connections: THREE.Line[] = [];

    for (let layer = 0; layer < 5; layer++) {
      const layerNodes: THREE.Mesh[] = [];
      const nodesInLayer = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < nodesInLayer; i++) {
        const nodeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial);
        node.position.x = (layer - 2) * 15;
        node.position.y = (i - nodesInLayer / 2) * 5;
        node.position.z = Math.random() * 10 - 5;
        scene.add(node);
        layerNodes.push(node);
      }
      nodes.push(layerNodes);
    }

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff, opacity: 0.3, transparent: true });
    for (let layer = 0; layer < nodes.length - 1; layer++) {
      for (let i = 0; i < nodes[layer].length; i++) {
        for (let j = 0; j < nodes[layer + 1].length; j++) {
          if (Math.random() > 0.3) {
            const points = [nodes[layer][i].position, nodes[layer + 1][j].position];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, lineMaterial.clone());
            scene.add(line);
            connections.push(line);
          }
        }
      }
    }

    const animate = () => {
      const id = requestAnimationFrame(animate);
      (rendererRef as any).currentRaf = id;

      scene.rotation.y += 0.001;

      nodes.forEach((layer, layerIndex) => {
        layer.forEach((node, nodeIndex) => {
          const scale = 1 + Math.sin(Date.now() * 0.001 + layerIndex + nodeIndex) * 0.2;
          node.scale.set(scale, scale, scale);
          const hue = (Date.now() * 0.0001 + layerIndex * 0.1) % 1;
          (node.material as THREE.MeshBasicMaterial).color.setHSL(hue, 1, 0.5);
        });
      });

      connections.forEach((line, index) => {
        const opacity = 0.1 + Math.sin(Date.now() * 0.002 + index) * 0.3;
        (line.material as THREE.LineBasicMaterial).opacity = opacity;
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      // cleanup
      if ((rendererRef as any).currentRaf) cancelAnimationFrame((rendererRef as any).currentRaf);
      renderer.dispose();
      scene.clear();
    };
  }, [metrics.gpuMode]);

  /** ---------- Matrix Rain ---------- */
  const initMatrixRain = useCallback(() => {
    if (!matrixCanvasRef.current || !matrixOn) return;
    const canvas = matrixCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const matrix = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}';
    const arr = matrix.split('');
    const fontSize = 12;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = 'rgba(10, 11, 14, 0.04)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ffff';
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const text = arr[Math.floor(Math.random() * arr.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 35);
    return () => clearInterval(interval);
  }, [matrixOn]);

  /** ---------- Speech Recognition ---------- */
  // Whisper transcription via backend proxy (secure) - NO DUMMY TEXT!
  const transcribeWithWhisper = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      // Try new dedicated STT client first (forces backend Whisper)
      let transcript: string;
      try {
        transcript = await transcribeBlob(audioBlob);
      } catch (newTranscribeError) {
        console.warn('New STT client failed, trying voiceClient transcribe:', newTranscribeError);
        // Try voiceClient transcribe
        try {
          transcript = await transcribe(audioBlob);
        } catch (voiceClientError) {
          console.warn('Voice client transcribe failed, trying legacy client:', voiceClientError);
          // Last fallback to legacy client
          transcript = await transcribeAudio(audioBlob);
        }
      }
      
      if (!transcript.trim()) {
        throw new Error('No speech detected in audio');
      }

      // CRITICAL: No dummy text allowed! Real transcription only
      if (transcript.includes('dummy transcription') || transcript.includes('This is a dummy')) {
        throw new Error('Dummy transcription detected - forcing real Whisper');
      }

      console.log('Whisper transcription successful:', transcript);
      return transcript;
    } catch (error: any) {
      console.error('All Whisper transcription methods failed:', error);
      throw new Error(`Whisper failed: ${error.message}`);
    }
  }, []);

  // MediaRecorder-based recording for Whisper fallback
  const startWhisperRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        try {
          setVoiceStatus(p => ({ ...p, isProcessing: true }));
          const transcript = await transcribeWithWhisper(audioBlob);
          if (transcript.trim()) {
            setInputValue(transcript);
            // Auto-transmit if enabled
            if (autoTransmit) {
              setLastUserText(transcript);
              sendMessage(transcript);
            }
          }
        } catch (error) {
          setVoiceStatus(p => ({ ...p, error: 'Whisper transcription failed' }));
        } finally {
          setVoiceStatus(p => ({ ...p, isListening: false, isProcessing: false }));
          stream.getTracks().forEach(track => track.stop());
        }
      };

      setVoiceStatus(p => ({ ...p, isListening: true, error: undefined }));
      mediaRecorder.start();

      // Store recorder for stopping later
      (window as any).__whisperRecorder = mediaRecorder;
    } catch (error) {
      setVoiceStatus(p => ({ ...p, error: 'Microphone access denied' }));
    }
  }, [transcribeWithWhisper]);

  const stopWhisperRecording = useCallback(() => {
    const recorder = (window as any).__whisperRecorder;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  }, []);

  const initSpeechRecognition = useCallback(() => {
    // PRIORITY 1: Always try to use Whisper first (superior accuracy)
    console.log('Initializing voice recognition - Whisper as primary');
    setVoiceStatus(p => ({ ...p, useWhisper: true, error: undefined }));

    // PRIORITY 2: Set up Web Speech API as fallback
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        console.log('Web Speech API available as fallback');
        const recognition = new SpeechRecognition() as SpeechRecognitionInterface;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => setVoiceStatus(p => ({ ...p, isListening: true, error: undefined }));
        recognition.onresult = (event: any) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
          }
          if (transcript.trim()) {
            setInputValue(transcript);
            setLastUserText(transcript);
            sendMessage(transcript);
          }
        };
        recognition.onerror = (event: any) => setVoiceStatus(p => ({ ...p, isListening: false, error: `Voice Error: ${event.error}` }));
        recognition.onend = () => {
          setVoiceStatus(p => ({ ...p, isListening: false }));
          if (continuousVoice) { try { recognition.start(); } catch {} }
        };

        recognitionRef.current = recognition;
        console.log('Web Speech API setup complete as fallback option');
      } else {
        console.log('Web Speech API not available - Whisper only mode');
      }
    } catch (error) {
      console.warn('Error setting up Web Speech API fallback:', error);
      setVoiceStatus(p => ({ ...p, error: 'Failed to initialize voice recognition' }));
    }
  }, [continuousVoice]);

  /** ---------- Mic visualizer (WebAudio) ---------- */
  const startMicVisualizer = async () => {
    if (audioCtxRef.current && analyserRef.current) return; // already started
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      micSourceRef.current = source;

      const barsEl = barsContainerRef.current;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        analyser.getByteFrequencyData(data);
        if (!barsEl) return;
        const children = barsEl.children;
        const step = Math.floor(data.length / children.length);
        for (let i = 0; i < children.length; i++) {
          const v = data[i * step] / 255;
          const h = Math.max(10, Math.floor(v * 100));
          (children[i] as HTMLElement).style.setProperty('--bar-height', `${h}%`);
        }
      };
      loop();
    } catch {
      // leave the random CSS animation as fallback
    }
  };
  const stopMicVisualizer = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  };

  /** ---------- Voice buttons ---------- */
  const toggleVoiceListening = () => {
    if (voiceStatus.isListening) {
      // Stop whichever is currently active
      if (voiceStatus.useWhisper) {
        stopWhisperRecording();
      } else if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      stopMicVisualizer();
    } else {
      // PRIORITY 1: Try Whisper first (superior accuracy)
      if (voiceStatus.useWhisper) {
        startWhisperRecording().catch((error) => {
          console.warn('Whisper failed, falling back to Web Speech API:', error);
          // FALLBACK: Try Web Speech API if Whisper fails
          if (recognitionRef.current) {
            setVoiceStatus(p => ({ ...p, useWhisper: false, error: 'Using Web Speech API fallback' }));
            try { 
              recognitionRef.current.start(); 
              startMicVisualizer();
            } catch (e) {
              setVoiceStatus(p => ({ ...p, error: 'Both voice recognition methods failed' }));
            }
          } else {
            setVoiceStatus(p => ({ ...p, error: 'Voice recognition not available' }));
          }
        });
        startMicVisualizer();
      } else {
        // Using Web Speech API (fallback mode)
        if (recognitionRef.current) {
          try { 
            recognitionRef.current.start(); 
            startMicVisualizer();
          } catch (e) {
            setVoiceStatus(p => ({ ...p, error: 'Web Speech API failed' }));
          }
        }
      }
    }
  };

  /** ---------- Push-to-talk (hold V) ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'v' || e.key === 'V') && !e.repeat) {
        if (!voiceStatus.isListening) { try { recognitionRef.current?.start(); } catch {} }
        startMicVisualizer();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        recognitionRef.current?.stop();
        stopMicVisualizer();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [voiceStatus.isListening]);

  /** ---------- Backend calls ---------- */
  const [toast, setToast] = useState<string | null>(null);
  const toastErr = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const sendMessage = async (messageText?: string) => {
    const text = (messageText ?? inputValue).trim();
    if (!text) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLastUserText(text);
    setInputValue('');
    setIsLoading(true);

    const thinking: Message = { id: 'thinking', role: 'system', content: 'Processing neural pathways…', timestamp: new Date() };
    setMessages(prev => [...prev, thinking]);

    try {
      // Optional: Enhance prompt with relevant memories
      let contextualText = text;
      try {
        const recalled = await memSearchCompat(text, 6, sessionId);
        if (recalled?.items?.length) {
          console.log('Retrieved memories for context:', recalled.items.length);
          // Could add context to the message here if desired
        }
      } catch (memError) {
        console.warn('Memory search failed:', memError);
      }

      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: contextualText, sessionId, useTools: true })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();

      setMessages(prev => prev.filter(m => m.id !== 'thinking'));
      
      const responseContent = extractAssistantResponse(data);
      const aMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aMsg]);

      // Store conversation in memory asynchronously (using new API with compatibility)
      try {
        // Try new memory client first
        try {
          await addMemory(text, 'user', sessionId);
          await addMemory(responseContent, 'assistant', sessionId);
          console.log('Conversation stored in memory (new client)');
        } catch (newMemError) {
          console.warn('New memory client failed, using compatibility functions:', newMemError);
          // Use compatibility functions that work with fetch shim
          await memAddCompat(text, 'user', sessionId);
          await memAddCompat(responseContent, 'assistant', sessionId);
          console.log('Conversation stored in memory (compatibility)');
        }
      } catch (memError) {
        console.warn('Failed to store conversation in memory:', memError);
      }

      if (aMsg.content) await generateTTS(aMsg.content);
    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== 'thinking'));
      const eMsg: Message = { id: `e-${Date.now()}`, role: 'system', content: `Neural link disrupted. (${err?.message || 'Unknown error'})`, timestamp: new Date() };
      setMessages(prev => [...prev, eMsg]);
      toastErr('Failed to reach backend.');
    } finally {
      setIsLoading(false);
      
      // Continuous conversation mode - start listening again after response
      if (continuousVoice && !voiceStatus.isListening) {
        setTimeout(() => {
          if (!voiceStatus.isListening && !isLoading) {
            startWhisperRecording();
          }
        }, 1000); // Wait 1 second after response before listening again
      }
    }
  };

  const generateTTS = async (text: string) => {
    try {
      setVoiceStatus(p => ({ ...p, isSpeaking: true }));
      
      // Try ElevenLabs first (backend default), fallback to OpenAI happens server-side
      try {
        const audio = await tts(text, { 
          // provider: 'elevenlabs', 
          // voiceId: '21m00Tcm4TlvDq8ikWAM', 
          // stability: 0.55, 
          // similarityBoost: 0.75 
        });
        const player = playMp3Blob(audio);
        
        // Set up cleanup when audio ends
        player.element.onended = () => {
          setVoiceStatus(p => ({ ...p, isSpeaking: false }));
          player.stop();
          
          // Continuous conversation - start listening again after TTS finishes
          if (continuousVoice && !voiceStatus.isListening && !isLoading) {
            setTimeout(() => {
              if (!voiceStatus.isListening && !isLoading) {
                startWhisperRecording();
              }
            }, 500); // Short delay after TTS ends
          }
        };
        player.element.onerror = () => {
          setVoiceStatus(p => ({ ...p, isSpeaking: false }));
          player.stop();
          toastErr('Audio playback failed.');
        };
        
      } catch (err: any) {
        console.warn('TTS failed, falling back to Web Speech:', err?.message || err);
        
        // Fallback to Web Speech API
        try {
          const synth = window.speechSynthesis;
          if (synth) {
            const utter = new SpeechSynthesisUtterance(text);
            utter.onend = () => setVoiceStatus(p => ({ ...p, isSpeaking: false }));
            utter.onerror = () => {
              setVoiceStatus(p => ({ ...p, isSpeaking: false }));
              toastErr('Speech synthesis failed.');
            };
            synth.speak(utter);
          } else {
            throw new Error('No speech synthesis available');
          }
        } catch (speechErr: any) {
          setVoiceStatus(p => ({ ...p, isSpeaking: false }));
          toastErr(`All TTS options failed: ${speechErr?.message || 'Unknown error'}`);
        }
      }
    } catch (err: any) {
      setVoiceStatus(p => ({ ...p, isSpeaking: false }));
      toastErr(`TTS failed: ${err?.message || 'Unknown error'}`);
    }
  };

  const checkVoiceProviders = async () => {
    try {
      const r = await apiFetch(API.TTS_CHECK);
      if (!r.ok) throw new Error(`Voice check ${r.status}`);
      const data = await r.json();
      if (!data.availableProviders?.length) setVoiceStatus(p => ({ ...p, error: 'No voice providers available' }));
    } catch { setVoiceStatus(p => ({ ...p, error: 'Voice service unavailable' })); }
  };

  /** ---------- Effects ---------- */
  useEffect(() => { initNeuralNetwork(); }, [initNeuralNetwork]);
  useEffect(() => { const cleanup = initMatrixRain(); return cleanup; }, [initMatrixRain]);

  useEffect(() => {
    initSpeechRecognition();
    checkVoiceProviders();
    return () => { rendererRef.current?.dispose(); stopMicVisualizer(); };
  }, [initSpeechRecognition]);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => { if (inputValue.startsWith('/')) handleCommand(inputValue); }, [inputValue]);

  /** ---------- Commands ---------- */
  const handleCommand = (cmd: string) => {
    const actions: Record<string, () => void> = {
      '/party': () => setPartyMode(p => !p),
      '/matrix': () => onToggleMatrix(!matrixOn),
      '/gpu': () => onToggleGpu(),
      '/regenerate': () => { if (lastUserText) sendMessage(lastUserText); }
    };
    if (actions[cmd]) { actions[cmd](); setInputValue(''); }
  };

  /** ---------- UI handlers ---------- */
  const onToggleGpu = () => {
    const next = metrics.gpuMode ? 'cpu' : 'gpu';
    applyComputeMode(next, true);
  };
  const onToggleContinuous = (checked: boolean) => {
    setContinuousVoice(checked);
    setPersist(CV_KEY, String(checked));
    if (checked && recognitionRef.current && !voiceStatus.isListening) {
      try { recognitionRef.current.start(); } catch {}
      startMicVisualizer();
    }
    if (!checked) { recognitionRef.current?.stop(); stopMicVisualizer(); }
  };
  const onToggleMatrix = (checked: boolean) => {
    setMatrixOn(checked);
    setPersist(MATRIX_KEY, String(checked));
  };

  // Alias global toggles (CSP-safe; no inline scripts). Allows header UX to call window.toggleGpu/window.toggleMatrix
  useEffect(() => {
    (window as any).toggleGpu = (window as any).__toggleGpu || (() => onToggleGpu());
    (window as any).toggleMatrix = (checked: boolean) => onToggleMatrix(checked);
  }, [onToggleGpu]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toastErr('Copied'); } catch { toastErr('Copy failed'); }
  };

  const regenerateFromLast = () => { if (lastUserText) sendMessage(lastUserText); };

  const getVoiceStatusText = () => {
    if (voiceStatus.error) return voiceStatus.error;
    if (voiceStatus.isSpeaking) return 'VOICE: SPEAKING';
    if (voiceStatus.isListening) return 'VOICE: LISTENING';
    return 'VOICE: READY';
  };

  /** ---------- Render ---------- */
  return (
    <div className={`futuristic-ui ${partyMode ? 'party-mode' : ''} ${!matrixOn ? 'matrix-off' : ''} ${metrics.gpuMode ? '' : 'cpu-mode'}`}>
      {/* Background */}
      <div className="aurora" />
      <canvas ref={matrixCanvasRef} className="matrix-rain" />
      <canvas ref={canvasRef} className="neural-network" />
      <div className="scanlines" />
      <div className="grid-overlay" />

      <div className="main-container">
        {/* Header */}
        <header className="header">
          <div className="logo glitch" data-text="LUNA PRO">LUNA PRO</div>

          <div className="performance-metrics">
            <div className="metric">
              <span className="metric-label">Model</span>
              <span className="metric-value">{metrics.model || '—'}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Tokens/Sec</span>
              <span className="metric-value">
                {typeof metrics.tokensPerSec === 'number' ? Math.round(metrics.tokensPerSec).toLocaleString() : '—'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Latency</span>
              <span className="metric-value">{metrics.latency ?? '—'}</span>
            </div>

            <button
              id="gpu-toggle"
              className={metrics.gpuMode ? 'gpu-indicator' : 'cpu-indicator'}
              onClick={() => (window as any).toggleGpu?.()}
              title="Toggle GPU/CPU"
            >
              {metrics.gpuMode ? 'GPU MODE' : 'CPU MODE'}
            </button>

            <label className="toggle matrix-toggle" title="Toggle Matrix Rain">
              <input
                type="checkbox"
                defaultChecked={(window as any).__LUNA_BOOT?.matrixOn}
                onChange={(e) => (window as any).toggleMatrix?.(e.target.checked)}
              />
              <span>Matrix Rain</span>
            </label>

            <label className="toggle voice-toggle" title="Auto-transmit after voice input">
              <input
                type="checkbox"
                checked={autoTransmit}
                onChange={(e) => {
                  setAutoTransmit(e.target.checked);
                  setPersist('luna-auto-transmit', e.target.checked ? 'true' : 'false');
                }}
              />
              <span>Auto Send</span>
            </label>

            <label className="toggle voice-toggle" title="Continuous conversation mode">
              <input
                type="checkbox"
                checked={continuousVoice}
                onChange={(e) => {
                  setContinuousVoice(e.target.checked);
                  setPersist(CV_KEY, e.target.checked ? 'true' : 'false');
                }}
              />
              <span>Continuous</span>
            </label>


          </div>
        </header>

        {/* Conversation */}
        <div className="conversation-area" ref={conversationRef}>
          {messages.map((message) => (
            <div key={message.id} className={`message-card role-${message.role}`}>
              <span className="spine" />
              <header>
                <strong className="role-label">{message.role.toUpperCase()}</strong>
                <span className="timestamp">{message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}</span>
              </header>
              <p>{message.content}</p>

              {message.role === 'assistant' && (
                <div className="message-actions">
                  <button className="mini-btn" onClick={() => copyToClipboard(message.content)}>Copy</button>
                  <button className="mini-btn" onClick={regenerateFromLast}>Regenerate</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Voice Visualizer */}
        <div className="voice-visualizer">
          <div className="frequency-bars" ref={barsContainerRef}>
            {Array.from({ length: metrics.gpuMode ? 48 : 24 }, (_, i) => (
              <div key={i} className="frequency-bar" style={{ ['--bar-height' as any]: `${20 + Math.random() * 60}%` } as React.CSSProperties} />
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="input-container">
          <input
            type="text"
            className="input-field"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type or hold V to talk…"
            disabled={isLoading}
          />
          <button 
            className="cyber-button voice-btn" 
            onClick={toggleVoiceListening} 
            disabled={voiceStatus.isProcessing}
            title={voiceStatus.useWhisper ? 'Primary: Whisper STT (Superior)' : 'Fallback: Web Speech API'}
          >
            🎤 {voiceStatus.isListening ? 'STOP' : voiceStatus.useWhisper ? 'WHISPER' : 'VOICE'}
          </button>
          <button className="cyber-button" onClick={() => sendMessage()} disabled={isLoading || !inputValue.trim()}>
            {isLoading ? 'PROCESSING…' : 'TRANSMIT'}
          </button>
        </div>

        {/* Status */}
        <div className="status-bar">
          <div className="status-item"><span className="status-indicator" /><span>QUANTUM LINK: ACTIVE</span></div>
          <div className="status-item"><span className="status-indicator" /><span>{getVoiceStatusText()}</span></div>
          <div className="status-item"><span className="status-indicator" /><span>ENCRYPTION: AES-256</span></div>
          <div className="status-item"><span>SESSION: #{sessionId.slice(-8)}</span></div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default FuturisticUI;
