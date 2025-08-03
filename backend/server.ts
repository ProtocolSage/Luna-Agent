import express, { Request, Response, NextFunction } from 'express';
import { ModelRouter } from '../agent/orchestrator/modelRouter';
import { PIIFilter } from '../agent/validators/piiFilter';
import { ChatRequest, ChatResponse, ModelConfig } from '../types';

const app = express();
const port = process.env.PORT || 3000;

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

// Chat endpoint
app.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, sessionId, model, temperature, maxTokens }: ChatRequest = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // PII detection
    const piiResult = piiFilter.detect(message);
    if (piiResult.hasPII && piiResult.confidence > 0.7) {
      res.status(400).json({ 
        error: 'Message contains PII and cannot be processed',
        piiTypes: piiResult.piiTypes
      });
      return;
    }

    // Route to LLM
    const response = await modelRouter.route(message, {
      preferredModel: model,
      temperature,
      maxTokens
    });

    const chatResponse: ChatResponse = {
      response: response.content,
      sessionId: sessionId || 'default',
      model: response.model,
      tokensUsed: response.tokensUsed,
      cost: response.cost
    };

    res.json(chatResponse);
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Start server
const server = app.listen(port, () => {
  console.log(`Luna Agent server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Chat endpoint: http://localhost:${port}/chat`);
});

export { app, server };

