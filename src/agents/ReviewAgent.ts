/**
 * ReviewAgent.ts
 * Agente de revisão: revisa textos, sugere melhorias, corrige gramática.
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

export class ReviewAgent implements Agent {
    name = 'ReviewAgent';
    description = 'Revisão textual: gramática, clareza, tom, estilo.';
    keywords = ['revisa', 'revisar', 'revisão', 'revisao', 'corrija', 'corrigir', 'gramática', 'gramatica', 'ortografia', 'melhore este texto', 'melhorar texto', 'editar texto', 'edita'];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/revisar') || l.startsWith('/revisao') || l.startsWith('/revisão') || l.startsWith('/corrigir') || l.startsWith('/editar') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const texto = ctx.userMessage
            .replace(/^\/(revisar|revisao|revisão|corrigir|editar)\s*/i, '')
            .replace(/^(revisa|revisar|corrija|corrigir|melhore este texto)\s+/i, '')
            .trim();

        if (!texto || texto.length < 10) return '✍️ Cole um texto (mínimo 10 caracteres) para revisar.';

        addLog(`✍️ Review: ${texto.length} chars`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o ReviewAgent — um revisor profissional.
Responda SEMPRE com:
1. **Versão revisada** do texto (mantendo o sentido original)
2. **Principais correções** (bullet points com explicações)
3. **Sugestões de estilo** (clareza, tom, impacto)
4. **Nota de 0 a 10** para: gramática, clareza, impacto
Seja gentil e didático.`
                    },
                    { role: 'user', content: texto }
                ]
            });
            return `✍️ *ReviewAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
