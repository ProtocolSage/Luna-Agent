// Load File polyfill before any other imports
if (typeof globalThis.File === 'undefined') {
  const { Blob } = require('buffer');
  
  class File extends Blob {
    public name: string;
    public lastModified: number;
    
    constructor(chunks: any[], filename: string, options: any = {}) {
      super(chunks, options);
      this.name = filename;
      this.lastModified = options.lastModified || Date.now();
    }
  }
  
  (globalThis as any).File = File;
  if (typeof global !== 'undefined') (global as any).File = File;
}

import express, { Request, Response, NextFunction } from 'express';
import { ModelRouter } from '../agent/orchestrator/modelRouter';
import { PIIFilter } from '../agent/validators/piiFilter';
import { ChatRequest, ChatResponse, ModelConfig } from '../types';
import { createAgentRouter } from './routes/agent';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

// Load environment variables from .env file if it exists (won't override system vars)
dotenv.config();

// For Windows: Force load system environment variables if not already loaded
if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
  try {
    // Get User environment variables from Windows
    const openaiKey = execSync('powershell -Command "[Environment]::GetEnvironmentVariable(\'OPENAI_API_KEY\', \'User\')"', { encoding: 'utf8' }).trim();
    const anthropicKey = execSync('powershell -Command "[Environment]::GetEnvironmentVariable(\'ANTHROPIC_API_KEY\', \'User\')"', { encoding: 'utf8' }).trim();
    
    if (openaiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = openaiKey;
    }
    if (anthropicKey && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = anthropicKey;
    }
  } catch (error) {
    console.warn('Could not load system environment variables:', error);
  }
}

const app = express();
let port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Initialize components
const models: ModelConfig[] = [];

if (process.env.OPENAI_API_KEY) {
  models.push({
    name: 'gpt-4o-2024-08-06',
    provider: 'openai',
    temperature: 0.7,
    maxTokens: 2000,
    costPer1kTokensIn: 0.0025,
    costPer1kTokensOut: 0.01
  });
}

if (process.env.ANTHROPIC_API_KEY) {
  models.push({
    name: 'claude-3-sonnet-20240229',
    provider: 'anthropic',
    temperature: 0.7,
    maxTokens: 2000,
    costPer1kTokensIn: 0.003,
    costPer1kTokensOut: 0.015
  });
}

const modelRouter = new ModelRouter(models);
const piiFilter = new PIIFilter();

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Agent routes (advanced capabilities)  
async function initializeAgentRoutes() {
  const agentRouter = await createAgentRouter(modelRouter);
  app.use('/api', agentRouter);

  // Metrics endpoint
  app.get('/metrics', (req: Request, res: Response) => {
  try {
    const metrics = modelRouter.getMetrics();
    const circuitBreakers = modelRouter.getCircuitBreakerStatus();
    const totalCost = modelRouter.getTotalCost();

    res.json({
      models: metrics,
      circuitBreakers,
      totalCost,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Metrics endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
}

// Initialize agent routes and start server
async function startServer() {
  await initializeAgentRoutes();
  
  // Try to start server, handling port conflicts
  return new Promise((resolve, reject) => {
    const tryPort = (currentPort: number, maxRetries: number = 10) => {
      if (maxRetries === 0) {
        reject(new Error('Could not find an available port after 10 attempts'));
        return;
      }
      
      const server = app.listen(currentPort)
        .on('listening', () => {
          port = currentPort; // Update the port variable
          console.log(`Luna Agent server running on port ${port}`);
          console.log(`Health check: http://localhost:${port}/health`);
          resolve(server);
        })
        .on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`Port ${currentPort} is in use, trying ${currentPort + 1}...`);
            server.close();
            tryPort(currentPort + 1, maxRetries - 1);
          } else {
            reject(err);
          }
        });
    };
    
    tryPort(port);
  });
}

// Start the server
const serverPromise = startServer();

// Export at module level for proper TypeScript compatibility
export { app, serverPromise as server };
export default app;
