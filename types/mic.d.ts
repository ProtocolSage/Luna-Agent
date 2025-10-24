declare module "mic" {
  interface MicInstance {
    start(): void;
    stop(): void;
    getAudioStream(): NodeJS.ReadableStream;
  }

  interface MicOptions {
    rate?: string;
    channels?: string;
    debug?: boolean;
    exitOnSilence?: number;
    fileType?: string;
  }

  function mic(options: MicOptions): MicInstance;

  export = mic;
}
