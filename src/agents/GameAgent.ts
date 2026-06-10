/**
 * GameAgent.ts
 * Agente de jogos: dicas, guias, builds, easter eggs, joguinhos.
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

export class GameAgent implements Agent {
    name = 'GameAgent';
    description = 'Jogos: dicas, builds, guias, easter eggs e joguinhos no chat.';
    keywords = ['jogo', 'jogos', 'game', 'gamer', 'gaming', 'playstation', 'xbox', 'nintendo', 'steam', 'pc gamer', 'build', 'moba', 'fps', 'rpg', 'elden ring', 'minecraft', 'fortnite', 'valorant', 'league of legends', 'lol', 'cs2', 'csgo', 'warzone', 'brawl stars', 'free fire', 'roblox', 'genshin'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/game') || l.startsWith('/jogo') || l.startsWith('/gamer') || l.startsWith('/dica game') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const msg = ctx.userMessage;
        const lower = msg.toLowerCase();

        // Joguinho: jogo da velha, forca, dado, par ou ímpar
        if (lower.match(/^(joga|rola)\s+(dado|dice)/) || lower === '/dado') {
            const n = Math.floor(Math.random() * 6) + 1;
            const emojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            return `🎲 *Dado:* ${emojis[n]} (${n})`;
        }

        if (lower.match(/^(par|ímpar|impar)\b/) || lower === '/parouimpar') {
            const escolha = lower.match(/^(par|impar|ímpar)/)?.[0];
            const userNum = parseInt(msg.replace(/[^0-9]/g, '')) || Math.floor(Math.random() * 10);
            const botNum  = Math.floor(Math.random() * 10);
            const soma    = userNum + botNum;
            const deuPar  = soma % 2 === 0;
            const userEscolheuPar = escolha === 'par';
            const ganhou  = (deuPar && userEscolheuPar) || (!deuPar && !userEscolheuPar);
            return (
                `🎲 *Par ou Ímpar*\n\n` +
                `Você: ${userNum} | Eu: ${botNum} | Soma: ${soma}\n` +
                `${deuPar ? 'Par' : 'Ímpar'}!\n\n` +
                `${ganhou ? '🎉 Você ganhou!' : '😅 Eu ganhei! Tente de novo.'}`
            );
        }

        if (lower === '/coinflip' || lower === '/moeda' || lower.includes('cara ou coroa')) {
            const resultado = Math.random() < 0.5 ? 'Cara' : 'Coroa';
            return `🪙 *Caiu:* ${resultado}`;
        }

        if (lower === '/numero' || lower.startsWith('/adivinhe')) {
            return '🔢 Pensei em um número de 1 a 100. Tente adivinhar! (Responda com o número)';
        }

        // Dicas / guias via LLM
        addLog(`🎮 Game: ${msg.substring(0, 60)}`);
        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o GameAgent — um gamer veterano. Ajuda com: dicas, builds, guias, easter eggs, lore, estratégias.
Pode ser sério (guias competitivos) ou divertido (easter eggs). Use linguagem gamer mas acessível.`
                    },
                    { role: 'user', content: msg }
                ]
            });
            return `🎮 *GameAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
