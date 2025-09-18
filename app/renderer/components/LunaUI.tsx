// Simplified Luna Voice Assistant Main UI
import React, { useState, useEffect } from 'react';
import { lunaAgent } from '../services/LunaVoiceAgent';
import { DiagnosticPanel } from './DiagnosticPanel';
import { VoiceSystemTest } from './VoiceSystemTest';
import { CredentialManager } from './CredentialManager';
import { featureFlags } from '../services/FeatureFlags';
import './LunaUI.css';

export function LunaUI() {
  const [status, setStatus] = useState('Initializing...');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showTesting, setShowTesting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);

  useEffect(() => {
    // Set up event listeners
    const handleTextChunk = (e: CustomEvent) => {
      setResponse(prev => prev + e.detail);
    };

    const handleUserSpeaking = (e: CustomEvent) => {
      setStatus(e.detail ? 'Listening...' : 'Processing...');
    };

    // Keyboard shortcuts for developer tools
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key) {
          case 'D':
            e.preventDefault();
            setShowDiagnostics(!showDiagnostics);
            break;
          case 'T':
            e.preventDefault();
            setShowTesting(!showTesting);
            break;
          case 'S':
            e.preventDefault();
            setShowSettings(!showSettings);
            break;
          case 'C':
            e.preventDefault();
            setShowSecurity(!showSecurity);
            break;
        }
      }
    };

    window.addEventListener('luna-text-chunk', handleTextChunk as any);
    window.addEventListener('luna-user-speaking', handleUserSpeaking as any);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('luna-text-chunk', handleTextChunk as any);
      window.removeEventListener('luna-user-speaking', handleUserSpeaking as any);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDiagnostics, showTesting, showSettings, showSecurity]);

  const startLuna = async () => {
    setStatus('Starting Luna...');
    setIsActive(true);
    
    try {
      await lunaAgent.start();
      setStatus('Say "Luna" to wake me, or just start talking!');
    } catch (error) {
      console.error('Failed to start Luna:', error);
      setStatus('Failed to start. Check your microphone permissions.');
      setIsActive(false);
    }
  };

  const stopLuna = () => {
    lunaAgent.stop();
    setIsActive(false);
    setStatus('Luna stopped. Click to restart.');
  };

  const handleInterrupt = () => {
    lunaAgent.interrupt();
  };

  // Auto-start on first click
  const handleContainerClick = () => {
    if (!isActive) {
      startLuna();
    }
  };

  return (
    <div className="luna-container" onClick={handleContainerClick}>
      <div className="luna-orb-container">
        <div className={`luna-orb ${isActive ? 'active' : ''}`}>
          <div className="luna-orb-inner"></div>
          <div className="luna-orb-glow"></div>
        </div>
      </div>

      <div className="luna-status">
        {status}
      </div>

      <div className="luna-messages">
        {messages.slice(-5).map((msg, idx) => (
          <div key={idx} className={`luna-message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
      </div>

      {isActive && (
        <div className="luna-controls">
          <button onClick={handleInterrupt} className="luna-btn interrupt">
            Interrupt
          </button>
          <button onClick={stopLuna} className="luna-btn stop">
            Stop Luna
          </button>
        </div>
      )}

      {!isActive && (
        <div className="luna-start-prompt">
          <h2>Luna Voice Assistant</h2>
          <p>Click anywhere to start</p>
          <div className="developer-shortcuts">
            <small>
              Developer: Ctrl+Shift+D (Diagnostics) | Ctrl+Shift+T (Testing) | Ctrl+Shift+S (Settings) | Ctrl+Shift+C (Security)
            </small>
          </div>
        </div>
      )}

      {/* Developer Tools */}
      {featureFlags.isVoiceFeatureEnabled('diagnosticPanel') && <DiagnosticPanel />}
      
      {showTesting && (
        <div className="modal-overlay" onClick={() => setShowTesting(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowTesting(false)}>×</button>
            <VoiceSystemTest />
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettings(false)}>×</button>
            <div className="settings-panel">
              <h2>🎛️ Feature Settings</h2>
              <div className="feature-flags">
                <h3>Voice Features</h3>
                {Object.entries(featureFlags.getVoiceFlags()).map(([key, enabled]) => (
                  <label key={key} className="feature-toggle">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => featureFlags.toggleVoiceFeature(key as any)}
                    />
                    <span className="feature-name">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                  </label>
                ))}
                <h3>System Features</h3>
                {Object.entries(featureFlags.getSystemFlags()).map(([key, enabled]) => (
                  <label key={key} className="feature-toggle">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => featureFlags.toggleSystemFeature(key as any)}
                    />
                    <span className="feature-name">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSecurity && (
        <div className="modal-overlay" onClick={() => setShowSecurity(false)}>
          <div className="modal-content credential-manager-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSecurity(false)}>×</button>
            <CredentialManager />
          </div>
        </div>
      )}

      {/* Quick Developer Access */}
      {(showDiagnostics || showTesting || showSettings || showSecurity) && (
        <div className="developer-panel">
          <div className="developer-tabs">
            <button 
              className={showDiagnostics ? 'active' : ''}
              onClick={() => {
                setShowDiagnostics(!showDiagnostics);
                setShowTesting(false);
                setShowSettings(false);
                setShowSecurity(false);
              }}
            >
              🔧 Diagnostics
            </button>
            <button 
              className={showTesting ? 'active' : ''}
              onClick={() => {
                setShowTesting(!showTesting);
                setShowDiagnostics(false);
                setShowSettings(false);
                setShowSecurity(false);
              }}
            >
              🧪 Testing
            </button>
            <button 
              className={showSettings ? 'active' : ''}
              onClick={() => {
                setShowSettings(!showSettings);
                setShowDiagnostics(false);
                setShowTesting(false);
                setShowSecurity(false);
              }}
            >
              ⚙️ Settings
            </button>
            <button 
              className={showSecurity ? 'active' : ''}
              onClick={() => {
                setShowSecurity(!showSecurity);
                setShowDiagnostics(false);
                setShowTesting(false);
                setShowSettings(false);
              }}
            >
              🔒 Security
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
