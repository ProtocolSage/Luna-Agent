import React, { useEffect, useState, useRef, useCallback } from 'react';
import { WebSocketSTTClient } from '../services/WebSocketSTTClient';

interface WebSocketSTTControlsProps {
  onTranscription?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  autoConnect?: boolean;
  className?: string;
}

interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export const WebSocketSTTControls: React.FC<WebSocketSTTControlsProps> = ({
  onTranscription,
  onError,
  autoConnect = true,
  className = ''
}) => {
  // Service reference
  const sttClientRef = useRef<WebSocketSTTClient | null>(null);
  
  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState('');
  const [bufferStatus, setBufferStatus] = useState<any>(null);
  
  /**
   * Initialize STT client
   */
  const initializeClient = useCallback(async () => {
    try {
      console.log('[WebSocketSTTControls] Initializing client...');
      setConnectionStatus('connecting');
      setError(null);
      
      const client = new WebSocketSTTClient();
      sttClientRef.current = client;
      
      // Set up event listeners
      client.on('connected', () => {
        console.log('[WebSocketSTTControls] Connected');
        setIsConnected(true);
        setConnectionStatus('connected');
      });
      
      client.on('disconnected', () => {
        console.log('[WebSocketSTTControls] Disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
      });
      
      client.on('ready', (data) => {
        console.log('[WebSocketSTTControls] Session ready:', data.sessionId);
      });
      
      client.on('transcription', (result: any) => {
        console.log('[WebSocketSTTControls] Transcription:', result.text, 'Final:', result.isFinal);
        
        if (result.isFinal) {
          // Add final transcription to history
          setTranscriptions(prev => [...prev, {
            text: result.text,
            isFinal: true,
            timestamp: result.timestamp
          }]);
          setCurrentTranscription('');
        } else {
          // Update current partial transcription
          setCurrentTranscription(result.text);
        }
        
        // Notify parent
        onTranscription?.(result.text, result.isFinal);
      });
      
      client.on('processing', (data) => {
        console.log('[WebSocketSTTControls] Processing:', data);
        setBufferStatus(data);
      });
      
      client.on('error', (err) => {
        console.error('[WebSocketSTTControls] Error:', err);
        const errorMsg = typeof err === 'string' ? err : err.message || 'Unknown error';
        setError(errorMsg);
        setConnectionStatus('error');
        onError?.(errorMsg);
      });
      
      client.on('recording-started', () => {
        setIsRecording(true);
      });
      
      client.on('recording-stopped', () => {
        setIsRecording(false);
      });
      
      // Connect to server
      await client.connect();
      
    } catch (error) {
      console.error('[WebSocketSTTControls] Initialization failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to initialize';
      setError(errorMsg);
      setConnectionStatus('error');
      onError?.(errorMsg);
    }
  }, [onTranscription, onError]);
  
  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    if (autoConnect) {
      initializeClient();
    }
    
    return () => {
      if (sttClientRef.current) {
        sttClientRef.current.disconnect();
      }
    };
  }, [autoConnect, initializeClient]);
  
  /**
   * Start recording
   */
  const handleStartRecording = useCallback(async () => {
    if (!sttClientRef.current || !isConnected) {
      setError('Not connected to server');
      return;
    }
    
    try {
      await sttClientRef.current.startRecording();
    } catch (error) {
      console.error('[WebSocketSTTControls] Failed to start recording:', error);
      setError('Failed to start recording');
    }
  }, [isConnected]);
  
  /**
   * Stop recording
   */
  const handleStopRecording = useCallback(() => {
    if (sttClientRef.current) {
      sttClientRef.current.stopRecording();
    }
  }, []);
  
  /**
   * Connect/Disconnect
   */
  const handleToggleConnection = useCallback(async () => {
    if (isConnected && sttClientRef.current) {
      sttClientRef.current.disconnect();
    } else {
      await initializeClient();
    }
  }, [isConnected, initializeClient]);
  
  /**
   * Clear transcriptions
   */
  const handleClearTranscriptions = useCallback(() => {
    setTranscriptions([]);
    setCurrentTranscription('');
    if (sttClientRef.current && isConnected) {
      sttClientRef.current.reset();
    }
  }, [isConnected]);
  
  // Status indicators
  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10b981'; // green
      case 'connecting': return '#f59e0b'; // amber
      case 'error': return '#ef4444'; // red
      default: return '#6b7280'; // gray
    }
  };
  
  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };
  
  return (
    <div className={`websocket-stt-controls ${className}`} style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>WebSocket Streaming STT</h3>
        <div style={{ ...styles.statusIndicator, backgroundColor: getStatusColor() }}>
          {getStatusText()}
        </div>
      </div>
      
      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}
      
      <div style={styles.controls}>
        <button
          onClick={handleToggleConnection}
          style={{
            ...styles.button,
            backgroundColor: isConnected ? '#ef4444' : '#10b981'
          }}
        >
          {isConnected ? 'Disconnect' : 'Connect'}
        </button>
        
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={!isConnected}
          style={{
            ...styles.button,
            ...styles.recordButton,
            backgroundColor: isRecording ? '#ef4444' : '#3b82f6',
            opacity: isConnected ? 1 : 0.5
          }}
        >
          {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
        </button>
        
        <button
          onClick={handleClearTranscriptions}
          disabled={!isConnected || transcriptions.length === 0}
          style={{
            ...styles.button,
            opacity: (isConnected && transcriptions.length > 0) ? 1 : 0.5
          }}
        >
          Clear
        </button>
      </div>
      
      {bufferStatus && (
        <div style={styles.bufferStatus}>
          <small style={styles.statusText}>
            Buffer: {bufferStatus.chunks} chunks, {Math.round(bufferStatus.totalBytes / 1024)}KB
            {bufferStatus.isProcessing && ' ⚡ Processing...'}
          </small>
        </div>
      )}
      
      <div style={styles.transcriptionArea}>
        <div style={styles.transcriptionLabel}>Transcriptions:</div>
        
        {currentTranscription && (
          <div style={styles.partialTranscription}>
            <em style={styles.partialText}>{currentTranscription}</em>
            <span style={styles.partialIndicator}> (partial)</span>
          </div>
        )}
        
        {transcriptions.map((t, index) => (
          <div key={index} style={styles.transcriptionItem}>
            <span style={styles.transcriptionText}>{t.text}</span>
            <span style={styles.timestamp}>
              {new Date(t.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        
        {transcriptions.length === 0 && !currentTranscription && (
          <div style={styles.emptyState}>
            No transcriptions yet. Click "Start Recording" to begin.
          </div>
        )}
      </div>
    </div>
  );
};

// Styles
const styles = {
  container: {
    backgroundColor: '#1f2937',
    borderRadius: '12px',
    padding: '20px',
    color: '#f3f4f6',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    maxWidth: '800px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600
  },
  statusIndicator: {
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'white'
  },
  error: {
    backgroundColor: '#7f1d1d',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    fontSize: '14px'
  },
  controls: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const
  },
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    color: 'white',
    fontWeight: 500,
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'opacity 0.2s',
    backgroundColor: '#6b7280'
  },
  recordButton: {
    flex: 1,
    minWidth: '150px'
  },
  bufferStatus: {
    backgroundColor: '#374151',
    borderRadius: '6px',
    padding: '8px 12px',
    marginBottom: '16px'
  },
  statusText: {
    fontSize: '12px',
    color: '#9ca3af'
  },
  transcriptionArea: {
    backgroundColor: '#111827',
    borderRadius: '8px',
    padding: '16px',
    maxHeight: '400px',
    overflowY: 'auto' as const
  },
  transcriptionLabel: {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#9ca3af'
  },
  partialTranscription: {
    padding: '12px',
    backgroundColor: '#1f2937',
    borderRadius: '6px',
    marginBottom: '12px',
    borderLeft: '3px solid #f59e0b'
  },
  partialText: {
    color: '#fbbf24'
  },
  partialIndicator: {
    fontSize: '12px',
    color: '#9ca3af',
    marginLeft: '8px'
  },
  transcriptionItem: {
    padding: '12px',
    backgroundColor: '#1f2937',
    borderRadius: '6px',
    marginBottom: '8px',
    borderLeft: '3px solid #10b981',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px'
  },
  transcriptionText: {
    flex: 1,
    fontSize: '14px'
  },
  timestamp: {
    fontSize: '11px',
    color: '#6b7280',
    whiteSpace: 'nowrap' as const
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    color: '#6b7280',
    fontSize: '14px'
  }
};

export default WebSocketSTTControls;
