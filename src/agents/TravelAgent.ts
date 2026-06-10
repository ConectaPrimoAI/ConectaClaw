/**
 * TravelAgent.ts
 * Agente de viagens: roteiros, dicas de destinos, orçamento, malas.
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

export class TravelAgent implements Agent {
    name = 'TravelAgent';
    description = 'Roteiros de viagem, dicas de destinos, orçamento, malas, vistos.';
    keywords = ['viagem', 'viagens', 'roteiro', 'destino', 'turismo', 'passagem', 'hotel', 'hostel', 'airbnb', 'mochilão', 'mochilao', 'europa', 'asia', 'exterior', 'viajar para', 'férias', 'ferias', 'passeio', 'city tour', 'mala'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/viagem') || l.startsWith('/roteiro') || l.startsWith('/travel') || l.startsWith('/destino') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const pedido = ctx.userMessage
            .replace(/^\/(viagem|roteiro|travel|destino)\s*/i, '')
            .trim();

        if (!pedido) return '✈️ Para onde você quer viajar ou qual o tipo de ajuda?';

        addLog(`✈️ Travel: ${pedido}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o TravelAgent — um consultor de viagens experiente.
ESTRUTURE:
1. **Visão geral** (clima, melhor época, moeda, idioma)
2. **Roteiro sugerido** (dia a dia, se aplicável)
3. **Orçamento estimado** (baixo, médio, alto — em R$)
4. **O que não perder** (pontos turísticos imperdíveis)
5. **Dicas práticas** (transporte, segurança, golpes comuns, vistos)
6. **Checklist de mala** (se relevante)
Seja realista e detalhista.`
                    },
                    { role: 'user', content: pedido }
                ]
            });
            return `✈️ *TravelAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
