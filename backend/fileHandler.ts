// File handler for Node.js/Electron main process
// This replaces the use of browser File API with proper Node.js alternatives

import { Buffer } from 'buffer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Blob } from 'buffer';

// Node.js compatible File-like class
export class NodeFile {
  public readonly name: string;
  public readonly size: number;
  public readonly type: string;
  public readonly lastModified: number;
  private _buffer: Buffer;

  constructor(chunks: Array<Buffer | ArrayBuffer | string>, filename: string, options: { type?: string } = {}) {
    this.name = filename;
    this.type = options.type || 'application/octet-stream';
    this.lastModified = Date.now();
    
    // Convert chunks to Buffer
    if (chunks.length === 0) {
      this._buffer = Buffer.alloc(0);
    } else if (chunks[0] instanceof Buffer) {
      this._buffer = Buffer.concat(chunks as Buffer[]);
    } else if (typeof chunks[0] === 'string') {
      this._buffer = Buffer.from(chunks.join(''), 'utf-8');
    } else {
      this._buffer = Buffer.from(chunks[0] as ArrayBuffer);
    }
    
    this.size = this._buffer.length;
  }

  async text(): Promise<string> {
    return this._buffer.toString('utf-8');
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    // Create a new ArrayBuffer to avoid SharedArrayBuffer issues
    const arrayBuffer = new ArrayBuffer(this._buffer.length);
    const view = new Uint8Array(arrayBuffer);
    view.set(this._buffer);
    return arrayBuffer;
  }

  slice(start?: number, end?: number, contentType?: string): NodeFile {
    const slicedBuffer = this._buffer.slice(start, end);
    return new NodeFile([slicedBuffer], this.name, { type: contentType || this.type });
  }

  stream(): ReadableStream {
    // Create a simple readable stream from the buffer
    const buffer = this._buffer;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(buffer);
        controller.close();
      }
    });
  }
}

// Helper function to read a file from disk and create a NodeFile instance
export async function readFileAsNodeFile(filePath: string): Promise<NodeFile> {
  const buffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  // Determine MIME type based on extension
  const mimeTypes: Record<string, string> = {    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip'
  };
  
  const type = mimeTypes[ext] || 'application/octet-stream';
  return new NodeFile([buffer], filename, { type });
}

// Helper function to save a NodeFile to disk
export async function saveNodeFileToDisk(file: NodeFile, dirPath: string): Promise<string> {
  const filePath = path.join(dirPath, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return filePath;
}

// Export as default for compatibility
export default {
  NodeFile,
  readFileAsNodeFile,
  saveNodeFileToDisk
};