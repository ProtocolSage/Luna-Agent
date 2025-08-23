export type AudioBuf = Buffer;
export declare class PhraseCache {
    private maxItems;
    private store;
    private hash;
    get(text: string): AudioBuf | undefined;
    set(text: string, audio: AudioBuf): void;
    clear(): void;
    size(): number;
}
