/**
 * QuoteAgent.ts
 * Agente de citações e frases motivacionais.
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

const CITACOES: Array<{ texto: string; autor: string }> = [
    { texto: 'A única maneira de fazer um excelente trabalho é amar o que você faz.', autor: 'Steve Jobs' },
    { texto: 'Se você pode sonhá-lo, você pode fazê-lo.', autor: 'Walt Disney' },
    { texto: 'A lógica pode levar de A a B. A imaginação pode levar a qualquer lugar.', autor: 'Albert Einstein' },
    { texto: 'O sucesso é ir de fracasso em fracasso sem perder o entusiasmo.', autor: 'Winston Churchill' },
    { texto: 'A vida é o que acontece enquanto você está ocupado fazendo outros planos.', autor: 'John Lennon' },
    { texto: 'O futuro pertence àqueles que acreditam na beleza de seus sonhos.', autor: 'Eleanor Roosevelt' },
    { texto: 'Não é o mais forte que sobrevive, nem o mais inteligente. É o que melhor se adapta às mudanças.', autor: 'Charles Darwin' },
    { texto: 'A maior glória em viver não está em nunca cair, mas em nos levantarmos cada vez que caímos.', autor: 'Confúcio' },
    { texto: 'Seja a mudança que você quer ver no mundo.', autor: 'Mahatma Gandhi' },
    { texto: 'A simplicidade é a sofisticação máxima.', autor: 'Leonardo da Vinci' }
];

export class QuoteAgent implements Agent {
    name = 'QuoteAgent';
    description = 'Frases motivacionais, citações, pensamentos de grandes autores.';
    keywords = ['frase', 'frases', 'citação', 'citacao', 'quote', 'motivação', 'motivacao', 'motivacional', 'pensamento', 'inspiração', 'inspiracao', 'filosófico', 'filosofico', 'reflexão', 'reflexao'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/frase') || l.startsWith('/citacao') || l.startsWith('/citação') || l.startsWith('/quote') || l.startsWith('/motivacao') || l.startsWith('/motivação') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const pedido = ctx.userMessage
            .replace(/^\/(frase|citacao|citação|quote|motivacao|motivação)\s*/i, '')
            .trim();

        // Citação aleatória rápida
        if (!pedido || pedido.length < 3) {
            const c = CITACOES[Math.floor(Math.random() * CITACOES.length)];
            return `✨ _"${c.texto}"_\n\n— *${c.autor}*`;
        }

        addLog(`✨ Quote: ${pedido}`);
        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                temperature: 0.9,
                messages: [
                    {
                        role: 'system',
                        content: 'Você é o QuoteAgent. Gere 3 citações REAIS (ou de figuras históricas) sobre o tema pedido. Formato: cada uma em itálico + autor embaixo. Nunca invente autor; se não souber, escreva "Anônimo" ou "Provérbio popular".'
                    },
                    { role: 'user', content: pedido }
                ]
            });
            return `✨ *Citações sobre "${pedido}":*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
