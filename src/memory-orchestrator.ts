import * as fs from 'node:fs';
import * as path from 'node:path';
import { addLog } from './web-terminal.js';

// ── 1. Memória Prática (JSON) ──────────────────────────────
const MEMORY_PATH = path.join(process.cwd(), 'data', 'long_term_memory.json');

if (!fs.existsSync(path.dirname(MEMORY_PATH))) {
    fs.mkdirSync(path.dirname(MEMORY_PATH), { recursive: true });
}

export class PracticalMemory {
    private data: Record<string, any> = {};

    constructor() {
        this.load();
    }

    private load() {
        if (fs.existsSync(MEMORY_PATH)) {
            try {
                this.data = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf-8'));
            } catch {
                this.data = {};
            }
        }
    }

    save(key: string, value: any) {
        this.data[key] = {
            value,
            timestamp: Date.now()
        };
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(this.data, null, 2));
    }

    get(key: string) {
        return this.data[key]?.value;
    }

    getAll() {
        return Object.entries(this.data)
            .map(([k, v]: [string, any]) => `${k}: ${JSON.stringify(v.value)}`)
            .join('\n');
    }
}

export const memory = new PracticalMemory();

// ── 2. Orquestrador de Agentes ─────────────────────────────
export interface Task {
    id: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
}

export class AgentOrchestrator {
    private tasks: Map<string, Task[]> = new Map();

    async planTasks(userId: number, mainGoal: string, groq: any): Promise<Task[]> {
        addLog(`🧠 Planejando tarefas para: ${mainGoal}`);
        
        const prompt = `Como um orquestrador de elite, divida a seguinte meta em no máximo 4 tarefas técnicas claras e sequenciais: "${mainGoal}". 
        Responda APENAS um JSON no formato: [{"id": "1", "description": "..."}]`;

        const chat = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const plan = JSON.parse(chat.choices[0].message.content).tasks || JSON.parse(chat.choices[0].message.content);
        this.tasks.set(userId.toString(), plan);
        return plan;
    }

    getTasks(userId: number) {
        return this.tasks.get(userId.toString()) || [];
    }
}

export const orchestrator = new AgentOrchestrator();
