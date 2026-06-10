/**
 * FinanceAgent.ts
 * Agente financeiro: cotações, conversão de moedas, análise de investimentos.
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

export class FinanceAgent implements Agent {
    name = 'FinanceAgent';
    description = 'Cotações, conversão de moedas, análise financeira básica.';
    keywords = ['cotação', 'cotacao', 'dólar', 'dolar', 'euro', 'bitcoin', 'btc', 'ethereum', 'eth', 'ação', 'acoes', 'bolsa', 'investimento', 'moeda', 'câmbio', 'cambio', 'financeiro', 'finanças', 'financas', 'cripto', 'criptomoeda', 'ibovespa', 'ibov'];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/cotacao') || l.startsWith('/cotação') || l.startsWith('/finance') || l.startsWith('/financas') || l.startsWith('/finanças') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        addLog(`💰 Finance: ${ctx.userMessage.substring(0, 60)}`);

        try {
            // Tenta pegar cotação de dólar/euro/bitcoin via API pública
            const [usd, eur, btc] = await Promise.all([
                axios.get('https://economia.awesomeapi.com.br/json/last/USD-BRL', { timeout: 8000 }).catch(() => null),
                axios.get('https://economia.awesomeapi.com.br/json/last/EUR-BRL', { timeout: 8000 }).catch(() => null),
                axios.get('https://economia.awesomeapi.com.br/json/last/BTC-BRL', { timeout: 8000 }).catch(() => null)
            ]);

            let cotacoes = '';
            if (usd?.data?.USDBRL) {
                const d = usd.data.USDBRL;
                cotacoes += `💵 *Dólar (USD):* R$ ${parseFloat(d.bid).toFixed(2)} (var ${d.pctChange || '0'}%)\n`;
            }
            if (eur?.data?.EURBRL) {
                const d = eur.data.EURBRL;
                cotacoes += `💶 *Euro (EUR):* R$ ${parseFloat(d.bid).toFixed(2)} (var ${d.pctChange || '0'}%)\n`;
            }
            if (btc?.data?.BTCBRL) {
                const d = btc.data.BTCBRL;
                cotacoes += `₿ *Bitcoin (BTC):* R$ ${parseFloat(d.bid).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} (var ${d.pctChange || '0'}%)\n`;
            }

            if (cotacoes) {
                return `💰 *Cotações em tempo real:*\n\n${cotacoes}\n_Fonte: AwesomeAPI_`;
            }
        } catch {
            // cai pro fallback
        }

        // Fallback: LLM responde com base no conhecimento
        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'Você é o FinanceAgent do JoelBot. Ajude com finanças pessoais, investimentos, cotação de moedas (use dados que conhece). Sempre alerte: "não é aconselhamento financeiro".'
                    },
                    { role: 'user', content: ctx.userMessage }
                ]
            });
            return `💰 *FinanceAgent:*\n\n${chat.choices[0].message.content}\n\n_⚠️ Não é aconselhamento financeiro._`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
