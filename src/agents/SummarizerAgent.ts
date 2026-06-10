/**
 * SummarizerAgent.ts
 * Agente resumidor de textos longos.
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

export class SummarizerAgent implements Agent {
    name = 'SummarizerAgent';
    description = 'Resume textos longos, artigos, transcrições e documentos.';
    keywords = ['resumir', 'resumo', 'resuma', 'sintetizar', 'sintetize', 'resumo executivo', 'tl;dr', 'tldr', 'sumarize', 'sumarizar'];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/resumir') || l.startsWith('/resumo') ||
            l.startsWith('resuma ') || l.startsWith('resumir ') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const texto = ctx.userMessage
            .replace(/^\/(resumir|resumo)\s*/i, '')
            .replace(/^(resuma|resumir)\s+/i, '')
            .trim();

        if (!texto || texto.length < 50) {
            return '📋 Cole um texto longo (50+ caracteres) para eu resumir. Ex: `/resumir <seu texto aqui>`';
        }

        addLog(`📋 Summarizer: ${texto.length} chars`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'Você é o SummarizerAgent. Faça um resumo estruturado em português com: 1) Resumo executivo (2-3 frases), 2) Pontos-chave (bullet points), 3) Conclusão/insight. Seja conciso e objetivo.'
                    },
                    { role: 'user', content: texto }
                ]
            });
            return `📋 *Resumo:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            addLog(`❌ Summarizer: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
