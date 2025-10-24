"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityQueue = void 0;
class PriorityQueue {
  constructor(playTextFn) {
    this.list = [];
    this.processing = false;
    this.playTextFn = playTextFn;
  }
  enqueue(text, priority = 0) {
    return new Promise((res, rej) => {
      this.list.push({ text, priority, resolve: res, reject: rej });
      this.list.sort((a, b) => b.priority - a.priority); // high → low
      this.drain();
    });
  }
  async drain() {
    if (this.processing) return;
    this.processing = true;
    while (this.list.length) {
      const job = this.list.shift();
      try {
        await this.playTextFn(job.text);
        job.resolve();
      } catch (e) {
        job.reject(e);
      }
    }
    this.processing = false;
  }
  clear() {
    // Reject all pending jobs
    while (this.list.length) {
      const job = this.list.shift();
      job.reject(new Error("Queue cleared"));
    }
  }
  size() {
    return this.list.length;
  }
}
exports.PriorityQueue = PriorityQueue;
//# sourceMappingURL=priorityQueue.js.map
