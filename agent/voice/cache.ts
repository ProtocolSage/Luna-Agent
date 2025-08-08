import crypto from 'crypto';

export type AudioBuf = Buffer;

export class PhraseCache {
  private maxItems = 200;                 // tweak to taste
  private store = new Map<string, AudioBuf>();

  private hash(text: string): string {
    return crypto.createHash('sha1').update(text).digest('hex');
  }

  get(text: string): AudioBuf | undefined {
    const key = this.hash(text);
    return this.store.get(key);
  }

  set(text: string, audio: AudioBuf): void {
    const key = this.hash(text);
    this.store.set(key, audio);
    
    // rudimentary LRU eviction
    if (this.store.size > this.maxItems) {
      const first = this.store.keys().next().value;
      this.store.delete(first);
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
