/**
 * CookingAgent.ts
 * CORREÇÃO V24: Removida keyword 'como fazer' — muito genérica.
 * Mantidas apenas keywords culinárias específicas.
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

export class CookingAgent implements Agent {
    name = 'CookingAgent';
    description = 'Culinária: receitas, substituições de ingredientes, modos de preparo e dicas de cozinha.';
    // CORRIGIDO: Removido 'como fazer' e 'o que fazer com' (muito genéricos)
    keywords = [
        'receita', 'receita de', 'cozinhar', 'culinária', 'culinaria', 'prato',
        'ingrediente', 'substituir ingrediente', 'substituto culinário', 'modo de preparo',
        'jantar de hoje', 'almoço de hoje', 'almoco de hoje', 'café da manhã', 'cafe da manha',
        'sobremesa', 'bolo de', 'doce de', 'salgado de', 'vegano', 'vegetariano',
        'tempero', 'temperos', 'marinar', 'assar', 'fritar', 'cozido', 'refogado',
        'massa de pizza', 'molho de', 'consommé', 'caldo de'
    ];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/receita') || l.startsWith('/cozinha') || l.startsWith('/cooking') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const pedido = ctx.userMessage
            .replace(/^\/(receita|cozinha|cooking)\s*/i, '')
            .trim();

        if (!pedido) return '👨‍🍳 Qual receita ou dica culinária você quer?';

        addLog(`👨‍🍳 CookingAgent: ${pedido.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.3,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o CookingAgent — chef especializado. Responda em português.
Para receitas: liste ingredientes com quantidades, depois o modo de preparo passo a passo.
Para substituições: explique o substituto e como afeta o resultado.
Para dúvidas gerais de culinária: seja técnico e prático.
Use emojis de culinária moderadamente.`
                    },
                    { role: 'user', content: pedido }
                ]
            });
            return `👨‍🍳 *CookingAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            addLog(`❌ CookingAgent: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
