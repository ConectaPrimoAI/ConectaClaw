/**
 * SportsAgent.ts
 * Agente esportivo: resultados, calendário, estatísticas, palpites.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';
import axios from 'axios';
import { addLog } from '../web-terminal.js';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

export class SportsAgent implements Agent {
    name = 'SportsAgent';
    description = 'Esportes: resultados ao vivo, calendário, estatísticas, palpites.';
    keywords = ['futebol', 'basquete', 'vôlei', 'volei', 'nba', 'nfl', 'libertadores', 'brasileirão', 'brasileirao', 'champions', 'premier league', 'la liga', 'serie a', 'série a', 'palpite', 'placar', 'jogo de hoje', 'partida', 'gol', 'time do coração', 'seleção', 'selecao', 'tênis', 'tenis', 'ufc', 'mma', 'fórmula 1', 'formula 1', 'f1'];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/esporte') || l.startsWith('/esportes') || l.startsWith('/futebol') || l.startsWith('/placar') || l.startsWith('/sports') || l.startsWith('/palpite') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        addLog(`⚽ Sports: ${ctx.userMessage.substring(0, 60)}`);

        // Tenta buscar placares ao vivo via API pública
        try {
            const res = await axios.get('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard', { timeout: 8000 });
            const events = res.data?.events || [];
            if (events.length > 0) {
                const jogos = events.slice(0, 8).map((ev: any) => {
                    const comp = ev.competitions?.[0];
                    const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
                    const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
                    return `${home?.team?.abbreviation || '?'} ${home?.score || '0'} x ${away?.score || '0'} ${away?.team?.abbreviation || '?'} (${ev.status?.type?.description || '?'})`;
                }).join('\n');
                return `⚽ *Jogos de hoje:*\n\n${jogos}\n\n_Fonte: ESPN_`;
            }
        } catch {
            // cai pro LLM
        }

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o SportsAgent — um comentarista esportivo brasileiro.
Ajude com: história de times, estatísticas, regras, grandes jogos, comparativos entre atletas, calendários.
Seja apaixonado, use gírias do futebol (gol, lance, jogador, craque) e seja didático.`
                    },
                    { role: 'user', content: ctx.userMessage }
                ]
            });
            return `⚽ *SportsAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
