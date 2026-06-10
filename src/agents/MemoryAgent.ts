/**
 * MemoryAgent.ts
 * Agente de memória de longo prazo — conversa com a memória
 * persistente e responde perguntas sobre o passado.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import { longTermMemory } from './LongTermMemory.js';
import Groq from 'groq-sdk';
import { addLog } from '../web-terminal.js';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

export class MemoryAgent implements Agent {
    name = 'MemoryAgent';
    description = 'Gerencia memória de longo prazo: salvar, recuperar, buscar e resumar.';
    keywords = ['lembra', 'lembre', 'lembrar', 'memória', 'memoria', 'esquecer', 'esqueci', 'você sabe', 'você lembra', 'passado', 'mês passado', 'semana passada', 'ontem', 'histórico', 'historico', 'conversa anterior'];
    category = 'memory' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/lembrar') ||
            l.startsWith('/esquecer') ||
            l.startsWith('/memoria') ||
            l.startsWith('/memória') ||
            l.startsWith('/historico') ||
            l.startsWith('/histórico') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const msg = ctx.userMessage.trim();
        const lower = msg.toLowerCase();

        // ── /lembrar chave=valor ─────────────────────────────
        if (lower.startsWith('/lembrar')) {
            const content = msg.replace(/^\/lembrar\s*/i, '');
            const match = content.match(/^([^=]+)=(.+)$/s);
            if (!match) {
                return '❓ Use: `/lembrar nome=valor` (ex: `/lembrar comida_favorita=pizza`)';
            }
            const [, key, value] = match;
            longTermMemory.save(key.trim(), value.trim(), 'user-fact');
            return `🧠 Vou lembrar: *${key.trim()}* = _${value.trim()}_`;
        }

        // ── /esquecer chave ──────────────────────────────────
        if (lower.startsWith('/esquecer')) {
            const key = msg.replace(/^\/esquecer\s*/i, '').trim();
            if (!key) return '❓ Diga o que esquecer. Ex: `/esquecer comida_favorita`';
            const ok = longTermMemory.delete(key);
            return ok ? `🗑️ Esqueci: *${key}*` : `⚠️ Não encontrei: *${key}*`;
        }

        // ── /memoria ou /memória ─────────────────────────────
        if (lower.startsWith('/memoria') || lower.startsWith('/memória')) {
            const all = longTermMemory.getAllFormatted(100);
            const summaries = longTermMemory.getAllSummaries(ctx.userId)
                .map(s => `📅 ${s.month}: ${s.summary}`).join('\n');
            return `🧠 *Memória do JoelBot:*\n\n${all}\n\n📚 *Resumos mensais:*\n${summaries || '_(nenhum)_'}`;
        }

        // ── /historico ou /histórico ──────────────────────────
        if (lower.startsWith('/historico') || lower.startsWith('/histórico')) {
            const days = parseInt(msg.replace(/[^\d]/g, '')) || 7;
            const recent = longTermMemory.getRecentChats(ctx.userId, days, 30);
            if (recent.length === 0) return `📭 Nenhuma conversa nos últimos ${days} dias.`;
            const formatado = recent.map(c => {
                const data = new Date(c.timestamp).toLocaleString('pt-BR');
                const icone = c.role === 'user' ? '👤' : '🤖';
                return `${icone} [${data}]\n${c.content.substring(0, 200)}`;
            }).join('\n\n');
            return `📜 *Histórico (${days} dias):*\n\n${formatado}`;
        }

        // ── Busca livre (ex: "você lembra o que eu disse sobre o projeto?") ──
        if (lower.startsWith('você lembra') || lower.startsWith('voce lembra') ||
            lower.startsWith('o que eu disse') || lower.startsWith('pesquise na memória') ||
            lower.includes('lembra do que') || lower.includes('mês passado')) {
            const query = msg
                .replace(/^(você|voce)\s+lembra\s+/i, '')
                .replace(/^(o\s+que\s+eu\s+disse\s+sobre\s+)/i, '')
                .replace(/[?]/g, '')
                .trim();

            const encontrados = longTermMemory.searchChats(ctx.userId, query, 5);
            const fatos = longTermMemory.getAllFormatted(200);

            // Usa LLM para sintetizar
            try {
                const groq = getGroq();
                const chat = await groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        {
                            role: 'system',
                            content: 'Você é o JoelBot. O usuário perguntou sobre algo da memória. Use os FATOS e HISTÓRICO abaixo para responder. Se não encontrar, diga que não lembra. Seja breve e use bullet points.'
                        },
                        {
                            role: 'user',
                            content: `PERGUNTA: ${query}\n\nFATOS SALVOS:\n${fatos}\n\nHISTÓRICO RELEVANTE:\n${encontrados.map(c => `[${new Date(c.timestamp).toLocaleDateString('pt-BR')}] ${c.role}: ${c.content}`).join('\n')}`
                        }
                    ]
                });
                return `🧠 *Lembrei!*\n\n${chat.choices[0].message.content}`;
            } catch (e: any) {
                addLog(`❌ MemoryAgent LLM: ${e.message}`);
                if (encontrados.length > 0) {
                    return `🧠 Encontrei isso:\n\n${encontrados.map(c => `• [${new Date(c.timestamp).toLocaleDateString('pt-BR')}] ${c.content}`).join('\n')}`;
                }
                return '🤔 Não encontrei nada sobre isso na minha memória.';
            }
        }

        return null;
    }
}
