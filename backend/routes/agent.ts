// Complete agent route with full tool integration
import { Router, Request, Response } from 'express';
import { ReasoningEngine } from '@agent/orchestrator/reasoningEngine';
import { ToolExecutive } from '@agent/tools/executive';
import { ToolOrchestrator } from '../services/ToolOrchestrator';
import { VectorStore } from '@agent/memory/vectorStore';
import { ModelRouter } from '@agent/orchestrator/modelRouter';
import { PIIFilter } from '@agent/validators/piiFilter';
import { GoalManager } from '@agent/tools/goals';
import { ReminderManager } from '@agent/tools/reminders';
import { MemoryDocument } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';

let civilMode = false;

export async function createAgentRouter(modelRouter: ModelRouter): Promise<Router> {
    const router = Router();
    const goalManager = new GoalManager();
    const reminderManager = new ReminderManager();
    const vectorStore = new VectorStore();
    const toolOrchestrator = new ToolOrchestrator();
    let reasoningEngine: ReasoningEngine;
    let toolExecutive: ToolExecutive;
    let piiFilter: PIIFilter;

    // Initialize components
    async function initializeComponents() {
        try {
            // Load configs
            const reasoningConfig = await loadConfig('reasoning.json');
            const policyConfig = await loadConfig('policy.json');
            
            // Initialize stores
            await vectorStore.initialize();
            
            // Create instances
            reasoningEngine = new ReasoningEngine(modelRouter, reasoningConfig);
            toolExecutive = new ToolExecutive(policyConfig);
            piiFilter = new PIIFilter();
            
            console.log('Agent components initialized successfully');
        } catch (error) {
            console.error('Failed to initialize agent components:', error);
            throw error;
        }
    }

    async function loadConfig(filename: string) {
        try {
            const configPath = path.join(__dirname, '../../config', filename);
            const content = await fs.readFile(configPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn(`Config ${filename} not found, using defaults`);
            return {};
        }
    }

    // Initialize on startup
    await initializeComponents();

    // Main chat endpoint with complete tool integration
    router.post('/chat', async (req: Request, res: Response) => {
        try {
            const { message, mode = 'conversational', persona = 'helpful', useTools = true, sessionId, context = [] } = req.body;
            
            if (!message) {
                return res.status(400).json({ error: 'Message is required' });
            }

            // Clean message
            const cleanMessage = await piiFilter.filter(message);
            
            // Get relevant memories
            const memories = await vectorStore.search(cleanMessage, { limit: 10, type: 'document' });
            
            // Check for tool requests first
            let toolResult = null;
            if (useTools) {
                toolResult = await toolOrchestrator.processWithTools(cleanMessage, { sessionId });
            }

            if (toolResult) {
                // Tool was executed, format response
                const response = {
                    type: 'tool_response',
                    message: toolResult.message,
                    toolUsed: toolResult.tool,
                    result: toolResult.result,
                    response: `I've executed the ${toolResult.tool || 'requested'} tool. ${toolResult.message}`
                };
                
                // Store in memory
                await vectorStore.upsert({
                    id: uuidv4(),
                    type: 'conversation',
                    timestamp: new Date().toISOString(),
                    content: `User: ${message}\nAssistant: ${response.response}`,
                    metadata: { sessionId, hasTools: true }
                });
                
                return res.json(response);
            }

            // No tool needed, get AI response
            const aiContext = {
                sessionHistory: memories,
                conversationContext: context,
                availableTools: useTools ? toolOrchestrator.getAvailableTools() : [],
                mode,
                persona
            };

            // Get response from reasoning engine
            const result = await reasoningEngine.reason('', cleanMessage, aiContext, civilMode);
            
            // Format response
            const response = {
                type: 'chat_response',
                response: (result as any).response || (result as any).content || 'I understand. How can I help you further?',
                reasoning: (result as any).reasoning,
                confidence: (result as any).confidence
            };

            // Store conversation in memory
            await vectorStore.upsert({
                id: uuidv4(),
                type: 'conversation',
                timestamp: new Date().toISOString(),
                content: `User: ${message}\nAssistant: ${response.response}`,
                metadata: { sessionId }
            });

            return res.json(response);
            
        } catch (error: any) {
            console.error('Chat error:', error);
            return res.status(500).json({ 
                error: 'Failed to process message',
                details: error.message 
            });
        }
    });

    // Tool execution endpoint
    router.post('/execute-tool', async (req: Request, res: Response) => {
        try {
            const { tool, args, sessionId } = req.body;
            
            if (!tool) {
                return res.status(400).json({ error: 'Tool name is required' });
            }

            const result = await toolExecutive.executePlan([{ tool, args }], sessionId || 'direct');
            return res.json(result[0]);
            
        } catch (error: any) {
            console.error('Tool execution error:', error);
            return res.status(500).json({ 
                error: 'Tool execution failed',
                details: error.message 
            });
        }
    });

    // Memory endpoints
    router.post('/memory/store', async (req: Request, res: Response) => {
        try {
            const { content, metadata = {} } = req.body;
            const doc: MemoryDocument = {
                id: uuidv4(),
                type: metadata.type || 'document',
                timestamp: new Date().toISOString(),
                content,
                ...metadata
            };
            await vectorStore.upsert(doc);
            return res.status(201).json({ id: doc.id, success: true });
        } catch (error: any) {
            console.error('Memory store error:', error);
            return res.status(500).json({ error: 'Failed to store memory' });
        }
    });

    router.post('/memory/search', async (req: Request, res: Response) => {
        try {
            const { query, limit = 5, type = 'document' } = req.body;
            const results = await vectorStore.search(query, { limit, type });
            return res.json({ results, count: results.length });
        } catch (error: any) {
            console.error('Memory search error:', error);
            return res.status(500).json({ error: 'Failed to search memory' });
        }
    });

    // Mode control
    router.post('/civil', (req, res) => {
        civilMode = !!req.body.enabled;
        return res.json({ civilMode, message: `Civil mode ${civilMode ? 'enabled' : 'disabled'}` });
    });

    // Task management
    router.post('/task/add', (req, res) => {
        const { task, due } = req.body;
        const newTask = goalManager.addTask(task, due);
        return res.json({ success: true, task: newTask });
    });

    router.get('/tasks', (req, res) => {
        const tasks = goalManager.getTasks();
        return res.json({ tasks, count: tasks.length });
    });

    router.post('/task/complete', (req, res) => {
        const { taskId } = req.body;
        // GoalManager identifies tasks by 'task' name; mark by name
        const ok = goalManager.markTaskDone(taskId);
        return res.json({ success: ok, message: ok ? 'Task marked as complete' : 'Task not found' });
    });

    // Reminder management
    router.post('/reminder/add', (req, res) => {
        const { text, time } = req.body;
        const reminder = reminderManager.addReminder(text, time); // Pass time as string
        return res.json({ success: true, reminder });
    });

    router.get('/reminders', (req, res) => {
        const reminders = reminderManager.getReminders(); // Use correct method name
        return res.json({ reminders, count: reminders.length });
    });

    // Health check
    router.get('/health', (req, res) => {
        res.json({ 
            status: 'healthy',
            components: {
                reasoning: !!reasoningEngine,
                tools: !!toolExecutive,
                memory: !!vectorStore,
                orchestrator: !!toolOrchestrator
            },
            timestamp: new Date().toISOString()
        });
    });

    return router;
}
