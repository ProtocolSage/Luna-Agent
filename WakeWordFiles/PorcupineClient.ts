import {
  BuiltInKeyword,
  DetectionCallback,
  PorcupineKeyword,
  PorcupineModel,
  PorcupineOptions,
  keywordsProcess,
} from "@picovoice/porcupine-web";
import { loadModel } from "@picovoice/web-utils";

export type PorcupineKeywords =
  | PorcupineKeyword
  | BuiltInKeyword
  | Array<PorcupineKeyword | BuiltInKeyword>;

export interface PorcupineClient {
  readonly version: string;
  readonly frameLength: number;
  readonly sampleRate: number;
  process(pcm: Int16Array): void;
  release(): Promise<void>;
  terminate(): void;
}

export interface PorcupineAssetPaths {
  worker: string;
  wasm: string;
  wasmSimd?: string;
}

interface WorkerInitOk {
  command: "ok";
  version: string;
  frameLength: number;
  sampleRate: number;
}

interface WorkerDetectionOk {
  command: "ok";
  porcupineDetection: { index: number; label: string };
}

interface WorkerError {
  command: "error" | "failed";
  status: number;
  shortMessage: string;
  messageStack?: string[];
}

interface WorkerReleaseOk {
  command: "ok";
}

type WorkerInitResponse = WorkerInitOk | WorkerError;
type WorkerProcessResponse = WorkerDetectionOk | WorkerError;
type WorkerReleaseResponse = WorkerReleaseOk | WorkerError;

type ProcessErrorCallback = NonNullable<
  PorcupineOptions["processErrorCallback"]
>;

function buildError(message: string, payload: WorkerError): Error {
  const parts = [message, `status=${payload.status}`];
  if (payload.shortMessage) {
    parts.push(payload.shortMessage);
  }
  if (payload.messageStack && payload.messageStack.length > 0) {
    parts.push(payload.messageStack.join(" -> "));
  }
  return new Error(parts.join(" | "));
}

async function fetchAssetAsBase64(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset from ${path} (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}

export interface CreatePorcupineClientArgs {
  accessKey: string;
  keywords: PorcupineKeywords;
  onDetection: DetectionCallback;
  model: PorcupineModel;
  assetPaths: PorcupineAssetPaths;
  options?: PorcupineOptions;
}

export async function createPorcupineClient({
  accessKey,
  keywords,
  onDetection,
  model,
  assetPaths,
  options,
}: CreatePorcupineClientArgs): Promise<PorcupineClient> {
  const [keywordPaths, keywordLabels, sensitivities] =
    await keywordsProcess(keywords);

  const customWritePath = model.customWritePath ?? "porcupine_model";
  const modelPath = await loadModel({ ...model, customWritePath });

  const [wasmBase64, wasmSimdBase64] = await Promise.all([
    fetchAssetAsBase64(assetPaths.wasm),
    assetPaths.wasmSimd
      ? fetchAssetAsBase64(assetPaths.wasmSimd)
      : Promise.resolve(""),
  ]);

  const worker = new Worker(assetPaths.worker);
  const processErrorCallback: ProcessErrorCallback | undefined =
    options?.processErrorCallback;

  return new Promise<PorcupineClient>((resolve, reject) => {
    let released = false;

    const handleWorkerError = (
      error: WorkerError,
      prefix: string,
      rejectFn: (error: Error) => void,
    ) => {
      const wrapped = buildError(prefix, error);
      if (processErrorCallback) {
        processErrorCallback(wrapped);
      }
      rejectFn(wrapped);
    };

    worker.onerror = (event) => {
      reject(
        new Error(
          event.message ?? "Porcupine worker encountered an unknown error",
        ),
      );
    };

    worker.onmessage = (event: MessageEvent<WorkerInitResponse>) => {
      const data = event.data;
      if (data.command === "ok") {
        const detectionHandler = (ev: MessageEvent<WorkerProcessResponse>) => {
          const payload = ev.data;
          if (payload.command === "ok") {
            onDetection(payload.porcupineDetection);
          } else {
            const err = buildError("Porcupine worker process error", payload);
            if (processErrorCallback) {
              processErrorCallback(err);
            }
          }
        };

        worker.onmessage = detectionHandler;

        const client: PorcupineClient = {
          version: data.version,
          frameLength: data.frameLength,
          sampleRate: data.sampleRate,
          process(pcm: Int16Array) {
            if (released) {
              throw new Error("Attempted to process audio after release");
            }
            worker.postMessage(
              {
                command: "process",
                inputFrame: pcm,
              },
              [pcm.buffer],
            );
          },
          async release() {
            if (released) {
              return;
            }
            return new Promise<void>((resolveRelease, rejectRelease) => {
              worker.onmessage = (
                releaseEvent: MessageEvent<WorkerReleaseResponse>,
              ) => {
                const releasePayload = releaseEvent.data;
                if (releasePayload.command === "ok") {
                  released = true;
                  resolveRelease();
                } else {
                  handleWorkerError(
                    releasePayload,
                    "Porcupine worker release error",
                    rejectRelease,
                  );
                }
              };
              worker.postMessage({ command: "release" });
            });
          },
          terminate() {
            released = true;
            worker.terminate();
          },
        };

        resolve(client);
      } else {
        handleWorkerError(
          data,
          "Porcupine worker initialization error",
          reject,
        );
      }
    };

    worker.postMessage({
      command: "init",
      accessKey,
      modelPath,
      keywordPaths,
      keywordLabels,
      sensitivities,
      wasm: wasmBase64,
      wasmSimd: wasmSimdBase64,
    });
  });
}
