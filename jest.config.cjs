/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/test/**/*.test.tsx',
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
    // Map node-fetch to a CommonJS compatible version
    '^node-fetch$': '<rootDir>/test/mocks/node-fetch.js',
    // Map cheerio to a mock
    '^cheerio$': '<rootDir>/test/mocks/cheerio.js'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      }
    }],
  },
  // Handle ESM modules in node_modules - add cheerio and its dependencies
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|cheerio|cheerio-select|htmlparser2|domhandler|domutils|dom-serializer|entities|css-select|css-what|nth-check|boolbase)/)'
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'backend/**/*.{ts,js}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: false,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ]
  // Removed globals section - ts-jest config is now in transform
};