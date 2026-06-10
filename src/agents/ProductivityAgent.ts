/**
 * ProductivityAgent.ts
 * Agente de produtividade: listas de tarefas, planejamento, agenda, hábitos.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';
import { addLog } from '../web-terminal.js';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

interface Task {
    id: string;
    text: string;
    done: boolean;
    createdAt: number;
}

const tasks: Map<number, Task[]> = new Map();

export class ProductivityAgent implements Agent {
    name = 'ProductivityAgent';
    description = 'Gerencia listas de tarefas, rotinas e planejamento pessoal.';
    keywords = ['tarefa', 'tarefas', 'todo', 'to-do', 'lista de tarefas', 'planejar', 'planejamento', 'agenda', 'meta', 'objetivo', 'hábitos', 'habitos', 'rotina', 'produtividade'];
    category = 'productivity' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/todo') || l.startsWith('/tarefa') || l.startsWith('/tarefas') ||
            l.startsWith('/planejar') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const msg = ctx.userMessage.trim();
        const lower = msg.toLowerCase();
        const userId = ctx.userId;

        if (!tasks.has(userId)) tasks.set(userId, []);

        const userTasks = tasks.get(userId)!;

        // /todo adicionar <texto>
        if (lower.startsWith('/todo add') || lower.startsWith('/tarefa add') || lower.startsWith('adicionar tarefa')) {
            const text = msg.replace(/^(\/todo|\/tarefa)\s+add\s+/i, '').replace(/^adicionar\s+tarefa\s+/i, '').trim();
            if (!text) return '❓ Diga o que adicionar.';
            const t: Task = { id: Date.now().toString(36), text, done: false, createdAt: Date.now() };
            userTasks.push(t);
            return `✅ Tarefa adicionada: *${text}*\n_Use /todo ver para listar_`;
        }

        // /todo done <id>
        const doneMatch = lower.match(/^\/todo\s+(concluir|done|feito)\s+(\w+)/);
        if (doneMatch) {
            const t = userTasks.find(x => x.id === doneMatch[2]);
            if (!t) return '❌ ID não encontrado.';
            t.done = true;
            return `🎉 Tarefa concluída: *${t.text}*`;
        }

        // /todo remover <id>
        const remMatch = lower.match(/^\/todo\s+(remover|delete|del|rm)\s+(\w+)/);
        if (remMatch) {
            const idx = userTasks.findIndex(x => x.id === remMatch[2]);
            if (idx < 0) return '❌ ID não encontrado.';
            const removed = userTasks.splice(idx, 1);
            return `🗑️ Removida: *${removed[0].text}*`;
        }

        // /todo ver ou /tarefas
        if (lower.startsWith('/todo ver') || lower.startsWith('/todo list') ||
            lower.startsWith('/tarefas') || lower === '/todo') {
            if (userTasks.length === 0) return '📭 Lista vazia! Use `/todo add <texto>`';
            const linhas = userTasks.map(t =>
                `${t.done ? '✅' : '⬜'} *${t.id}* ${t.text}`
            ).join('\n');
            const pendentes = userTasks.filter(t => !t.done).length;
            return `📋 *Suas tarefas (${pendentes} pendentes):*\n\n${linhas}\n\n_/todo done <id> | /todo rm <id>_`;
        }

        // /planejar <meta>
        if (lower.startsWith('/planejar')) {
            const meta = msg.replace(/^\/planejar\s*/i, '').trim();
            if (!meta) return '🎯 Diga a meta. Ex: `/planejar lançar app em 30 dias`';
            addLog(`🎯 Planejando: ${meta}`);

            try {
                const groq = getGroq();
                const chat = await groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        {
                            role: 'system',
                            content: 'Você é um coach de produtividade. Crie um plano de ação detalhado com fases (semana 1, semana 2...), marcos (milestones) e tarefas específicas. Responda em português, com bullet points.'
                        },
                        { role: 'user', content: meta }
                    ]
                });
                return `🎯 *Plano para: ${meta}*\n\n${chat.choices[0].message.content}`;
            } catch (e: any) {
                return `❌ Erro: ${e.message}`;
            }
        }

        return null;
    }

    static getTasks(userId: number): Task[] {
        return tasks.get(userId) || [];
    }
}
