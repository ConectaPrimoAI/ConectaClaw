/**
 * HealthAgent.ts
 * Agente de saúde e bem-estar: dicas, informações, lembretes saudáveis.
 * ATENÇÃO: nunca substitui consulta médica.
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

export class HealthAgent implements Agent {
    name = 'HealthAgent';
    description = 'Dicas de saúde, bem-estar, exercícios e alimentação (educacional).';
    keywords = ['saúde', 'saude', 'exercício', 'exercicio', 'academia', 'musculação', 'musculacao', 'cardio', 'dieta', 'alimentação', 'alimentacao', 'receita saudável', 'receita saudavel', 'sono', 'estresse', 'ansiedade', 'bem-estar', 'bem estar', 'meditação', 'meditacao', 'yoga', 'hidratação', 'hidratacao'];
    category = 'productivity' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/saude') || l.startsWith('/saúde') || l.startsWith('/health') || l.startsWith('/dieta') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        addLog(`🏥 Health: ${ctx.userMessage.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o HealthAgent do JoelBot — um assistente de saúde EDUCACIONAL.
REGRAS OBRIGATÓRIAS:
1. NUNCA substitua consulta médica. Sempre termine com aviso.
2. Não diagnostique doenças. Oriente a procurar profissional.
3. Sugira hábitos saudáveis, exercícios seguros, alimentação balanceada.
4. Use linguagem acessível e empática.
5. Para emergências, diga para ligar SAMU 192.`
                    },
                    { role: 'user', content: ctx.userMessage }
                ]
            });
            return `🏥 *HealthAgent:*\n\n${chat.choices[0].message.content}\n\n⚠️ _Conteúdo educacional. Procure um profissional de saúde para diagnóstico._`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
