/**
 * SocialAgent.ts
 * Agente social: posts para Instagram, LinkedIn, Twitter, legendas, hashtags.
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

export class SocialAgent implements Agent {
    name = 'SocialAgent';
    description = 'Cria posts, legendas, hashtags e copies para redes sociais.';
    keywords = ['post', 'legenda', 'caption', 'hashtag', 'instagram', 'linkedin', 'twitter', 'tiktok', 'facebook', 'rede social', 'redes sociais', 'story', 'reels', 'carrossel'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/post') || l.startsWith('/legenda') || l.startsWith('/caption') || l.startsWith('/social') || l.startsWith('/hashtag') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const pedido = ctx.userMessage
            .replace(/^\/(post|legenda|caption|social|hashtag)\s*/i, '')
            .trim();

        if (!pedido) return '📱 Sobre o que é o post? Ex: `/post lançamento de produto fitness`';

        addLog(`📱 Social: ${pedido}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.85,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o SocialAgent — um copywriter especialista em redes sociais.
Gere:
1. **Post para Instagram** (com emojis, quebras de linha, hashtags)
2. **Post para LinkedIn** (mais formal, profissional)
3. **Post para Twitter/X** (até 280 caracteres, impactante)
4. **Hashtags relevantes** (10-15, mix de alto e baixo volume)
Use gatilhos mentais, storytelling, chamadas para ação (CTA).`
                    },
                    { role: 'user', content: pedido }
                ]
            });
            return `📱 *SocialAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
