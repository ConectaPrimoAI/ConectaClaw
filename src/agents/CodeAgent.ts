/**
 * CodeAgent.ts
 * Agente especializado em programação, debugging e revisão de código.
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

export class CodeAgent implements Agent {
    name = 'CodeAgent';
    description = 'Programação, debugging, refatoração e revisão de código.';
    keywords = ['código', 'codigo', 'programar', 'programação', 'programacao', 'função', 'funcao', 'classe', 'método', 'metodo', 'bug', 'debug', 'erro no código', 'refatorar', 'typescript', 'javascript', 'python', 'rust', 'golang', 'java', 'c++', 'php', 'sql', 'regex', 'api rest', 'endpoint'];
    category = 'code' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/code') || l.startsWith('/codigo') || l.startsWith('/código') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const prompt = ctx.userMessage
            .replace(/^\/(code|codigo|código)\s*/i, '')
            .trim();

        if (!prompt) return '💻 Diga o que você quer que eu programe, debug ou revise.';

        addLog(`💻 CodeAgent: ${prompt.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.1,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o CodeAgent do JoelBot — um programador sênior expert.
Regras:
1. Sempre responda com código funcional e completo
2. Use blocos de código com linguagem identificada (\`\`\`typescript, \`\`\`python, etc.)
3. Explique brevemente antes/depois do código
4. Se for debug, mostre o problema E a solução
5. Prefira soluções idiomáticas e modernas
6. Se precisar de bibliotecas, indique o comando de instalação`
                    },
                    { role: 'user', content: prompt }
                ]
            });
            return `💻 *CodeAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            addLog(`❌ CodeAgent: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
