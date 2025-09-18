import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import ParticleField from './ParticleField';
import { VoiceErrorBoundary } from './ErrorBoundary';
import { SecurityService } from '../services/SecurityService';
import { getDatabaseService } from '../services/DatabaseService';
import '../styles/luxury.css';
import { API_BASE, apiFetch, initializeSecureSession } from '../services/config';

// Enhanced Voice Imports
import { GlobalDebugService } from '../services/GlobalDebugService';
import { getEnhancedVoiceService } from '../services/EnhancedVoiceService';
import { getFinalVoiceConfig } from '../config/voiceConfig';
import EnhancedVoiceControls from './EnhancedVoiceControls'; // Import directly instead of lazy loading

// Lazy load heavy components for code splitting
const StreamingConversation = lazy(() => import('./StreamingConversation'));
const ToolsPanel = lazy(() => import('./ToolsPanel'));
const WakeWordListener = lazy(() => import('./WakeWordListener'));

// Import voice service normally (can't lazy load this as it's used in hooks)
import { getVoiceService } from '../services/VoiceService';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  audioUrl?: string;
  duration?: number;
  tokens?: number;
  conversationId?: string;
  encrypted?: boolean;
}

interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  wakeWordActive: boolean;
  noiseLevel: number;
  transcript: string;
  isConnected: boolean;
  lastError?: string;
}

interface ToolExecution {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  progress?: number;
  result?: any;
  error?: string;
}

interface SecurityStatus {
  authenticated: boolean;
  sessionId?: string;
  csrfToken?: string;
  rateLimitRemaining: number;
  securityLevel: 'low' | 'medium' | 'high';
}

interface SystemHealth {
  voice: boolean;
  database: boolean;
  security: boolean;
  server: boolean;
  lastCheck: Date;
}

const LuxuryApp: React.FC = () => {
  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  
  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    wakeWordActive: (window as any).__ENV?.WAKE_WORD_ENABLED === true || false,
    noiseLevel: 0,
    transcript: '',
    isConnected: false
  });

  // Security state
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>({
    authenticated: false,
    rateLimitRemaining: 100,
    securityLevel: 'medium'
  });

  // System health
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    voice: false,
    database: false,
    security: false,
    server: false,
    lastCheck: new Date()
  });

  // UI state
  const [isTyping, setIsTyping] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-2024-08-06');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [errorRecoveryCount, setErrorRecoveryCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(true);
  const [currentPersona, setCurrentPersona] = useState('general');
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [showEnhancedControls, setShowEnhancedControls] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioVisualizerRef = useRef<HTMLCanvasElement>(null);
  const voiceServiceRef = useRef(getVoiceService());
  const enhancedVoiceServiceRef = useRef(getEnhancedVoiceService());
  const securityServiceRef = useRef(new SecurityService());
  const databaseServiceRef = useRef(getDatabaseService());
  const recoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const healthCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  // Initialize services and establish secure connection
  useEffect(() => {
    let mounted = true;
    
    const initializeSecureApp = async () => {
      try {
        setConnectionStatus('connecting');
        
        // Initialize security service first
        await securityServiceRef.current.initialize();
        console.log('Security service initialized');
        
        // Initialize database service
        await databaseServiceRef.current.initialize();
        console.log('Database service initialized');
        
        // Create or retrieve session with cold boot resilience
        await initializeSecureSessionWithResilience();
        
        // Initialize voice service with security context
        await initializeVoiceService();
        
        // Initialize enhanced voice system
        await initializeEnhancedVoiceSystem();
        
        // Initialize global debug service (enables Ctrl+Shift+D)
        GlobalDebugService.initializeGlobally();
        
        // Load conversation history
        await loadConversationHistory();
        
        // Start health monitoring
        startHealthMonitoring();
        
        // Start heartbeat
        startHeartbeat();
        
        if (mounted) {
          setConnectionStatus('connected');
          setSystemHealth(prev => ({
            ...prev,
            security: true,
            database: true,
            server: true,
            lastCheck: new Date()
          }));
          
          console.log('Luna Agent fully initialized with security');
        }
        
      } catch (error) {
        console.error('Failed to initialize secure app:', error);
        if (mounted) {
          setConnectionStatus('disconnected');
          setVoiceState(prev => ({ 
            ...prev, 
            isListening: false,
            isProcessing: false,
            isSpeaking: false,
            isConnected: false,
            lastError: error instanceof Error ? error.message : 'Initialization failed'
          }));
        }
        
        // UX guard - clear token and show user-friendly message
        try { localStorage.removeItem('luna-session-id'); } catch {}
        
        // Limited recovery attempts to prevent infinite loops
        if (mounted && errorRecoveryCount < 3) {
          setErrorRecoveryCount(prev => prev + 1);
          const delay = 5000 * Math.pow(2, errorRecoveryCount); // Exponential backoff
          console.warn(`App initialization failed, attempting recovery in ${delay}ms (attempt ${errorRecoveryCount + 1}/3)`);
          setTimeout(() => {
            if (mounted) {
              initializeSecureApp();
            }
          }, delay);
        } else {
          console.error('App initialization failed permanently after multiple attempts');
          setInitError('Your session expired. We\'ll grab a new one when you try again.');
          setIsInitializing(false);
        }
      }
    };
    
    initializeSecureApp();

    // Cleanup function
    return () => {
      mounted = false;
      
      if (recoveryTimeoutRef.current) {
        clearTimeout(recoveryTimeoutRef.current);
      }
      
      if (healthCheckInterval.current) {
        clearInterval(healthCheckInterval.current);
      }
      
      if (heartbeatInterval.current) {
        clearInterval(heartbeatInterval.current);
      }
      
      try {
        voiceServiceRef.current.destroy();
        enhancedVoiceServiceRef.current.destroy();
        securityServiceRef.current.cleanup();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    };
  }, []);

  const initializeSecureSessionWithResilience = async () => {
    try {
      // Cold boot resilience reset - clear stale tokens on fresh app start
      if (performance?.now && performance.now() < 3000) {
        // very first run after app start → clear obviously stale token
        try { localStorage.removeItem('luna-session-id'); } catch {}
      }

      // Use the bulletproof session initialization
      await initializeSecureSession();
      
      // Get CSRF token
      const csrfResponse = await apiFetch('/api/auth/csrf-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      let csrfToken = '';
      if (csrfResponse.ok) {
        const csrfData = await csrfResponse.json();
        csrfToken = csrfData.csrfToken;
      }
      
      const sessionId = localStorage.getItem('luna-session-id') || 'anonymous';
      
      setSecurityStatus({
        authenticated: true,
        sessionId,
        csrfToken,
        rateLimitRemaining: 100,
        securityLevel: 'high'
      });
      
      // Create conversation ID for this session
      const conversationId = `conv_${sessionId}_${Date.now()}`;
      setCurrentConversationId(conversationId);
      
      // Store conversation in database
      await databaseServiceRef.current.createConversation(conversationId);
      
      // Mark initialization as complete
      setIsInitializing(false);
      
    } catch (error) {
      console.error('Failed to initialize secure session with resilience:', error);
      
      // UX guard - clear token and show user-friendly message
      try { localStorage.removeItem('luna-session-id'); } catch {}
      
      // Show error but don't fail permanently - let user retry
      setVoiceState(prev => ({ 
        ...prev, 
        lastError: 'Your session expired. We\'ll grab a new one when you try again.' 
      }));
      
      throw error;
    }
  };

  const initializeVoiceService = async () => {
    try {
      await voiceServiceRef.current.initialize();
      
      // Setup voice service event listeners with security context
      voiceServiceRef.current.on('tts_started', () => {
        setVoiceState(prev => ({ ...prev, isSpeaking: true }));
      });

      voiceServiceRef.current.on('tts_ended', () => {
        setVoiceState(prev => ({ ...prev, isSpeaking: false }));
      });

      voiceServiceRef.current.on('listening_started', () => {
        console.log('Voice service: listening started');
        setVoiceState(prev => ({ ...prev, isListening: true, isProcessing: false, isConnected: true }));
      });

      voiceServiceRef.current.on('listening_stopped', () => {
        console.log('Voice service: listening stopped');
        setVoiceState(prev => ({ ...prev, isListening: false, transcript: '' }));
      });

      voiceServiceRef.current.on('transcription_received', async (transcript: string) => {
        console.log('Transcription received:', transcript);
        
        // Security validation
        const validation = securityServiceRef.current.validateInput(transcript);
        if (!validation.valid) {
          console.warn('Invalid voice input detected:', validation.issues);
          setVoiceState(prev => ({ 
            ...prev, 
            lastError: 'Voice input failed security validation',
            transcript: '' 
          }));
          return;
        }
        
        const sanitizedTranscript = securityServiceRef.current.sanitizeText(transcript);
        setInputValue(sanitizedTranscript);
        setVoiceState(prev => ({ ...prev, transcript: sanitizedTranscript }));
        
        // Auto-send message for continuous conversation
        if (sanitizedTranscript.trim()) {
          setTimeout(() => {
            handleSendMessage();
          }, 500);
        }
      });

      voiceServiceRef.current.on('volume-level', (level: number) => {
        setVoiceState(prev => ({ ...prev, noiseLevel: level * 100 }));
        updateAudioVisualizer(level * 100);
      });

      voiceServiceRef.current.on('voice-input-error', (error: any) => {
        console.error('Voice input error:', error);
        setVoiceState(prev => ({ 
          ...prev, 
          isListening: false, 
          isProcessing: false, 
          transcript: '',
          lastError: error.message || 'Voice input error'
        }));
        
        // Log security event
        securityServiceRef.current.logSecurityEvent(
          'suspicious_activity',
          `Voice input error: ${error.message}`
        );
      });

      setSystemHealth(prev => ({ ...prev, voice: true, lastCheck: new Date() }));
      
    } catch (error) {
      console.error('Failed to initialize voice service:', error);
      setSystemHealth(prev => ({ ...prev, voice: false, lastCheck: new Date() }));
      throw error;
    }
  };

  const initializeEnhancedVoiceSystem = async () => {
    try {
      console.log('[LuxuryApp] Initializing enhanced voice system...');
      
      // Get optimal configuration for user's environment
      const voiceConfig = getFinalVoiceConfig();
      console.log('[LuxuryApp] Using voice configuration:', voiceConfig);
      
      // Update enhanced voice service with optimal config
      enhancedVoiceServiceRef.current.updateConfig(voiceConfig);
      
      // Initialize the enhanced voice service
      await enhancedVoiceServiceRef.current.initialize();
      
      console.log('[LuxuryApp] Enhanced voice system initialized successfully');
      console.log(`
🎤 Luna Enhanced Voice System Ready!

Features Available:
• Press Ctrl+Shift+D for debug panel
• Voice Activity Detection (auto-detect speech)
• Push-to-Talk mode (${voiceConfig.pttKey} key)
• Real-time audio visualization
• Environment auto-detection

Current Configuration:
• VAD Threshold: ${voiceConfig.vadThreshold} dB
• Silence Timeout: ${voiceConfig.silenceTimeout}ms
• Noise Gate: ${voiceConfig.noiseGateThreshold} dB
• PTT Key: ${voiceConfig.pttKey}
      `);

    } catch (error: unknown) {
      console.error('[LuxuryApp] Enhanced voice system initialization failed:', error);
      // Don't throw - let the app continue with base voice service
      setVoiceState(prev => ({ 
        ...prev, 
        lastError: `Enhanced voice features unavailable: ${error instanceof Error ? error.message : String(error)}` 
      }));
    }
  };

  const loadConversationHistory = async () => {
    try {
      if (!currentConversationId) return;
      
      const result = await databaseServiceRef.current.getConversationMessages(currentConversationId);
      
      if (result && Array.isArray(result)) {
        const historicalMessages: Message[] = result.map((row: any) => ({
          id: row.id,
          role: row.role,
          content: row.content,
          timestamp: new Date(row.timestamp),
          conversationId: row.conversation_id
        }));
        
        setMessages(historicalMessages);
        console.log(`Loaded ${historicalMessages.length} historical messages`);
      }
      
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    }
  };

  const startHealthMonitoring = () => {
    healthCheckInterval.current = setInterval(async () => {
      try {
        // Check server health
        const serverResponse = await fetch(`${API_BASE}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        const serverHealthy = serverResponse.ok;
        
        // Check database health
        const dbHealthy = await databaseServiceRef.current.healthCheck();
        
        // Check voice service
        const voiceHealthy = voiceServiceRef.current.isInitializedState;
        
        // Check security service
        const securityMetrics = securityServiceRef.current.getSecurityMetrics();
        const securityHealthy = securityMetrics.bannedIPs < 100; // Arbitrary threshold
        
        setSystemHealth({
          server: serverHealthy,
          database: dbHealthy,
          voice: voiceHealthy,
          security: securityHealthy,
          lastCheck: new Date()
        });
        
        // Update connection status
        if (serverHealthy && dbHealthy) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
        
      } catch (error) {
        console.error('Health check failed:', error);
        setSystemHealth(prev => ({
          ...prev,
          server: false,
          lastCheck: new Date()
        }));
        setConnectionStatus('disconnected');
      }
    }, 30000); // Check every 30 seconds
  };

  const startHeartbeat = () => {
    heartbeatInterval.current = setInterval(async () => {
      if (securityStatus.sessionId) {
        try {
          await apiFetch('/api/auth/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          console.warn('Heartbeat failed:', error);
        }
      }
    }, 60000); // Every minute
  };

  // Audio visualizer
  const updateAudioVisualizer = (level: number) => {
    const canvas = audioVisualizerRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // Draw audio bars with security-themed colors
    const barCount = 32;
    const barWidth = width / barCount;
    const barHeight = (level / 100) * height;

    for (let i = 0; i < barCount; i++) {
      const hue = (i / barCount) * 120 + 180; // Green to blue range for security theme
      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
      gradient.addColorStop(1, `hsla(${hue}, 100%, 70%, 0.2)`);

      ctx.fillStyle = gradient;
      const randomHeight = barHeight * (0.5 + Math.random() * 0.5);
      ctx.fillRect(i * barWidth, height - randomHeight, barWidth - 2, randomHeight);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!inputValue.trim() || !securityStatus.authenticated) return;

    // Security validation
    const validation = securityServiceRef.current.validateInput(inputValue);
    if (!validation.valid) {
      console.warn('Message failed security validation:', validation.issues);
      setVoiceState(prev => ({ 
        ...prev, 
        lastError: 'Message failed security validation' 
      }));
      return;
    }

    const sanitizedInput = securityServiceRef.current.sanitizeText(inputValue);
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newMessage: Message = {
      id: messageId,
      role: 'user',
      content: sanitizedInput,
      timestamp: new Date(),
      conversationId: currentConversationId
    };

    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
    setIsTyping(true);
    setVoiceState(prev => ({ ...prev, isProcessing: true }));

    // Store message in database
    try {
      await databaseServiceRef.current.storeMessage(newMessage);
    } catch (error) {
      console.error('Failed to store message:', error);
    }

    // Create assistant message for streaming
    const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      conversationId: currentConversationId
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      if (isStreaming) {
        // Use secure streaming with session context
        await voiceServiceRef.current.chatWithStreaming(
          sanitizedInput,
          (token) => {
            // Update message with streaming tokens
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: msg.content + token }
                : msg
            ));
          },
          async (fullResponse) => {
            // Final update with complete response
            const sanitizedResponse = securityServiceRef.current.sanitizeText(fullResponse);
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId 
                ? { ...msg, content: sanitizedResponse }
                : msg
            ));

            // Store assistant response
            try {
              await databaseServiceRef.current.storeMessage({
                ...assistantMessage,
                content: sanitizedResponse
              });
            } catch (error) {
              console.error('Failed to store assistant response:', error);
            }
          }
        );
      } else {
        // Non-streaming fallback with security
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (securityStatus.csrfToken) {
          headers['X-CSRF-Token'] = securityStatus.csrfToken;
        }

        const response = await apiFetch('/api/agent/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: sanitizedInput,
            sessionId: securityStatus.sessionId,
            conversationId: currentConversationId
          })
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const responseContent = securityServiceRef.current.sanitizeText(
          data.response || data.content || 'No response received'
        );
        
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: responseContent }
            : msg
        ));

        // Store response
        await databaseServiceRef.current.storeMessage({
          ...assistantMessage,
          content: responseContent
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Log security event
      await securityServiceRef.current.logSecurityEvent(
        'suspicious_activity',
        `Chat request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      
      // Update assistant message with error
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: `Error: ${error instanceof Error ? error.message : 'Failed to process message'}` }
          : msg
      ));
    } finally {
      setIsTyping(false);
      setVoiceState(prev => ({ ...prev, isProcessing: false }));
      
      // Auto-listen: restart listening if auto-listen is enabled and we're not currently listening
      const autoListenEnabled = (window as any).__ENV?.VOICE_AUTO_LISTEN === true;
      if (autoListenEnabled && !voiceState.isListening && !voiceState.isSpeaking) {
        console.log('Auto-listen enabled, restarting listening after response...');
        setTimeout(() => {
          if (!voiceState.isListening && !voiceState.isSpeaking) {
            toggleVoiceRecording().catch(console.error);
          }
        }, 1500);
      }
    }
  }, [inputValue, isStreaming, securityStatus, currentConversationId]);

  const toggleVoiceRecording = useCallback(async () => {
    if (!securityStatus.authenticated) {
      console.error('Cannot use voice without authentication');
      return;
    }

    try {
      if (voiceState.isListening) {
        console.log('Stopping voice recording...');
        await voiceServiceRef.current.stopListening();
        setTimeout(() => {
          setVoiceState(prev => ({ 
            ...prev, 
            isListening: false, 
            isProcessing: false,
            transcript: ''
          }));
        }, 100);
      } else {
        console.log('Starting voice recording...');
        await voiceServiceRef.current.startListening();
      }
    } catch (error) {
      console.error('Voice recording toggle error:', error);
      setVoiceState(prev => ({ 
        ...prev, 
        isListening: false, 
        isProcessing: false,
        transcript: '',
        lastError: error instanceof Error ? error.message : 'Voice recording failed'
      }));
    }
  }, [voiceState.isListening, securityStatus.authenticated]);

  // Enhanced error recovery system
  const handleVoiceRecovery = useCallback(async () => {
    console.log('Initiating enhanced voice recovery...');
    setErrorRecoveryCount(prev => prev + 1);
    
    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current);
    }
    
    // Reset voice state
    setVoiceState(prev => ({
      ...prev,
      isListening: false,
      isProcessing: false,
      isSpeaking: false,
      wakeWordActive: false,
      noiseLevel: 0,
      transcript: '',
      lastError: undefined
    }));
    
    // Attempt comprehensive recovery
    recoveryTimeoutRef.current = setTimeout(async () => {
      try {
        // Reinitialize voice service
        await voiceServiceRef.current.initialize();
        
        // Validate security context
        if (!securityStatus.authenticated) {
          await initializeSecureSession();
        }
        
        console.log('Enhanced voice service recovery successful');
        setSystemHealth(prev => ({ ...prev, voice: true, lastCheck: new Date() }));
        
      } catch (error) {
        console.error('Enhanced voice service recovery failed:', error);
        setSystemHealth(prev => ({ ...prev, voice: false, lastCheck: new Date() }));
      }
    }, 1000);
  }, [securityStatus.authenticated]);

  // Automatic recovery for stuck states
  useEffect(() => {
    let stuckStateTimeout: NodeJS.Timeout;
    
    if (voiceState.isListening || voiceState.isProcessing) {
      stuckStateTimeout = setTimeout(() => {
        console.log('Detected stuck voice state, triggering enhanced recovery');
        handleVoiceRecovery();
      }, 30000);
    }
    
    return () => {
      if (stuckStateTimeout) {
        clearTimeout(stuckStateTimeout);
      }
    };
  }, [voiceState.isListening, voiceState.isProcessing, handleVoiceRecovery]);

  const toggleWakeWord = () => {
    setVoiceState(prev => ({ ...prev, wakeWordActive: !prev.wakeWordActive }));
  };

  const clearChat = async () => {
    setMessages([]);
    
    // Create new conversation
    const newConversationId = `conv_${securityStatus.sessionId}_${Date.now()}`;
    setCurrentConversationId(newConversationId);
    
    try {
      await databaseServiceRef.current.createConversation(newConversationId);
    } catch (error) {
      console.error('Failed to create new conversation:', error);
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  // Enhanced feature handlers with security context
  const handleStreamingToggle = (enabled: boolean) => {
    setIsStreaming(enabled);
    console.log('Streaming toggled:', enabled);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    console.log('Model changed to:', model);
  };

  const handlePersonaChange = (persona: string) => {
    setCurrentPersona(persona);
    console.log('Persona changed to:', persona);
  };

  const handleToolsToggle = (enabled: boolean) => {
    setToolsEnabled(enabled);
    console.log('Tools toggled:', enabled);
  };

  // Enhanced voice transcript handler
  const handleEnhancedVoiceTranscript = useCallback((transcript: string) => {
    console.log('[LuxuryApp] Enhanced voice transcript received:', transcript);
    
    // Security validation
    const validation = securityServiceRef.current.validateInput(transcript);
    if (!validation.valid) {
      console.warn('Enhanced voice input failed security validation:', validation.issues);
      setVoiceState(prev => ({ 
        ...prev, 
        lastError: 'Voice input failed security validation' 
      }));
      return;
    }

    const sanitizedTranscript = securityServiceRef.current.sanitizeText(transcript);
    setInputValue(sanitizedTranscript);
    setVoiceState(prev => ({ ...prev, transcript: sanitizedTranscript }));
    
    // Auto-send message for continuous conversation
    if (sanitizedTranscript.trim()) {
      setTimeout(() => {
        handleSendMessage();
      }, 500);
    }
  }, [handleSendMessage]);

  // Enhanced voice error handler
  const handleEnhancedVoiceError = useCallback((error: string) => {
    console.error('[LuxuryApp] Enhanced voice error:', error);
    setVoiceState(prev => ({ 
      ...prev, 
      lastError: error,
      isListening: false,
      isProcessing: false
    }));
  }, []);

  const handleExecuteTool = async (toolName: string, parameters: any) => {
    if (!securityStatus.authenticated) {
      console.error('Cannot execute tools without authentication');
      return;
    }

    const execution: ToolExecution = {
      id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: toolName,
      status: 'pending',
      startTime: new Date()
    };
    
    setToolExecutions(prev => [...prev, execution]);
    console.log('Executing tool:', toolName, parameters);
    
    try {
      // Validate tool parameters
      const validation = securityServiceRef.current.validateInput(
        JSON.stringify(parameters)
      );
      
      if (!validation.valid) {
        throw new Error('Tool parameters failed security validation');
      }

      // Update to running
      setToolExecutions(prev => prev.map(e => 
        e.id === execution.id 
          ? { ...e, status: 'running' as const, progress: 50 }
          : e
      ));
      
      // Execute tool with security context
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (securityStatus.csrfToken) {
        headers['X-CSRF-Token'] = securityStatus.csrfToken;
      }

      const response = await apiFetch('/api/agent/execute-tool', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tool: toolName,
          args: parameters,
          sessionId: securityStatus.sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`Tool execution failed: ${response.status}`);
      }

      const result = await response.json();
      
      // Update to completed
      setToolExecutions(prev => prev.map(e => 
        e.id === execution.id 
          ? { 
              ...e, 
              status: 'completed' as const, 
              progress: 100, 
              endTime: new Date(),
              result: result 
            }
          : e
      ));
      
    } catch (error) {
      console.error('Tool execution error:', error);
      
      // Update to failed
      setToolExecutions(prev => prev.map(e => 
        e.id === execution.id 
          ? { 
              ...e, 
              status: 'failed' as const, 
              endTime: new Date(),
              error: error instanceof Error ? error.message : 'Tool execution failed'
            }
          : e
      ));
    }
  };

  const handleStreamingSendMessage = (message: string, options: any) => {
    setInputValue(message);
    handleSendMessage();
  };

  const availableTools = [
    'web_search', 'calculator', 'weather', 'file_reader',
    'code_interpreter', 'image_analyzer', 'memory_recall',
    'security_scan', 'database_query'
  ];

  // Get security level color
  const getSecurityLevelColor = () => {
    switch (securityStatus.securityLevel) {
      case 'high': return '#00ff88';
      case 'medium': return '#ffa500';
      case 'low': return '#ff6b6b';
      default: return '#666';
    }
  };

  // Get connection status color
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#00ff88';
      case 'connecting': return '#ffa500';
      case 'disconnected': return '#ff6b6b';
      default: return '#666';
    }
  };

  // Show initialization screen
  if (isInitializing) {
    return (
      <div className="luxury-app dark initializing">
        <ParticleField />
        <div className="init-screen">
          <div className="init-content">
            <div className="app-icon animate-pulse">🤖</div>
            <h2>LUNA PRO</h2>
            <p>Initializing secure session...</p>
            <div className="loading-bar">
              <div className="loading-progress"></div>
            </div>
            <small>API_BASE: {API_BASE}</small>
          </div>
        </div>
      </div>
    );
  }

  // Copy error to clipboard
  const copyErrorToClipboard = async () => {
    const errorInfo = `LUNA PRO ERROR REPORT\n===================\n\nError: ${initError}\n\nAPI Base: ${API_BASE}\n\nTimestamp: ${new Date().toISOString()}\n\nSystem Info:\n- User Agent: ${navigator.userAgent}\n- Platform: ${navigator.platform}\n- Connection: ${connectionStatus}\n\nTroubleshooting Steps:\n1. Verify backend server is running on port 3000\n2. Check API keys are configured in .env\n3. Ensure auth routes are accessible\n4. Check browser console for additional errors`;
    
    try {
      await navigator.clipboard.writeText(errorInfo);
      // Brief visual feedback
      const button = document.querySelector('.copy-error-btn') as HTMLButtonElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ Copied!';
        button.style.backgroundColor = '#00ff88';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.backgroundColor = '';
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy error log:', err);
    }
  };

  // Show initialization error
  if (initError) {
    return (
      <div className="luxury-app dark error">
        <ParticleField />
        <div className="init-screen">
          <div className="init-content error-content compact">
            <div className="app-icon">❌</div>
            <h2>Initialization Failed</h2>
            <p className="error-message">{initError}</p>
            <div className="error-actions">
              <button 
                onClick={copyErrorToClipboard}
                className="copy-error-btn"
                title="Copy error details to clipboard"
              >
                📋 Copy Error Log
              </button>
              <button 
                onClick={() => {
                  setInitError(null);
                  setIsInitializing(true);
                  setErrorRecoveryCount(0); // Reset recovery count for manual retry
                  initializeSecureSession(); // Start manual retry
                }}
                className="retry-btn"
              >
                🔄 Retry
              </button>
            </div>
            <div className="error-details collapsed">
              <details>
                <summary>Show Details</summary>
                <p><strong>API Base:</strong> {API_BASE}</p>
                <p><strong>Check:</strong></p>
                <ul>
                  <li>Backend server is running on port 3000</li>
                  <li>API keys are configured in .env</li>
                  <li>Auth routes are accessible</li>
                </ul>
              </details>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`luxury-app ${darkMode ? 'dark' : 'light'} ${voiceState.isListening ? 'listening' : ''}`}>
      <ParticleField />
      
      {/* Title Bar */}
      <div className="title-bar">
        <div className="title-bar-content">
          <div className="app-title">
            <span className="app-icon">🤖</span>
            LUNA PRO
            <span className="version">v1.0</span>
          </div>
          <div className="connection-status">
            <div className={`status-indicator ${connectionStatus}`}>
              <div className="status-dot"></div>
              {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
            </div>
            
            {/* Title bar actions */}
            <button 
              className="window-control"
              onClick={() => setShowToolsPanel(!showToolsPanel)}
              title={showToolsPanel ? "Hide Tools" : "Show Tools"}
              style={{ marginLeft: '8px' }}
            >
              🧠
            </button>
            
            <button 
              className="window-control"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>
        <div className="window-controls">
          <button className="window-control minimize" title="Minimize">−</button>
          <button className="window-control maximize" title="Maximize">□</button>
          <button className="window-control close" title="Close">×</button>
        </div>
      </div>

      {/* App Content */}
      <div className="app-content">
        {/* Enhanced Voice Bar */}
        <div className="voice-bar">
          <EnhancedVoiceControls
            onTranscript={handleEnhancedVoiceTranscript}
            onError={handleEnhancedVoiceError}
            showVisualizer={true}
            enableDebugPanel={true}
            className="luna-voice-bar"
          />
        </div>
        
        {/* Main Layout */}
        <div className="main-layout">
          <div className="conversation-area">
            <div className="streaming-conversation">
              <div className="messages-container">
                {messages.length === 0 ? (
                  <div className="empty-state">
                    <div className="app-icon">🤖</div>
                    <h3>Welcome to Luna Pro</h3>
                    <p>Your AI assistant is ready. Start a conversation with voice or text.</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                      <div className="message-avatar">
                        {message.role === 'user' ? '👤' : '🤖'}
                      </div>
                      <div className="message-content">
                        <div className="message-header">
                          <span className="message-sender">{message.role}</span>
                          {message.encrypted && <span className="voice-indicator">🔒</span>}
                          <span className="message-time">{formatTime(message.timestamp)}</span>
                        </div>
                        <div className="message-text">{message.content}</div>
                        {message.tokens && (
                          <div className="message-metadata">
                            <div className="metadata-item">
                              <span>{message.tokens} tokens</span>
                            </div>
                            {message.duration && (
                              <div className="metadata-item">
                                <span>{message.duration}ms</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="message-actions">
                          <button className="action-button" title="Copy">
                            📋
                          </button>
                          <button className="action-button" title="Regenerate">
                            🔄
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                
                {isTyping && (
                  <div className="message assistant">
                    <div className="message-avatar">🤖</div>
                    <div className="message-content">
                      <div className="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
              
              {/* Input Area */}
              <div className="input-area">
                <div className="input-container">
                  <textarea
                    className="message-input"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !voiceState.isProcessing && securityStatus.authenticated) {
                        e.preventDefault();
                        handleSendMessage().catch(console.error);
                      }
                    }}
                    placeholder={
                      !securityStatus.authenticated 
                        ? "🔒 Establishing secure connection..."
                        : voiceState.isListening 
                          ? "🎤 Listening..." 
                          : "Type your message or use voice..."
                    }
                    disabled={!securityStatus.authenticated || connectionStatus === 'disconnected'}
                    rows={1}
                  />
                  <button 
                    className="send-button"
                    onClick={() => handleSendMessage().catch(console.error)}
                    disabled={!inputValue.trim() || voiceState.isProcessing || !securityStatus.authenticated}
                  >
                    ✨
                  </button>
                </div>
                <div className="input-actions">
                  <span>{inputValue.length}/2000</span>
                  <span>{messages.length} messages</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Tools Sidebar */}
          {showToolsPanel && (
            <div className={`tools-sidebar ${showToolsPanel ? '' : 'collapsed'}`}>
              <div className="tools-panel">
                <div className="tools-header">
                  <h3>AI Tools</h3>
                  <button 
                    className="collapse-button"
                    onClick={() => setShowToolsPanel(false)}
                    title="Close Tools Panel"
                  >
                    ✕
                  </button>
                </div>
                <div className="tools-content">
                  <Suspense fallback={<div>Loading tools...</div>}>
                    <ToolsPanel
                      tools={availableTools.map(name => ({ id: name, name, description: '', status: 'inactive' as const }))}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      
      {/* Notifications */}
      <div className="progress-notifications">
        {!securityStatus.authenticated && (
          <div className="notification warning">
            <div className="notification-content">
              <div className="notification-header">
                <div className="notification-text">
                  <h4>Establishing Connection</h4>
                  <p>Setting up secure session...</p>
                </div>
              </div>
            </div>
          </div>
        )}

        
        {voiceState.lastError && (
          <div className="notification error">
            <div className="notification-content">
              <div className="notification-header">
                <div className="notification-text">
                  <h4>Voice Error</h4>
                  <p>{voiceState.lastError}</p>
                </div>
                <button 
                  className="dismiss-button"
                  onClick={() => setVoiceState(prev => ({ ...prev, lastError: undefined }))}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Messages Container */}
      <main className="messages-container">
        <div className="messages-wrapper">
          {messages.length === 0 && (
            <div className="welcome-message glass-card">
              <h2 className="welcome-title">Welcome to Luna Pro Secure</h2>
              <p className="welcome-text">
                Your premium AI assistant with enterprise-grade security and voice capabilities
              </p>
              <div className="feature-pills">
                <span className="feature-pill">🔒 End-to-End Security</span>
                <span className="feature-pill">🎤 Voice Recognition</span>
                <span className="feature-pill">🧠 Multi-Model AI</span>
                <span className="feature-pill">📊 Real-time Analytics</span>
                <span className="feature-pill">🗄️ Persistent Memory</span>
                <span className="feature-pill">⚡ Streaming Responses</span>
              </div>
              {!securityStatus.authenticated && (
                <div className="security-notice" style={{
                  marginTop: '20px',
                  padding: '15px',
                  background: 'rgba(255, 150, 0, 0.1)',
                  border: '1px solid rgba(255, 150, 0, 0.3)',
                  borderRadius: '10px',
                  color: '#ffa500'
                }}>
                  🔒 Establishing secure connection...
                </div>
              )}
            </div>
          )}

          {messages.map((message) => (
            <div 
              key={message.id}
              className={`message-bubble ${message.role} glass-card ${message.encrypted ? 'encrypted' : ''}`}
            >
              <div className="message-header">
                <span className="message-role">
                  {message.role === 'user' ? '👤' : '🤖'} {message.role}
                  {message.encrypted && <span className="encryption-badge">🔒</span>}
                </span>
                <span className="message-time">{formatTime(message.timestamp)}</span>
              </div>
              <div className="message-content">{message.content}</div>
              {message.tokens && (
                <div className="message-meta">
                  <span className="token-count">{message.tokens} tokens</span>
                  {message.duration && (
                    <span className="duration">{message.duration}ms</span>
                  )}
                  {message.conversationId && (
                    <span className="conversation-id" title={message.conversationId}>
                      💬 {message.conversationId.slice(-8)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="typing-indicator glass-card">
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="typing-text">Luna is thinking securely...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Enhanced Input Area */}
      <footer className="input-area">
        <div className="input-container glass-card">
          {voiceState.isListening && (
            <div className="voice-indicator animate-in">
              <div className="voice-wave" style={{
                borderColor: getSecurityLevelColor()
              }}></div>
              <span className="voice-status">🔒 Secure Listening...</span>
              {voiceState.transcript && (
                <span className="live-transcript">{voiceState.transcript}</span>
              )}
            </div>
          )}

          <div className="input-wrapper">
            <textarea
              className="message-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !voiceState.isProcessing && securityStatus.authenticated) {
                  e.preventDefault();
                  handleSendMessage().catch(error => {
                    console.error('Enter key send error:', error);
                  });
                }
              }}
              placeholder={
                !securityStatus.authenticated 
                  ? "🔒 Establishing secure connection..."
                  : voiceState.isListening 
                    ? "🎤 Listening..." 
                    : "Type your secure message or use voice..."
              }
              disabled={!securityStatus.authenticated || connectionStatus === 'disconnected'}
              rows={1}
            />

            <div className="input-actions">
              <button 
                className={`voice-btn glass-btn ${voiceState.isListening ? 'recording' : ''} ${voiceState.isProcessing ? 'processing' : ''}`}
                onClick={() => {
                  toggleVoiceRecording().catch(error => {
                    console.error('Voice button click error:', error);
                  });
                }}
                disabled={voiceState.isProcessing || voiceState.isSpeaking || !securityStatus.authenticated}
                title={
                  !securityStatus.authenticated ? 'Authentication required'
                  : voiceState.isListening ? 'Stop secure listening' 
                  : voiceState.isProcessing ? 'Processing...' 
                  : 'Start secure voice input'
                }
              >
                <div className="mic-icon">
                  {!securityStatus.authenticated ? '🔒'
                  : voiceState.isListening ? '🔴' 
                  : voiceState.isProcessing ? '⏳' 
                  : voiceState.isSpeaking ? '🔊' 
                  : '🎤'}
                </div>
                <span className="mic-status">
                  {!securityStatus.authenticated ? 'Locked'
                  : voiceState.isListening ? 'Stop' 
                  : voiceState.isProcessing ? 'Processing' 
                  : voiceState.isSpeaking ? 'Speaking' 
                  : 'Voice'}
                </span>
              </button>

              <button 
                className="send-btn glass-btn primary"
                onClick={() => {
                  handleSendMessage().catch(error => {
                    console.error('Send button click error:', error);
                  });
                }}
                disabled={!inputValue.trim() || voiceState.isProcessing || !securityStatus.authenticated}
              >
                <span className="send-icon">✨</span>
                <span className="send-text">Send</span>
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Status Bar */}
        <div className="status-bar glass-card">
          <div className="status-item">
            <span className="status-dot" style={{
              backgroundColor: securityStatus.authenticated ? getSecurityLevelColor() : '#ff6b6b'
            }}></span>
            Security: {securityStatus.authenticated ? securityStatus.securityLevel.toUpperCase() : 'LOCKED'}
          </div>
          
          <div className="status-item">
            <span className="status-dot" style={{
              backgroundColor: getConnectionStatusColor()
            }}></span>
            Connection: {connectionStatus.toUpperCase()}
          </div>
          
          <div className="status-item">
            <span className="status-dot" style={{
              backgroundColor: voiceState.isProcessing ? '#ff6b35' : systemHealth.voice ? '#00ff88' : '#666'
            }}></span>
            Voice: {voiceState.isProcessing ? 'Processing' : systemHealth.voice ? 'Ready' : 'Offline'}
          </div>
          
          <div className="status-item">
            <span className="status-dot" style={{
              backgroundColor: systemHealth.database ? '#00ff88' : '#ff6b6b'
            }}></span>
            Database: {systemHealth.database ? 'Connected' : 'Disconnected'}
          </div>
          
          <div className="status-item">
            Model: {selectedModel}
          </div>
          
          <div className="status-item">
            Messages: {messages.length}
          </div>

          {securityStatus.sessionId && (
            <div className="status-item" title={securityStatus.sessionId}>
              Session: {securityStatus.sessionId.slice(-8)}
            </div>
          )}
        </div>
      </footer>

      {/* Enhanced Voice Controls Panel */}
      {showEnhancedControls && (
        <div className="enhanced-controls-panel glass-card" style={{
          position: 'fixed',
          top: '100px',
          right: '20px',
          width: '350px',
          maxHeight: '400px',
          overflow: 'auto',
          zIndex: 10000
        }}>
          <EnhancedVoiceControls
            onTranscript={handleEnhancedVoiceTranscript}
            onError={handleEnhancedVoiceError}
            showVisualizer={true}
            enableDebugPanel={true}
            className="luna-enhanced-panel"
          />
        </div>
      )}

      {/* Tools Panel */}
      {showToolsPanel && (
        <div className="tools-panel-container glass-card" style={{
          position: 'fixed',
          bottom: '100px',
          right: '20px',
          width: '400px',
          maxHeight: '300px',
          zIndex: 10000
        }}>
          <Suspense fallback={<div className="loading-indicator">Loading tools panel...</div>}>
            <ToolsPanel
              tools={availableTools.map(name => ({ id: name, name, description: '', status: 'inactive' as const }))}
            />
          </Suspense>
        </div>
      )}

      {/* Enhanced Settings Panel */}
      {showSettings && (
        <div className="settings-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>🔒 Settings</h3>
              <button onClick={() => setShowSettings(false)}>✕</button>
            </div>
          <div className="modal-body">
            <div className="setting-group">
              <label>Security Status</label>
              <div style={{ color: getSecurityLevelColor(), fontWeight: 'bold' }}>
                {securityStatus.authenticated ? `🔒 ${securityStatus.securityLevel.toUpperCase()}` : '🔒 LOCKED'}
              </div>
            </div>

            <div className="setting-group">
              <label>System Health</label>
              <div>
                <div style={{ color: systemHealth.voice ? '#00ff88' : '#ff6b6b', marginBottom: '4px' }}>
                  🎤 Voice: {systemHealth.voice ? '✅' : '❌'}
                </div>
                <div style={{ color: systemHealth.database ? '#00ff88' : '#ff6b6b', marginBottom: '4px' }}>
                  🗄️ Database: {systemHealth.database ? '✅' : '❌'}
                </div>
                <div style={{ color: systemHealth.server ? '#00ff88' : '#ff6b6b' }}>
                  📡 Server: {systemHealth.server ? '✅' : '❌'}
                </div>
              </div>
            </div>
            
            <div className="setting-group">
              <label>Model Selection</label>
              <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!securityStatus.authenticated}
              >
                <option value="gpt-4o-2024-08-06">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                <option value="ollama:llama3.2">Llama 3.2 (Local)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>Actions</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => setDarkMode(!darkMode)}
                  style={{ 
                    padding: '8px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-bg)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  {darkMode ? '🌙 Dark' : '☀️ Light'}
                </button>
                
                <button 
                  onClick={() => setShowToolsPanel(!showToolsPanel)}
                  style={{ 
                    padding: '8px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-bg)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  🧠 {showToolsPanel ? 'Hide' : 'Show'} Tools
                </button>
                
                <button 
                  onClick={clearChat}
                  disabled={!securityStatus.authenticated}
                  style={{ 
                    padding: '8px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-bg)',
                    color: 'var(--text-primary)',
                    cursor: securityStatus.authenticated ? 'pointer' : 'not-allowed',
                    opacity: securityStatus.authenticated ? 1 : 0.5
                  }}
                >
                  🗑️ Clear Chat
                </button>
                
                {errorRecoveryCount > 0 && (
                  <button 
                    onClick={handleVoiceRecovery}
                    style={{ 
                      padding: '8px 16px',
                      border: '1px solid var(--accent-error)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--accent-error)',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Reset Voice ({errorRecoveryCount})
                  </button>
                )}
              </div>
            </div>
            
            <div className="setting-group">
              <label>Session Info</label>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Last Check: {systemHealth.lastCheck.toLocaleTimeString()}
                {securityStatus.sessionId && (
                  <><br />Session: {securityStatus.sessionId.slice(-8)}</>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
      
      {/* Wake Word Listener - Enhanced with security context */}
      {voiceState.wakeWordActive && securityStatus.authenticated && (
        <Suspense fallback={<div className="loading-indicator">Loading wake word detection...</div>}>
          <WakeWordListener
            accessKey={(window as any).__ENV?.PICOVOICE_ACCESS_KEY || ''}
            onWakeWordDetected={(label) => {
              console.log('Wake word detected from secure LuxuryApp:', label);
              if (!voiceState.isListening && !voiceState.isProcessing && securityStatus.authenticated) {
                console.log('Triggering secure voice recording from wake word.');
                toggleVoiceRecording();
              }
            }}
            enabled={voiceState.wakeWordActive && securityStatus.authenticated}
          />
        </Suspense>
      )}
    </div>
  );
};

export default LuxuryApp;
