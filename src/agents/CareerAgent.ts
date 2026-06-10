/**
 * CareerAgent.ts
 * Agente de carreira: currículo, LinkedIn, entrevistas, salário, vagas.
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

export class CareerAgent implements Agent {
    name = 'CareerAgent';
    description = 'Carreira: currículo, LinkedIn, entrevistas, negociação salarial.';
    keywords = ['currículo', 'curriculo', 'linkedin', 'entrevista', 'vaga', 'emprego', 'salário', 'salario', 'carreira', 'profissional', 'trabalhar', 'recolocação', 'recolocacao', 'promoção', 'promocao', 'freela', 'freelancer', 'piso salarial'];
    category = 'productivity' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/carreira') || l.startsWith('/curriculo') || l.startsWith('/currículo') || l.startsWith('/linkedin') || l.startsWith('/entrevista') || l.startsWith('/vaga') || l.startsWith('/salario') || l.startsWith('/salário') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const pedido = ctx.userMessage
            .replace(/^\/(carreira|curriculo|currículo|linkedin|entrevista|vaga|salario|salário)\s*/i, '')
            .trim();

        if (!pedido) return '💼 Em que posso ajudar? Currículo? LinkedIn? Preparação para entrevista?';

        addLog(`💼 Career: ${pedido}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o CareerAgent — um headhunter e coach de carreira sênior.
Ajude com: revisão de currículo, otimização de LinkedIn, preparação para entrevistas (técnicas e comportamentais), negociação salarial, planejamento de carreira, transição de área.
Seja prático, direto e motive o usuário. Use bullet points e exemplos concretos.`
                    },
                    { role: 'user', content: pedido }
                ]
            });
            return `💼 *CareerAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
