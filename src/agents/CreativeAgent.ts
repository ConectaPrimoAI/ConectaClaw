/**
 * CreativeAgent.ts
 * Agente criativo: escreve histórias, poemas, roteiros, copy, etc.
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

export class CreativeAgent implements Agent {
    name = 'CreativeAgent';
    description = 'Escrita criativa: histórias, poemas, roteiros, copies, slogans, letras.';
    keywords = ['escreva', 'escreve', 'criar história', 'conto', 'poema', 'poesia', 'roteiro', 'crônica', 'cronica', 'slogan', 'copy', 'letra de música', 'haiku', 'soneto', 'criativo', 'criativa', 'imagine', 'inventar'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/criativo') || l.startsWith('/criar') || l.startsWith('/escrever') || l.startsWith('/historia') || l.startsWith('/história') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const pedido = ctx.userMessage
            .replace(/^\/(criativo|criar|escrever|historia|história)\s*/i, '')
            .trim();

        if (!pedido) return '🎨 Diga o que devo criar! Ex: `/criar um poema sobre o mar`';

        addLog(`🎨 Creative: ${pedido.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.9,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o CreativeAgent do JoelBot — um escritor criativo virtuoso.
Regras:
1. Use linguagem rica, metáforas, ritmo
2. Adapte o estilo ao pedido (épico, lírico, humorístico, sombrio, infantil...)
3. Estruture bem: parágrafos, versos, atos
4. Termine com um toque memorável`
                    },
                    { role: 'user', content: pedido }
                ]
            });
            return `🎨 *CreativeAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            addLog(`❌ Creative: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
