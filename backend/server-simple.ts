// Simple backend server with minimal dependencies
import express, { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: any;
}

// Placeholder middleware implementations
const rateLimit = (options: any) => (req: any, res: any, next: any) => next();
const helmet = () => (req: any, res: any, next: any) => next();
const cors = () => (req: any, res: any, next: any) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
};
const compression = () => (req: any, res: any, next: any) => next();

// Placeholder JWT
const jwt = {
  sign: (payload: any, secret: string) => 'placeholder-token',
  verify: (token: string, secret: string, callback: (err: any, decoded: any) => void) => {
    callback(null, { userId: 'placeholder' });
  }
};

export class LunaServer {
  private app = express();
  private port = process.env.PORT || 3001;

  constructor() {
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cors());
    this.app.use(helmet());
    this.app.use(compression());

    // Rate limiting
    this.app.use('/api/', rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100
    }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Chat endpoint
    this.app.post('/api/chat', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { message } = req.body;
        
        // Placeholder response
        res.json({
          success: true,
          response: `Echo: ${message}`,
          model: 'placeholder',
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30
          }
        });
      } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Voice endpoints
    this.app.get('/api/voice/status', (req: Request, res: Response) => {
      res.json({
        stt: 'available',
        tts: 'available',
        engines: ['whisper', 'web-speech']
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log(`Luna Server running on port ${this.port}`);
    });
  }
}

// Export for backend/index.ts
export default new LunaServer();