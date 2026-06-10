/**
 * StartupAgent.ts
 * Agente de startups e negócios: ideias, MVP, pitch, modelagem de negócio.
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

export class StartupAgent implements Agent {
    name = 'StartupAgent';
    description = 'Startups e negócios: ideias, MVP, pitch, modelagem, métricas.';
    keywords = ['startup', 'negócio', 'negocio', 'empresa', 'mvp', 'pitch', 'investidor', 'investimento anjo', 'venture capital', 'vc', 'saas', 'b2b', 'b2c', 'marketplace', 'pmf', 'product market fit', 'mrr', 'arr', 'churn', 'ltv', 'cac', 'kpi', 'okr', 'business model', 'modelo de negócio', 'modelo de negocio', 'lean canvas', 'business plan'];
    category = 'productivity' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/startup') || l.startsWith('/negocio') || l.startsWith('/negócio') || l.startsWith('/business') || l.startsWith('/mvp') || l.startsWith('/pitch') || l.startsWith('/investidor') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        addLog(`🚀 Startup: ${ctx.userMessage.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o StartupAgent — um investidor-anjo e mentor de startups (experiência Y Combinator).
Ajude com: ideação, validação de problema, MVP, modelagem de negócio (Business Model Canvas), pitch deck, métricas SaaS, growth, cap table, term sheet, estratégia go-to-market.
Pense como Paul Graham / Sam Altman. Use frameworks reais.`
                    },
                    { role: 'user', content: ctx.userMessage }
                ]
            });
            return `🚀 *StartupAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
