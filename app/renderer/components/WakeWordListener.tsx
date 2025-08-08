import React, { useEffect, useRef, useState } from 'react';
import type { PorcupineWorker } from '@picovoice/porcupine-web';

interface WakeWordListenerProps {
  accessKey: string;
  modelPath: string;
  onWakeWordDetected: (keywordLabel: string) => void;
  enabled?: boolean;
}

const WakeWordListener: React.FC<WakeWordListenerProps> = ({
  accessKey,
  modelPath,
  onWakeWordDetected,
  enabled = true
}) => {
  const workerRef = useRef<PorcupineWorker | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (workerRef.current) {
        workerRef.current.release();
        workerRef.current = null;
        setIsListening(false);
      }
      return;
    }

    let isMounted = true;

    async function initPorcupine() {
      try {
        // Import the worker factory
        const { PorcupineWorkerFactory } = await import('@picovoice/porcupine-web');
        
        // Create the Porcupine worker
        const porcupineWorker = await PorcupineWorkerFactory.create(
          accessKey,
          [{ 
            label: 'Hey Luna',
            publicPath: modelPath,
            sensitivity: 0.5
          }],
          (detection) => {
            if (isMounted && detection.label) {
              console.log(`Wake word detected: ${detection.label}`);
              onWakeWordDetected(detection.label);
            }
          }
        );

        if (isMounted) {
          workerRef.current = porcupineWorker;
          setIsListening(true);
          setError(null);
          console.log('Wake word detection initialized');
        } else {
          porcupineWorker.release();
        }
      } catch (err) {
        console.error('Failed to initialize Porcupine:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize wake word detection');
          setIsListening(false);
        }
      }
    }

    initPorcupine();

    return () => {
      isMounted = false;
      if (workerRef.current) {
        workerRef.current.release();
        workerRef.current = null;
      }
    };
  }, [accessKey, modelPath, onWakeWordDetected, enabled]);

  return (
    <div className="wake-word-status">
      {error ? (
        <span className="error-text">Wake word error: {error}</span>
      ) : isListening ? (
        <span className="listening-indicator">
          <span className="pulse-dot"></span>
          Listening for "Hey Luna"...
        </span>
      ) : (
        <span className="status-text">Wake word detection inactive</span>
      )}
    </div>
  );
};

export default WakeWordListener;
