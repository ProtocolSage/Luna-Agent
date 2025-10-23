// Temporary in-memory database service
// This will work without better-sqlite3 being compiled

class InMemoryDatabase {
  constructor() {
    this.messages = [];
    this.settings = {};
    console.log('[Database] Using in-memory database (no compilation required)');
  }

  // Messages
  getMessages(limit = 100) {
    return this.messages.slice(-limit);
  }

  addMessage(role, content, metadata = {}) {
    const message = {
      id: Date.now(),
      role,
      content,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    this.messages.push(message);
    return message;
  }

  clearMessages() {
    this.messages = [];
    return true;
  }

  // Settings
  getSetting(key) {
    return this.settings[key] || null;
  }

  setSetting(key, value) {
    this.settings[key] = value;
    return true;
  }

  // Compatibility methods
  prepare() {
    return {
      run: () => ({ changes: 1 }),
      get: () => null,
      all: () => []
    };
  }
}

module.exports = InMemoryDatabase;
