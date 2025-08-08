import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; retry: () => void }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  resetOnPropsChange?: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    // Reset error state if props changed and resetOnPropsChange is true
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    }
  }

  retry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback } = this.props;
      const { error } = this.state;

      if (Fallback && error) {
        return <Fallback error={error} retry={this.retry} />;
      }

      // Default error UI
      return (
        <div className="error-boundary glass-card" style={{ 
          padding: '20px', 
          margin: '20px', 
          textAlign: 'center',
          background: 'rgba(255, 107, 53, 0.1)',
          border: '1px solid rgba(255, 107, 53, 0.3)'
        }}>
          <h2 style={{ color: '#ff6b35', marginBottom: '10px' }}>
            🚫 Something went wrong
          </h2>
          <p style={{ color: '#ccc', marginBottom: '15px' }}>
            {error?.message || 'An unexpected error occurred'}
          </p>
          <button 
            onClick={this.retry}
            className="glass-btn primary"
            style={{
              padding: '10px 20px',
              background: 'rgba(255, 107, 53, 0.2)',
              border: '1px solid rgba(255, 107, 53, 0.4)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
          {process.env.NODE_ENV === 'development' && (
            <details style={{ marginTop: '15px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', color: '#8b5cf6' }}>
                Error Details
              </summary>
              <pre style={{ 
                background: 'rgba(0, 0, 0, 0.3)', 
                padding: '10px', 
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
                color: '#ff6b35'
              }}>
                {error?.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized Voice Error Boundary
interface VoiceErrorBoundaryProps {
  children: React.ReactNode;
  onVoiceError?: (error: Error) => void;
}

export const VoiceErrorBoundary: React.FC<VoiceErrorBoundaryProps> = ({ 
  children, 
  onVoiceError 
}) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Check if this is a voice-related error
    const isVoiceError = error.message.includes('Speech recognition') ||
                        error.message.includes('Microphone') ||
                        error.message.includes('audio') ||
                        error.message.includes('voice');
    
    if (isVoiceError && onVoiceError) {
      onVoiceError(error);
    }
  };

  const VoiceErrorFallback: React.FC<{ error: Error; retry: () => void }> = ({ error, retry }) => (
    <div className="voice-error-boundary glass-card" style={{ 
      padding: '15px', 
      margin: '10px 0',
      background: 'rgba(255, 107, 53, 0.1)',
      border: '1px solid rgba(255, 107, 53, 0.3)',
      borderRadius: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>🎤</span>
        <div>
          <h4 style={{ color: '#ff6b35', margin: '0 0 5px 0' }}>Voice Error</h4>
          <p style={{ color: '#ccc', margin: '0 0 10px 0', fontSize: '14px' }}>
            {error.message}
          </p>
          <button 
            onClick={retry}
            className="glass-btn"
            style={{
              padding: '5px 15px',
              background: 'rgba(255, 107, 53, 0.2)',
              border: '1px solid rgba(255, 107, 53, 0.4)',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Retry Voice
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ErrorBoundary 
      fallback={VoiceErrorFallback}
      onError={handleError}
      resetOnPropsChange={true}
    >
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundary;