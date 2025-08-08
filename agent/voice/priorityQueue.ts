interface Job {
  text: string;
  priority: number;
  resolve: () => void;
  reject: (e: Error) => void;
}

export class PriorityQueue {
  private list: Job[] = [];
  private processing = false;
  private playTextFn: (text: string) => Promise<void>;

  constructor(playTextFn: (text: string) => Promise<void>) {
    this.playTextFn = playTextFn;
  }

  enqueue(text: string, priority = 0): Promise<void> {
    return new Promise<void>((res, rej) => {
      this.list.push({ text, priority, resolve: res, reject: rej });
      this.list.sort((a, b) => b.priority - a.priority);   // high → low
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.list.length) {
      const job = this.list.shift()!;
      try {
        await this.playTextFn(job.text);
        job.resolve();
      } catch (e) {
        job.reject(e as Error);
      }
    }
    this.processing = false;
  }

  clear(): void {
    // Reject all pending jobs
    while (this.list.length) {
      const job = this.list.shift()!;
      job.reject(new Error('Queue cleared'));
    }
  }

  size(): number {
    return this.list.length;
  }
}
