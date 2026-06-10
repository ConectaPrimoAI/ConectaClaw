/**
 * SpecializedAgent.ts
 * CORREÇÃO V24: Keywords geradas automaticamente agora são mais específicas.
 * Removida lógica de split por espaço que gerava palavras genéricas como 'para', 'com', etc.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

// Stop-words para evitar keywords genéricas
const STOP_WORDS = new Set([
    'para', 'com', 'que', 'uma', 'por', 'como', 'mais', 'suas', 'seus',
    'este', 'essa', 'esse', 'sobre', 'numa', 'num', 'aos', 'das', 'dos',
    'nas', 'nos', 'pelo', 'pela', 'também', 'entre', 'quando', 'onde',
    'agente', 'agent', 'oferece', 'auxilia', 'ajuda', 'gerencia', 'planeja',
    'fornece', 'cria', 'desenvolve', 'monitora', 'gera'
]);

export class SpecializedAgent implements Agent {
    keywords: string[];
    category: 'analysis' | 'creative' | 'productivity' | 'communication' | 'system' = 'analysis';

    constructor(public name: string, public description: string) {
        // CORRIGIDO: Gerar keywords mais específicas sem stop-words
        const nomeBase = name.toLowerCase().replace(/agent$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
        
        const palavrasDesc = description.toLowerCase()
            .split(/[\s,;.]+/)
            .filter(w => w.length > 5 && !STOP_WORDS.has(w));

        this.keywords = [nomeBase, ...palavrasDesc.slice(0, 8)];

        // Define categoria baseada no nome
        if (name.match(/Creative|Music|Cooking|Travel|Chef|Event/i)) this.category = 'creative';
        else if (name.match(/Code|DevOps|Security|Cyber|Developer/i)) this.category = 'system';
        else if (name.match(/Productivity|Health|Career|Project|Fitness|HR/i)) this.category = 'productivity';
        else if (name.match(/Translator|Language|Customer/i)) this.category = 'communication';
        else this.category = 'analysis';
    }

    async canHandle(ctx: AgentContext): Promise<boolean> {
        const msg = ctx.userMessage.toLowerCase();
        return this.keywords.some(k => k.length > 4 && msg.includes(k));
    }

    async execute(agentCtx: AgentContext, _telegrafCtx: Context): Promise<AgentResult | string | null> {
        const task = agentCtx.userMessage;

        // Hardcoded para agentes com comportamentos específicos
        if (this.name === 'DataAnalystAgent') {
            return `📊 *Análise de Dados:*\n\nProcessando: "${task}".\n\nPosso ajudar com análise de planilhas, métricas, gráficos e insights. Compartilhe seus dados!`;
        }

        if (this.name === 'LegalAgent') {
            return `⚖️ *Consulta Jurídica:*\n\n"${task}"\n\n*Nota:* Forneço informações educacionais. Consulte sempre um advogado para casos reais.`;
        }

        if (this.name === 'MedicalAgent') {
            return `🩺 *Orientações de Saúde:*\n\nAnalisando: "${task}".\n\n*Importante:* Não substituo consulta médica. Emergências: ligue 192 (SAMU).`;
        }

        if (this.name === 'TherapistAgent') {
            return `🧠 *Apoio Emocional:*\n\nEstou aqui para ouvir. O que está acontecendo?\n\n*Nota:* Para suporte psicológico profissional, recomendo buscar um psicólogo. CVV: 188 (24h).`;
        }

        // Resposta genérica via LLM para outros agentes especializados
        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                temperature: 0.3,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o ${this.name} — ${this.description}. Responda em português, de forma especializada e útil.`
                    },
                    { role: 'user', content: task }
                ]
            });
            return `🤖 *${this.name}:*\n\n${chat.choices[0].message.content}`;
        } catch {
            return `🤖 *${this.name}*\n\nEstou pronto para ajudar com: ${this.description}\n\nSua solicitação: "${task}"`;
        }
    }
}
