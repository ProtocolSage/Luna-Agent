import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('Root element not found');
  }

  const root = createRoot(container);
  root.render(<App />);
});

// Handle hot reload in development
declare const module: any;
if (typeof module !== 'undefined' && module.hot) {
  module.hot.accept('./App', () => {
    const NextApp = require('./App').App;
    const container = document.getElementById('root');
    if (container) {
      const root = createRoot(container);
      root.render(<NextApp />);
    }
  });
}

