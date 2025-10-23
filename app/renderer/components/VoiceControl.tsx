import React from 'react';

type VoiceMode = 'idle' | 'listening' | 'processing' | 'speaking';

interface Props {
  mode: VoiceMode;
  onStartListening: () => void;
  onStopListening: () => void;
}

export const VoiceControl: React.FC<Props> = ({ 
  mode, 
  onStartListening, 
  onStopListening 
}) => {
  const getStatusText = () => {
    switch (mode) {
      case 'listening': return 'Listening...';
      case 'processing': return 'Processing...';
      case 'speaking': return 'Speaking...';
      default: return 'Click to speak';
    }
  };

  const getButtonClass = () => {
    return `voice-button ${mode}`;
  };

  const handleClick = () => {
    if (mode === 'listening') {
      onStopListening();
    } else if (mode === 'idle') {
      onStartListening();
    }
  };

  const isDisabled = mode === 'processing' || mode === 'speaking';

  return (
    <div className="voice-control">
      <button
        className={getButtonClass()}
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={getStatusText()}
      >
        <div className="mic-icon">
          {mode === 'listening' ? '🎤' : mode === 'processing' ? '⚙️' : mode === 'speaking' ? '🔊' : '🎙️'}
        </div>
        <div className="status-text">{getStatusText()}</div>
      </button>
      
      {mode === 'listening' && (
        <div className="voice-indicator">
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay-1"></div>
          <div className="pulse-ring delay-2"></div>
        </div>
      )}
    </div>
  );
};