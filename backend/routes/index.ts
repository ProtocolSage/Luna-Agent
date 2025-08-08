// Route exports
export { createAgentRouter } from './agent';

// Export common route types if needed
export interface RouteConfig {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  handler: (req: any, res: any) => Promise<void>;
}