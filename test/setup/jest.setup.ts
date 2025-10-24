// Jest Setup File for Luna Agent Testing
// This file runs after the test framework has been installed in the environment

// Import jest-dom matchers for better DOM assertions
import "@testing-library/jest-dom";

// Mock the global lunaAPI that would normally be exposed by Electron preload
Object.defineProperty(window, "lunaAPI", {
  value: {
    config: {
      apiBase: "http://localhost:3005",
    },
    getSomeData: async () => ({ ok: true }),
    doAction: () => {},
  },
  writable: false,
});

// Mock Electron APIs that are used in renderer components
jest.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
  },
}));

// Mock Web Speech API for voice testing
Object.defineProperty(window, "SpeechRecognition", {
  value: class MockSpeechRecognition {
    continuous = true;
    interimResults = true;
    onstart = null;
    onresult = null;
    onerror = null;
    onend = null;

    start() {
      if (this.onstart) this.onstart({} as any);
    }

    stop() {
      if (this.onend) this.onend({} as any);
    }

    abort() {
      if (this.onend) this.onend({} as any);
    }
  },
  writable: false,
});

// Mock webkitSpeechRecognition for Safari/Chrome
Object.defineProperty(window, "webkitSpeechRecognition", {
  value: window.SpeechRecognition,
  writable: false,
});

// Mock MediaDevices for audio testing
Object.defineProperty(navigator, "mediaDevices", {
  value: {
    getUserMedia: jest.fn().mockResolvedValue({
      getTracks: () => [{ stop: jest.fn() }],
      getAudioTracks: () => [{ stop: jest.fn() }],
      addTrack: jest.fn(),
      removeTrack: jest.fn(),
    }),
    enumerateDevices: jest.fn().mockResolvedValue([]),
  },
  writable: false,
});

// Mock AudioContext for audio processing
global.AudioContext = jest.fn().mockImplementation(() => ({
  createAnalyser: jest.fn(),
  createGain: jest.fn(),
  createMediaStreamSource: jest.fn(),
  destination: {},
  sampleRate: 44100,
  state: "running",
  suspend: jest.fn(),
  resume: jest.fn(),
  close: jest.fn(),
}));

// Mock WebAudio AnalyserNode
global.AnalyserNode = jest.fn().mockImplementation(() => ({
  connect: jest.fn(),
  disconnect: jest.fn(),
  getByteFrequencyData: jest.fn(),
  getByteTimeDomainData: jest.fn(),
  fftSize: 2048,
  frequencyBinCount: 1024,
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Mock ResizeObserver for UI components
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Suppress console warnings in tests unless explicitly testing them
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  jest.clearAllMocks();
});
