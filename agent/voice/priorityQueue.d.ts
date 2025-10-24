export declare class PriorityQueue {
  private list;
  private processing;
  private playTextFn;
  constructor(playTextFn: (text: string) => Promise<void>);
  enqueue(text: string, priority?: number): Promise<void>;
  private drain;
  clear(): void;
  size(): number;
}
