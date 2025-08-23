import React, { Component, ErrorInfo, ReactNode } from 'react';
import { SecurityService } from '../services/SecurityService';
import { getDatabaseService } from '../services/DatabaseService';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string;
  timestamp: Date;
  recoveryAttempts: number;
  isRecovering: boolean;
  securityLevel: 'low' | 'medium' | 'high';
  sessionId?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  maxRecoveryAttempts?: number;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  enableSecurityLogging?: boolean;
  enableAutoRecovery?: boolean;
}

interface ErrorReport {
  errorId: string;
  message: string;
  stack?: string;
  componentStack?: string;
  userAgent: string;
  url: string;
  timestamp: string;
  sessionId?: string;
  userId?: string;
  securityLevel: string;
  recoveryAttempts: number;
  systemInfo: {
    platform: string;
    language: string;
    cookiesEnabled: boolean;
    onlineStatus: boolean;
    memoryUsage?: any;
  };
}

/**
 * Enhanced Error Boundary with Security Integration
 * Features: Automatic recovery, Security logging, User-friendly error displays, Crash reporting
 */
export class VoiceErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private securityService: SecurityService;
  private databaseService: any;
  private recoveryTimeout: NodeJS.Timeout | null = null;
  private readonly maxRecoveryAttempts: number;

  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.maxRecoveryAttempts = props.maxRecoveryAttempts || 3;
    this.securityService = new SecurityService();
    this.databaseService = getDatabaseService();

    this.state = {
      hasError: false,
      error: null,
      errorId: '',
      timestamp: new Date(),
      recoveryAttempts: 0,
      isRecovering: false,
      securityLevel: 'medium'
    };
  }

  async componentDidMount() {
    try {
      await this.securityService.initialize();
      await this.databaseService.initialize();
      
      // Get session info
      const sessionId = localStorage.getItem('luna-session-id');
      if (sessionId) {
        this.setState({ sessionId });
      }
    } catch (error) {
      console.error('ErrorBoundary: Failed to initialize services:', error);
    }

    // Set up global error handlers
    this.setupGlobalErrorHandlers();
  }

  componentWillUnmount() {
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }

    // Clean up global error handlers
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private setupGlobalErrorHandlers = () => {
    // Handle JavaScript errors
    window.addEventListener('error', this.handleGlobalError);
    
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  };

  private handleGlobalError = (event: ErrorEvent) => {
    const error = new Error(event.message);
    error.stack = `${event.filename}:${event.lineno}:${event.colno}`;
    this.logSecurityEvent(error, 'global_js_error');
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = new Error(`Unhandled Promise Rejection: ${event.reason}`);
    this.logSecurityEvent(error, 'unhandled_promise_rejection');
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
      timestamp: new Date()
    };
  }

  async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error);
    console.error('Error info:', errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log security event
    await this.logSecurityEvent(error, 'react_error_boundary', errorInfo);

    // Generate and store error report
    const errorReport = await this.generateErrorReport(error, errorInfo);
    await this.storeErrorReport(errorReport);

    // Determine security level based on error type
    const securityLevel = this.assessSecurityLevel(error);
    this.setState({ securityLevel });

    // Send to external monitoring (in production)
    await this.sendToExternalMonitoring(errorReport);

    // Attempt automatic recovery if enabled
    if (this.props.enableAutoRecovery && this.state.recoveryAttempts < this.maxRecoveryAttempts) {
      this.attemptRecovery();
    }
  }

  private assessSecurityLevel(error: Error): 'low' | 'medium' | 'high' {
    const errorMessage = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // High security level indicators
    if (
      errorMessage.includes('security') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('permission') ||
      stack.includes('securityservice') ||
      stack.includes('csrf')
    ) {
      return 'high';
    }

    // Medium security level indicators
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('api') ||
      errorMessage.includes('session') ||
      stack.includes('voiceservice')
    ) {
      return 'medium';
    }

    // Low security level (UI errors, etc.)
    return 'low';
  }

  private async logSecurityEvent(
    error: Error, 
    eventType: string, 
    errorInfo?: ErrorInfo
  ): Promise<void> {
    if (!this.props.enableSecurityLogging) return;

    try {
      await this.securityService.logSecurityEvent(
        'suspicious_activity',
        `${eventType}: ${error.message}`
      );

      // Also log to database audit log
      await this.databaseService.logAuditEvent(
        `error_${eventType}`,
        {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo?.componentStack,
          errorId: this.state.errorId,
          sessionId: this.state.sessionId,
          severity: this.state.securityLevel
        }
      );

    } catch (logError) {
      console.error('Failed to log security event:', logError);
    }
  }

  private async generateErrorReport(error: Error, errorInfo?: ErrorInfo): Promise<ErrorReport> {
    const report: ErrorReport = {
      errorId: this.state.errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack || undefined,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      sessionId: this.state.sessionId,
      securityLevel: this.state.securityLevel,
      recoveryAttempts: this.state.recoveryAttempts,
      systemInfo: {
        platform: navigator.platform,
        language: navigator.language,
        cookiesEnabled: navigator.cookieEnabled,
        onlineStatus: navigator.onLine,
        memoryUsage: (performance as any).memory ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
        } : undefined
      }
    };

    return report;
  }

  private async storeErrorReport(report: ErrorReport): Promise<void> {
    try {
      // Store in local storage for offline scenarios
      const storedReports = JSON.parse(localStorage.getItem('luna-error-reports') || '[]');
      storedReports.push(report);
      
      // Keep only the last 10 reports
      if (storedReports.length > 10) {
        storedReports.splice(0, storedReports.length - 10);
      }
      
      localStorage.setItem('luna-error-reports', JSON.stringify(storedReports));

      // Store in database if available
      await this.databaseService.run(`
        INSERT OR IGNORE INTO error_reports (
          id, message, stack, component_stack, user_agent, url, 
          timestamp, session_id, security_level, recovery_attempts, system_info
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        report.errorId,
        report.message,
        report.stack,
        report.componentStack,
        report.userAgent,
        report.url,
        report.timestamp,
        report.sessionId,
        report.securityLevel,
        report.recoveryAttempts,
        JSON.stringify(report.systemInfo)
      ]);

    } catch (error) {
      console.error('Failed to store error report:', error);
    }
  }

  private async sendToExternalMonitoring(report: ErrorReport): Promise<void> {
    // In production, send to external monitoring services like Sentry, DataDog, etc.
    try {
      if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
        // Example: Send to Sentry
        // await sendToSentry(report);
      }
      
      if (process.env.ERROR_REPORTING_ENDPOINT) {
        await fetch(process.env.ERROR_REPORTING_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(report)
        });
      }
    } catch (error) {
      console.error('Failed to send to external monitoring:', error);
    }
  }

  private attemptRecovery = (): void => {
    console.log(`Attempting error recovery (attempt ${this.state.recoveryAttempts + 1}/${this.maxRecoveryAttempts})`);
    
    this.setState({
      isRecovering: true,
      recoveryAttempts: this.state.recoveryAttempts + 1
    });

    // Clear any existing recovery timeout
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
    }

    // Attempt recovery after a delay
    this.recoveryTimeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        isRecovering: false,
        errorId: '',
        timestamp: new Date()
      });

      console.log('Error recovery completed');
    }, 2000); // 2 second delay
  };

  private handleManualRecovery = (): void => {
    if (this.state.recoveryAttempts >= this.maxRecoveryAttempts) {
      // Force recovery by reloading the page
      window.location.reload();
      return;
    }

    this.attemptRecovery();
  };

  private handleReportError = async (): Promise<void> => {
    const report = await this.generateErrorReport(this.state.error!);
    
    // Copy error details to clipboard
    const errorDetails = `Error ID: ${report.errorId}
Timestamp: ${report.timestamp}
Message: ${report.message}
URL: ${report.url}
User Agent: ${report.userAgent}

Stack Trace:
${report.stack}

Component Stack:
${report.componentStack}`;

    try {
      await navigator.clipboard.writeText(errorDetails);
      alert('Error details copied to clipboard. Please send this to support.');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: show in modal or download as file
    }
  };

  private getErrorTypeIcon(): string {
    if (!this.state.error) return '❌';
    
    const errorMessage = this.state.error.message.toLowerCase();
    
    if (errorMessage.includes('network')) return '🌐';
    if (errorMessage.includes('permission') || errorMessage.includes('security')) return '🔒';
    if (errorMessage.includes('voice') || errorMessage.includes('audio')) return '🎤';
    if (errorMessage.includes('database')) return '🗄️';
    
    return '❌';
  }

  private getSecurityLevelColor(): string {
    switch (this.state.securityLevel) {
      case 'high': return '#ff4444';
      case 'medium': return '#ffaa00';
      case 'low': return '#44aaff';
      default: return '#666666';
    }
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="error-boundary">
          <div className="error-container" style={{
            border: `2px solid ${this.getSecurityLevelColor()}`,
            boxShadow: `0 20px 40px rgba(0, 0, 0, 0.3), 0 0 20px ${this.getSecurityLevelColor()}33`
          }}>
            {/* Error Icon */}
            <div className="error-icon">
              {this.state.isRecovering ? '🔄' : this.getErrorTypeIcon()}
            </div>

            {/* Error Title */}
            <h1 className="error-header" style={{
              color: this.getSecurityLevelColor()
            }}>
              {this.state.isRecovering ? 'Recovering...' : 'Something went wrong'}
            </h1>

            {/* Error Message */}
            <p className="error-message">
              {this.state.isRecovering ? 
                `Attempting to recover from error (${this.state.recoveryAttempts}/${this.maxRecoveryAttempts})` :
                'Luna Agent encountered an unexpected error. We apologize for the inconvenience.'
              }
            </p>

            {/* Error Details (Collapsible) */}
            {!this.state.isRecovering && (
              <details className="error-details">
                <summary className="error-details-summary">
                  🔍 Technical Details
                </summary>
                <div className="error-details-content">
                  <strong>Error ID:</strong> {this.state.errorId}<br />
                  <strong>Timestamp:</strong> {this.state.timestamp.toLocaleString()}<br />
                  <strong>Security Level:</strong> <span style={{ color: this.getSecurityLevelColor() }}>
                    {this.state.securityLevel.toUpperCase()}
                  </span><br />
                  <strong>Message:</strong> {this.state.error?.message}<br />
                  {this.state.sessionId && (
                    <>
                      <strong>Session:</strong> {this.state.sessionId}<br />
                    </>
                  )}
                </div>
              </details>
            )}

            {/* Action Buttons */}
            {!this.state.isRecovering && (
              <div className="error-actions">
                {/* Recovery Button */}
                {this.state.recoveryAttempts < this.maxRecoveryAttempts && (
                  <button
                    className="error-action-button primary"
                    onClick={this.handleManualRecovery}
                  >
                    🔄 Try Recovery
                  </button>
                )}

                {/* Reload Button */}
                <button
                  className="error-action-button secondary"
                  onClick={() => window.location.reload()}
                >
                  🔄 Reload Page
                </button>

                {/* Report Button */}
                <button
                  className="error-action-button danger"
                  onClick={this.handleReportError}
                >
                  📋 Report Error
                </button>
              </div>
            )}

            {/* Recovery Progress */}
            {this.state.isRecovering && (
              <div className="error-progress">
                <div className="error-progress-bar">
                  <div className="error-progress-fill" />
                </div>
              </div>
            )}

            {/* Recovery Status */}
            {this.state.recoveryAttempts >= this.maxRecoveryAttempts && !this.state.isRecovering && (
              <div className="error-warning">
                <strong>⚠️ Maximum recovery attempts reached</strong><br />
                Please reload the page or contact support if the problem persists.
              </div>
            )}
          </div>

        </div>
      );
    }

    return this.props.children;
  }
}

// Simplified Error Boundary for specific components
class ComponentErrorBoundaryClass extends Component<
  { children: ReactNode; componentName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; componentName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Component Error in ${this.props.componentName}:`, error);
    console.error('Error Info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="component-error">
          <h3 className="component-error-title">
            ⚠️ {this.props.componentName} Error
          </h3>
          <p className="component-error-message">
            This component failed to render. The rest of the app should continue working.
          </p>
          <button
            className="component-error-retry"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Export both error boundaries
export { VoiceErrorBoundary as default, ComponentErrorBoundaryClass as ComponentErrorBoundary };
