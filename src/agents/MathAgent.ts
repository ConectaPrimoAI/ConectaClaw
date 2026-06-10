/**
 * MathAgent.ts
 * Agente matemático — resolve equações, cálculos, conversões.
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

export class MathAgent implements Agent {
    name = 'MathAgent';
    description = 'Resolução de equações, cálculos, conversões, problemas de lógica.';
    keywords = ['calcula', 'calcule', 'calcular', 'quanto é', 'quanto da', 'soma', 'subtração', 'multiplicação', 'divisão', 'raiz quadrada', 'equação', 'derivada', 'integral', 'matemática', 'matematica', 'converte', 'conversão', 'conversao', 'porcentagem', 'juros', 'logaritmo'];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/math') || l.startsWith('/calcular') || l.startsWith('/calc') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const expressao = ctx.userMessage
            .replace(/^\/(math|calcular|calc)\s*/i, '')
            .trim();

        if (!expressao) return '🔢 Diga o que calcular. Ex: `quanto é 2 + 2 * 5?`';

        addLog(`🔢 Math: ${expressao}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o MathAgent. Resolva o problema matemático a seguir com precisão absoluta.
Regras:
1. Mostre o passo a passo brevemente
2. Destaque o resultado final em **negrito**
3. Se houver ambiguidade, pergunte
4. Para conversões, mostre a fórmula usada`
                    },
                    { role: 'user', content: expressao }
                ]
            });
            return `🔢 *MathAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            addLog(`❌ Math: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
