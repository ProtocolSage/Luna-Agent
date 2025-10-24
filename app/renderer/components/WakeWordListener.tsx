import React, { useEffect, useRef, useState } from "react";
import { logger } from "../utils/logger";

// Try to import Porcupine, but provide fallback
let PorcupineClient: any;
try {
  PorcupineClient = require("../services/wakeWord/PorcupineClient");
} catch (e) {
  logger.warn(
    "Porcupine client not available, will use Web Speech API fallback",
  );
}

type AudioResources = {
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  mediaStream: MediaStream;
};

interface WakeWordListenerProps {
  accessKey?: string;
  onWakeWordDetected: (keywordLabel: string) => void;
  enabled?: boolean;
  useFallback?: boolean;
}

function downsampleBuffer(
  buffer: Float32Array,
  inputRate: number,
  targetRate: number,
): Float32Array {
  if (inputRate === targetRate) {
    return buffer;
  }

  const sampleRateRatio = inputRate / targetRate;
  if (sampleRateRatio <= 0) {
    return buffer;
  }

  const newLength = Math.floor(buffer.length / sampleRateRatio);
  if (newLength <= 0) {
    return new Float32Array(0);
  }

  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(
      buffer.length,
      Math.floor((offsetResult + 1) * sampleRateRatio),
    );
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

// Web Speech API Fallback
class WebSpeechWakeWordListener {
  private recognition: any;
  private onDetection: (label: string) => void;
  private isListening: boolean = false;

  constructor(onDetection: (label: string) => void) {
    this.onDetection = onDetection;

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";

      this.recognition.onresult = (event: any) => {
        const transcript =
          event.results[event.results.length - 1][0].transcript.toLowerCase();
        if (transcript.includes("hey luna") || transcript.includes("luna")) {
          logger.info("Wake word detected via Web Speech API");
          this.onDetection("Hey Luna");
          // Restart listening after detection
          this.stop();
          setTimeout(() => this.start(), 2000);
        }
      };

      this.recognition.onerror = (event: any) => {
        logger.warn("Speech recognition error:", event.error);
        if (event.error === "no-speech" || event.error === "aborted") {
          // Restart on these recoverable errors
          setTimeout(() => {
            if (this.isListening) {
              this.start();
            }
          }, 1000);
        }
      };

      this.recognition.onend = () => {
        // Restart if we should still be listening
        if (this.isListening) {
          setTimeout(() => this.start(), 500);
        }
      };
    }
  }

  async start() {
    if (this.recognition && !this.isListening) {
      try {
        this.recognition.start();
        this.isListening = true;
        logger.info("Web Speech API wake word listening started");
      } catch (e) {
        // Already started or other error
        logger.debug(
          "Speech recognition start error (may be already running):",
          e,
        );
      }
    }
  }
  stop() {
    if (this.recognition && this.isListening) {
      this.isListening = false;
      try {
        this.recognition.stop();
      } catch (e) {
        // Already stopped
      }
    }
  }
}

async function initializeAudioPipeline(
  handle: any,
  audioResourcesRef: React.MutableRefObject<AudioResources | null>,
): Promise<void> {
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: handle.sampleRate,
    },
  });

  const audioContext = new AudioContext({ sampleRate: handle.sampleRate });
  const source = audioContext.createMediaStreamSource(mediaStream);
  const processor = audioContext.createScriptProcessor(
    handle.frameLength * 2,
    1,
    1,
  );

  let floatBuffer = new Float32Array(handle.frameLength * 4);
  let bufferLength = 0;
  const inputSampleRate = audioContext.sampleRate;
  const targetSampleRate = handle.sampleRate;

  processor.onaudioprocess = (event) => {
    const inputChannel = event.inputBuffer.getChannelData(0);
    const inputData = downsampleBuffer(
      inputChannel,
      inputSampleRate,
      targetSampleRate,
    );

    if (bufferLength + inputData.length > floatBuffer.length) {
      const nextCapacity = Math.max(
        floatBuffer.length * 2,
        bufferLength + inputData.length,
      );
      const expanded = new Float32Array(nextCapacity);
      expanded.set(floatBuffer.subarray(0, bufferLength));
      floatBuffer = expanded;
    }

    floatBuffer.set(inputData, bufferLength);
    bufferLength += inputData.length;

    while (bufferLength >= handle.frameLength) {
      const frame = new Int16Array(handle.frameLength);
      for (let i = 0; i < handle.frameLength; i += 1) {
        const sample = Math.max(-1, Math.min(1, floatBuffer[i]));
        frame[i] = sample < 0 ? sample * 32768 : sample * 32767;
      }

      try {
        handle.process(frame);
      } catch (processError) {
        logger.error("Failed to process audio frame:", processError);
      }

      floatBuffer.copyWithin(0, handle.frameLength, bufferLength);
      bufferLength -= handle.frameLength;
    }
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  audioResourcesRef.current = {
    context: audioContext,
    processor,
    source,
    mediaStream,
  };
}

const WakeWordListener: React.FC<WakeWordListenerProps> = ({
  accessKey,
  onWakeWordDetected,
  enabled = true,
  useFallback = false,
}) => {
  const workerRef = useRef<any>(null);
  const audioResourcesRef = useRef<AudioResources | null>(null);
  const webSpeechRef = useRef<WebSpeechWakeWordListener | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const stopAudio = async (): Promise<void> => {
      const audioResources = audioResourcesRef.current;
      audioResourcesRef.current = null;

      if (audioResources) {
        audioResources.processor.disconnect();
        audioResources.source.disconnect();
        audioResources.mediaStream.getTracks().forEach((track) => track.stop());
        try {
          await audioResources.context.close();
        } catch (closeError) {
          logger.warn("Failed to close audio context cleanly:", closeError);
        }
      }
    };

    const stopListener = () => {
      const cleanup = async () => {
        await stopAudio();

        // Stop Web Speech API if using fallback
        if (webSpeechRef.current) {
          webSpeechRef.current.stop();
          webSpeechRef.current = null;
        }

        if (workerRef.current) {
          logger.info("Releasing Porcupine worker.");
          try {
            await workerRef.current.release();
          } catch (releaseError) {
            logger.warn("Release reported an error:", releaseError);
          } finally {
            workerRef.current.terminate();
            workerRef.current = null;
          }
        }

        setIsListening(false);
      };

      void cleanup();
    };

    if (!enabled) {
      stopListener();
      return () => {
        isMounted = false;
      };
    }

    async function initPorcupine() {
      // Check if we should use Web Speech API fallback
      const shouldUseFallback =
        useFallback ||
        !accessKey ||
        !PorcupineClient ||
        !(await checkAssetsExist());

      if (shouldUseFallback) {
        // Use Web Speech API fallback
        logger.info("Using Web Speech API for wake word detection");
        setUsingFallback(true);

        if (
          "webkitSpeechRecognition" in window ||
          "SpeechRecognition" in window
        ) {
          webSpeechRef.current = new WebSpeechWakeWordListener(
            onWakeWordDetected,
          );
          await webSpeechRef.current.start();
          setIsListening(true);
          setError(null);
        } else {
          setError("Web Speech API not supported in this browser");
        }
        return;
      }

      // Try to use Porcupine
      try {
        const keyword = {
          label: "Hey Luna",
          publicPath: "assets/Hey-Luna_en_wasm_v3_0_0.ppn",
          sensitivity: 0.6,
        };

        logger.info("Initializing Porcupine with keyword:", keyword);

        const porcupineWorker = await PorcupineClient.createPorcupineClient({
          accessKey,
          keywords: [keyword],
          onDetection: (detection: any) => {
            if (isMounted && detection.label) {
              logger.info(`Wake word detected: ${detection.label}`);
              onWakeWordDetected(detection.label);
            }
          },
          model: {
            publicPath: "assets/porcupine_params.pv",
          },
          assetPaths: {
            worker: "assets/porcupine_worker.js",
            wasm: "assets/pv_porcupine.wasm",
            wasmSimd: "assets/pv_porcupine_simd.wasm",
          },
          options: {
            processErrorCallback: (err: Error) => {
              logger.error("Process error:", err);
              if (isMounted) {
                setError(err.message);
              }
            },
          },
        });

        if (!isMounted) {
          await porcupineWorker.release();
          porcupineWorker.terminate();
          return;
        }

        try {
          await initializeAudioPipeline(porcupineWorker, audioResourcesRef);
        } catch (audioError) {
          logger.error("Audio pipeline initialization failed:", audioError);
          await porcupineWorker.release();
          porcupineWorker.terminate();
          throw audioError;
        }
        if (!isMounted) {
          await stopAudio();
          await porcupineWorker.release();
          porcupineWorker.terminate();
          return;
        }

        workerRef.current = porcupineWorker;
        setIsListening(true);
        setError(null);
        logger.info("Porcupine wake word listening started");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error("Failed to initialize Porcupine:", errorMessage);

        // Fall back to Web Speech API
        logger.info("Falling back to Web Speech API");
        setUsingFallback(true);
        if (
          "webkitSpeechRecognition" in window ||
          "SpeechRecognition" in window
        ) {
          webSpeechRef.current = new WebSpeechWakeWordListener(
            onWakeWordDetected,
          );
          await webSpeechRef.current.start();
          setIsListening(true);
          setError(null);
        } else {
          setError("Wake word detection not available");
          setIsListening(false);
        }
      }
    }
    async function checkAssetsExist(): Promise<boolean> {
      try {
        const assetsToCheck = [
          "assets/porcupine_worker.js",
          "assets/pv_porcupine.wasm",
        ];

        for (const asset of assetsToCheck) {
          const response = await fetch(asset, { method: "HEAD" });
          if (!response.ok) {
            logger.warn(`Asset not found: ${asset}`);
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    }

    initPorcupine();

    return () => {
      isMounted = false;
      stopListener();
    };
  }, [accessKey, onWakeWordDetected, enabled, useFallback]);

  return (
    <div className="wake-word-status">
      {isListening && (
        <div className="listening-indicator">
          <span className="pulse-dot"></span>
          {usingFallback
            ? "Listening (Web Speech)..."
            : 'Listening for "Hey Luna"...'}
        </div>
      )}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default WakeWordListener;
