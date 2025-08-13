import React, { useEffect, useRef, useState } from 'react';
import type { PorcupineWorker } from '@picovoice/porcupine-web';

interface WakeWordListenerProps {
  accessKey: string;
  onWakeWordDetected: (keywordLabel: string) => void;
  enabled?: boolean;
}

const WakeWordListener: React.FC<WakeWordListenerProps> = ({
  accessKey,
  onWakeWordDetected,
  enabled = true,
}) => {
  const workerRef = useRef<PorcupineWorker | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const stopListener = () => {
      if (workerRef.current) {
        console.log('[WAKE WORD] Releasing Porcupine worker.');
        workerRef.current.release();
        workerRef.current = null;
      }
      setIsListening(false);
    };

    if (!enabled) {
      stopListener();
      return;
    }

    async function initPorcupine() {
      if (!accessKey) {
        console.warn('[WAKE WORD] AccessKey is not provided. Skipping initialization.');
        setError('Wake word AccessKey not configured.');
        return;
      }

      try {
        const { PorcupineWorkerFactory } = await import('@picovoice/porcupine-web');

        const keyword = {
          label: 'Hey Luna',
          // This path is relative to the `dist/app/renderer` directory where index.html is served.
          publicPath: 'assets/Hey-Luna_en_wasm_v3_0_0.ppn',
          sensitivity: 0.6,
        };

        console.log('[WAKE WORD] Initializing with keyword:', keyword);

        const porcupineWorker = await PorcupineWorkerFactory.create(
          accessKey,
          [keyword],
          (detection: any) => {
            if (isMounted && detection.label) {
              console.log(`%c[WAKE WORD] Detected: ${detection.label}`, 'color: #22a55b; font-weight: bold;');
              onWakeWordDetected(detection.label);
            }
          },
          {
            // Explicitly provide paths to the assets we copied with webpack
            customPaths: {
              worker: 'assets/porcupine_worker.js',
              wasm: 'assets/pv_porcupine.wasm',
            },
            start: true,
          }
        );

        if (isMounted) {
          workerRef.current = porcupineWorker;
          setIsListening(true);
          setError(null);
          console.log('[WAKE WORD] Now listening for "Hey Luna"...');
        } else {
          // Component unmounted during async init, release the worker
          porcupineWorker.release();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('[WAKE WORD] Failed to initialize Porcupine:', errorMessage);
        if (isMounted) {
          if (errorMessage.includes('fetch')) {
            setError('Network error: Could not load wake word model. Check file paths and build process.');
          } else if (errorMessage.includes('WebAssembly')) {
            setError('Browser environment issue: WebAssembly may not be supported.');
          } else {
            setError(`Initialization failed: ${errorMessage}`);
          }
          setIsListening(false);
        }
      }
    }

    initPorcupine();

    return () => {
      isMounted = false;
      stopListener();
    };
  }, [accessKey, onWakeWordDetected, enabled]);

  return (
    <div className="wake-word-status">
      {error ? (
        <span className="error-text" title={error}>Wake Word Error</span>
      ) : isListening ? (
        <span className="listening-indicator">
          <span className="pulse-dot"></span>
          Listening...
        </span>
      ) : (
        <span className="status-text">Wake Word Inactive</span>
      )}
    </div>
  );
};

export default WakeWordListener;
