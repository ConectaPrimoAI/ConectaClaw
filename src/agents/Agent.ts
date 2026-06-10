/**
 * Agent.ts
 * Interface base para todos os agentes de IA do JoelBot.
 *
 * CORREÇÃO V24: selectBestAgent agora usa LLM como árbitro quando há
 * ambiguidade, além de checar canHandle() corretamente em todos os agentes.
 */
import { Context } from 'telegraf';
import Groq from 'groq-sdk';

export interface AgentContext {
    userId: number;
    userMessage: string;
    userName?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    memory?: Map<string, any>;
    extra?: Record<string, any>;
}

export interface AgentResult {
    text?: string;
    audio?: Buffer;
    image?: Buffer;
    file?: { path: string; type: 'document' | 'photo' | 'video' | 'voice' };
    tags?: string[];     // Tags de skill disparadas
    nextAgent?: string;  // Encaminha para outro agente
    metadata?: Record<string, any>;
}

export interface Agent {
    name: string;
    description: string;
    /** Tags/keywords que este agente sabe responder (em minúsculo) */
    keywords: string[];
    /** Prioridade: maior = mais específico. Padrão = 0 */
    priority?: number;
    /** Categorias para roteamento */
    category: 'memory' | 'media' | 'productivity' | 'code' | 'analysis' | 'creative' | 'communication' | 'system';
    /** Verifica se o agente pode lidar com a mensagem */
    canHandle(ctx: AgentContext): boolean | Promise<boolean>;
    /** Executa a tarefa do agente */
    execute(ctx: AgentContext, telegrafCtx: Context): Promise<AgentResult | string | null>;
}

// ── Instância Groq compartilhada para roteamento ──────────────
let _routerGroq: Groq | null = null;
function getRouterGroq(): Groq {
    if (!_routerGroq) _routerGroq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return _routerGroq;
}

/**
 * Registry central de agentes
 */
export class AgentRegistry {
    private agents: Agent[] = [];

    register(agent: Agent) {
        this.agents.push(agent);
        console.log(`[AgentRegistry] ✅ ${agent.name} (${agent.category})`);
    }

    getAll(): Agent[] {
        return this.agents;
    }

    getByCategory(category: Agent['category']): Agent[] {
        return this.agents.filter(a => a.category === category);
    }

    /**
     * ROTEADOR CORRIGIDO V24
     * 
     * Pipeline de 3 etapas:
     * 1. Verificar todos os canHandle() — coleta candidatos reais
     * 2. Pontuar candidatos por especificidade de keyword
     * 3. Se mais de 1 candidato com pontuação próxima → LLM desempata
     */
    async selectBestAgent(ctx: AgentContext): Promise<Agent | null> {
        const lower = ctx.userMessage.toLowerCase();

        // ── Etapa 1: Coletar candidatos via canHandle() ──────────
        const candidatos: Array<{ agent: Agent; score: number }> = [];

        for (const agent of this.agents) {
            try {
                const pode = await agent.canHandle(ctx);
                if (!pode) continue;

                // ── Etapa 2: Pontuar por especificidade ──────────────
                let score = 0;
                const prioridade = agent.priority ?? 0;

                for (const kw of agent.keywords) {
                    const kwLower = kw.toLowerCase();
                    if (lower.includes(kwLower)) {
                        // Keywords mais longas/específicas valem mais
                        score += kwLower.split(' ').length * 3;
                        // Bônus se a keyword aparece no início da mensagem
                        if (lower.startsWith(kwLower)) score += 2;
                    }
                }

                // Adicionar prioridade explícita do agente
                score += prioridade * 10;

                candidatos.push({ agent, score });
            } catch {
                // Ignorar erros de canHandle
            }
        }

        if (candidatos.length === 0) return null;
        if (candidatos.length === 1) return candidatos[0].agent;

        // Ordenar por score
        candidatos.sort((a, b) => b.score - a.score);

        const melhor = candidatos[0];
        const segundo = candidatos[1];

        // Se o melhor é claramente dominante (>= 4 pontos a mais), retornar direto
        if (melhor.score - segundo.score >= 4) {
            return melhor.agent;
        }

        // ── Etapa 3: Desempate via LLM (só quando há ambiguidade real) ──
        return await this._llmDesempate(ctx.userMessage, candidatos.slice(0, 5));
    }

    /**
     * Usa o LLM de 8B como árbitro para desempatar agentes candidatos.
     * Retorna o agente mais adequado para a mensagem.
     */
    private async _llmDesempate(
        mensagem: string,
        candidatos: Array<{ agent: Agent; score: number }>
    ): Promise<Agent> {
        try {
            const lista = candidatos
                .map((c, i) => `${i + 1}. ${c.agent.name} — ${c.agent.description}`)
                .join('\n');

            const groq = getRouterGroq();
            const resp = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                temperature: 0,
                max_tokens: 10,
                messages: [
                    {
                        role: 'system',
                        content: `Você é um roteador de agentes de IA. Recebe uma mensagem do usuário e uma lista de agentes candidatos. 
Responda APENAS com o número do agente mais adequado (ex: "1" ou "3"). Nada mais.`
                    },
                    {
                        role: 'user',
                        content: `Mensagem: "${mensagem}"\n\nAgentes:\n${lista}\n\nQual agente deve responder? (responda só o número)`
                    }
                ]
            });

            const escolha = parseInt((resp.choices[0].message.content || '').trim(), 10);
            if (!isNaN(escolha) && escolha >= 1 && escolha <= candidatos.length) {
                return candidatos[escolha - 1].agent;
            }
        } catch (e) {
            console.error('[AgentRegistry] Erro no desempate LLM:', e);
        }

        // Fallback: retornar o de maior score
        return candidatos[0].agent;
    }
}

export const agentRegistry = new AgentRegistry();
