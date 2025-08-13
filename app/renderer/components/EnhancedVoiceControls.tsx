import React from 'react';

export interface EnhancedVoiceControlsProps {
  isListening?: boolean;
  onStartListening?: () => void;
  onStopListening?: () => void;
  className?: string;
}

const EnhancedVoiceControls: React.FC<EnhancedVoiceControlsProps> = ({
  isListening = false,
  onStartListening,
  onStopListening,
  className = ''
}) => {
  const handleToggle = () => {
    if (isListening) {
      onStopListening?.();
    } else {
      onStartListening?.();
    }
  };

  return (
    <div className={`enhanced-voice-controls ${className}`}>
      <button
        onClick={handleToggle}
        className={`voice-button ${isListening ? 'listening' : 'idle'}`}
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
      >
        <div className="voice-indicator">
          {isListening ? '🔴' : '🎤'}
        </div>
        <span>{isListening ? 'Listening...' : 'Click to speak'}</span>
      </button>
    </div>
  );
};

export default EnhancedVoiceControls;