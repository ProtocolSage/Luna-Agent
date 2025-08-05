import { Router, Request, Response } from 'express';
import { ReasoningEngine } from '../../agent/orchestrator/reasoningEngine';
import { ToolExecutive } from '../../agent/tools/executive';
import { VectorStore } from '../../agent/memory/vectorStore';
import { ModelRouter } from '../../agent/orchestrator/modelRouter';
import { PIIFilter } from '../../agent/validators/piiFilter';
import { GoalManager } from '../../agent/tools/goals';
import { ReminderManager } from '../../agent/tools/reminders';
import { MemoryDocument } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as schedule from 'node-schedule';
import { v4 as uuidv4 } from 'uuid';

let civilMode = false;

export async function createAgentRouter(modelRouter: ModelRouter): Promise<Router> {
    // Core component instantiation
    const router = Router();
    const goalManager = new GoalManager();
    const reminderManager = new ReminderManager();
    const vectorStore = new VectorStore();
    let reasoningEngine: ReasoningEngine;
    let toolExecutive: ToolExecutive;
    let piiFilter: PIIFilter;

    // --- CONFIG LOADING ---
    async function loadConfig(filename: string) {
        try {
            const configPath = path.join(__dirname, '../../config', filename);
            const content = await fs.readFile(configPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn(`Failed to load config ${filename}:`, error);
            return {};
        }
    }

    // --- INITIALIZE COMPONENTS ---
    const [reasoningConfig, policyConfig] = await Promise.all([
        loadConfig('reasoning.json'),
        loadConfig('policy.json')
    ]);
    await vectorStore.initialize();
    reasoningEngine = new ReasoningEngine(modelRouter, reasoningConfig);
    toolExecutive = new ToolExecutive(policyConfig);
    piiFilter = new PIIFilter();

    // --- NIGHTLY JOURNAL ---
    schedule.scheduleJob('59 23 * * *', async () => {
        try {
            const allTasks = goalManager.getTasks();
            const openTasks = allTasks.filter(t => !t.done);
            const closedTasks = allTasks.filter(
                t => t.done && t.completedAt && t.completedAt >= Date.now() - 24 * 60 * 60 * 1000
            );
            const summary = `Today you finished: ${closedTasks.map(t => t.task).join(', ') || 'nothing'}.\nRemaining: ${openTasks.map(t => t.task).join(', ') || 'nothing'}`;
            const journal: MemoryDocument = {
                id: uuidv4(),
                type: 'document',
                timestamp: new Date().toISOString(),
                content: `[Journal] ${new Date().toISOString()}\n${summary}`,
                metadata: { source: 'auto-journal' }
            };
            await vectorStore.upsert(journal);
            console.log('Nightly journal entry created.');
        } catch (err) {
            console.error('Journal job failed:', err);
        }
    });

    // ---- ENDPOINTS ----

    router.post('/agent/chat', async (req: Request, res: Response) => {
        try {
            const { message, mode, persona, useTools = true, sessionId } = req.body;
            const cleanMessage = await piiFilter.filter(message);
            const memories = await vectorStore.search(cleanMessage, { limit: 10, type: 'document' });
            const context = {
                sessionHistory: memories,
                availableTools: useTools ? await toolExecutive.getToolDefinitionsAsText() : [],
                mode,      // e.g. 'cot', 'tot', etc
                persona    // e.g. 'roast', 'civil', etc
            };
            const result = await reasoningEngine.reason(
                '',
                cleanMessage,
                context,
                civilMode
            );
            if (result.type === 'tool_use' && result.toolCalls) {
                const toolResults = await toolExecutive.executePlan(result.toolCalls, sessionId);
                return res.json({ type: 'tool_results', results: toolResults });
            }
            return res.json(result);
        } catch (error) {
            console.error('Agent chat error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    router.post('/agent/execute-tool', async (req: Request, res: Response) => {
        try {
            const { tool, args, sessionId } = req.body;
            const result = await toolExecutive.executePlan([{ tool, args }], sessionId);
            return res.json(result);
        } catch (error) {
            console.error('Tool execution error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // ---- MEMORY ENDPOINTS ----

    router.post('/agent/memory/store', async (req: Request, res: Response) => {
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
            return res.status(201).json({ id: doc.id });
        } catch (error) {
            console.error('Memory store error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    router.post('/agent/memory/search', async (req: Request, res: Response) => {
        try {
            const { query, limit = 5, type = 'document' } = req.body;
            const results = await vectorStore.search(query, { limit, type });
            return res.json(results);
        } catch (error) {
            console.error('Memory search error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // ---- MODES, GOALS, REMINDERS ----

    router.post('/agent/civil', (req, res) => {
        civilMode = !!req.body.enabled;
        return res.json({ civilMode });
    });

    // Goal tracking
    router.post('/agent/task/add', (req, res) => {
        const { task, due } = req.body;
        const newTask = goalManager.addTask(task, due);
        return res.json({ added: true, task: newTask });
    });

    router.get('/agent/tasks', (req, res) => {
        const tasks = goalManager.getTasks();
        return res.json(tasks);
    });

    router.post('/agent/task/done', (req, res) => {
        const { task } = req.body;
        const success = goalManager.markTaskDone(task);
        return res.json({ markedDone: success });
    });

    // Status
    router.get('/agent/status', (req, res) => {
        return res.json({
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            civilMode,
            roastMode: false,
            privateMode: false,
            focusMode: false
        });
    });

    // Reminders
    router.post('/agent/reminder/add', (req, res) => {
        const { message, time } = req.body;
        const result = reminderManager.addReminder(message, time);
        if (!result.scheduled) {
            return res.status(400).json({ error: result.error });
        }
        return res.json({ scheduled: true });
    });

    router.get('/agent/reminders', (req, res) => {
        const reminders = reminderManager.getReminders();
        return res.json(reminders);
    });

    // Journal
    router.get('/agent/journal/today', async (req, res) => {
        const today = new Date().toISOString().slice(0, 10);
        const entries = await vectorStore.search(`[Journal] ${today}`, { limit: 1, type: 'document' });
        return res.json({ journal: entries[0] ?? 'No entry yet.' });
    });

    return router;
}
