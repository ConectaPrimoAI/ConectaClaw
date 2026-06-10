/**
 * BrainstormAgent.ts
 * Agente de brainstorming: gera ideias criativas em qualquer domínio.
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

export class BrainstormAgent implements Agent {
    name = 'BrainstormAgent';
    description = 'Brainstorming: gera ideias criativas, naming, slogans, conceitos.';
    keywords = ['ideia', 'ideias', 'brainstorm', 'brainstorming', 'naming', 'slogan', 'conceito', 'criatividade', 'me dá ideias', 'me da ideias', 'sugestões', 'sugestoes', 'inspira'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/ideia') || l.startsWith('/ideias') || l.startsWith('/brainstorm') || l.startsWith('/naming') || l.startsWith('/slogan') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const tema = ctx.userMessage
            .replace(/^\/(ideia|ideias|brainstorm|naming|slogan)\s*/i, '')
            .trim();

        if (!tema) return '💡 Sobre o que devo ter ideias?';

        addLog(`💡 Brainstorm: ${tema}`);

        try {
            const groq = getGroq();
            // 3 chamadas para diversidade de ideias
            const [criativas, praticas, disruptivas] = await Promise.all([
                groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    temperature: 1.0,
                    messages: [{ role: 'user', content: `Gere 5 ideias CRIATIVAS e originais sobre: ${tema}. Lista numerada, uma linha cada.` }]
                }),
                groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    temperature: 0.5,
                    messages: [{ role: 'user', content: `Gere 5 ideias PRÁTICAS e executáveis sobre: ${tema}. Lista numerada.` }]
                }),
                groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    temperature: 1.1,
                    messages: [{ role: 'user', content: `Gere 5 ideias DISRUPTIVAS e contraintuitivas sobre: ${tema}. Lista numerada.` }]
                })
            ]);

            return (
                `💡 *Brainstorm: ${tema}*\n\n` +
                `🎨 *Criativas:*\n${criativas.choices[0].message.content}\n\n` +
                `🛠️ *Práticas:*\n${praticas.choices[0].message.content}\n\n` +
                `🚀 *Disruptivas:*\n${disruptivas.choices[0].message.content}`
            );
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
