// Enhanced File API polyfill for Node.js/Electron main process
// This provides compatibility for libraries that expect the File API

const { Blob } = require('buffer');

// Only polyfill if not already defined and we're in Node environment
if (typeof globalThis !== 'undefined' && typeof globalThis.File === 'undefined') {
  class File extends Blob {
    constructor(chunks, filename, options = {}) {
      // Ensure chunks is an array
      const parts = Array.isArray(chunks) ? chunks : [chunks];
      
      // Convert all parts to Buffers or strings
      const normalizedParts = parts.map(part => {
        if (part instanceof Buffer) return part;
        if (part instanceof ArrayBuffer) return Buffer.from(part);
        if (part instanceof Uint8Array) return Buffer.from(part);
        if (typeof part === 'string') return part;
        if (part && typeof part.toString === 'function') return part.toString();
        return String(part);
      });
      
      super(normalizedParts, options);
      this.name = String(filename);
      this.lastModified = options.lastModified || Date.now();
      this.lastModifiedDate = new Date(this.lastModified);
    }
  }
  
  // Make File available globally
  globalThis.File = File;
  
  // Also set on global for Node.js compatibility
  if (typeof global !== 'undefined' && !global.File) {
    global.File = File;
  }
  
  // Also ensure Blob is available globally (some libraries expect it)
  if (typeof globalThis.Blob === 'undefined') {
    globalThis.Blob = Blob;
  }
  if (typeof global !== 'undefined' && !global.Blob) {
    global.Blob = Blob;
  }
}

// Export for use in modules
module.exports = { File: globalThis.File || File };