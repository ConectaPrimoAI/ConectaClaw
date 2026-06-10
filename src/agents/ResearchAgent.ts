/**
 * ResearchAgent.ts
 * CORREÇÃO V24: Keywords mais específicas + priority=3 para ser preferido em pesquisas.
 * Adicionado LLM para quando o usuário faz perguntas abertas sem keywords explícitas.
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

export class ResearchAgent implements Agent {
    name = 'ResearchAgent';
    description = 'Pesquisa aprofundada: investiga tópicos, contrasta fontes e gera relatórios.';
    // CORRIGIDO: Mais específico — requer indicativo explícito de pesquisa/investigação
    keywords = [
        'pesquise sobre', 'pesquisa sobre', 'me explique sobre', 'investigue',
        'pesquisa aprofundada', 'o que você sabe sobre', 'relatório sobre',
        'fale sobre', 'explore o tema', 'me conta tudo sobre', 'quero entender',
        'como funciona exatamente', 'explica em detalhes', 'análise completa de',
        'pesquisar sobre', '/pesquisar', '/research'
    ];
    priority = 3;
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/pesquisar') || l.startsWith('/pesquisa') || l.startsWith('/research') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const topico = ctx.userMessage
            .replace(/^\/(pesquisar|pesquisa|research)\s*/i, '')
            .replace(/^(pesquise sobre|me explique sobre|investigue|relatório sobre|fale sobre|explore o tema|me conta tudo sobre|quero entender|como funciona exatamente|explica em detalhes|análise completa de)\s*/i, '')
            .trim();

        if (!topico) return '🔬 Sobre o que você quer que eu pesquise?';

        addLog(`🔬 Research: ${topico}`);

        try {
            const groq = getGroq();

            // Pesquisa em 3 camadas: visão geral, aprofundamento, conclusão
            const [geral, detalhes, opiniao] = await Promise.all([
                groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'Você é um pesquisador acadêmico. Faça um panorama geral do tema em 4-5 parágrafos, em português, citando conceitos-chave.' },
                        { role: 'user', content: topico }
                    ]
                }),
                groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'Aprofunde o tema com detalhes técnicos, exemplos práticos e casos de uso. Use bullet points. Limite a 800 palavras.' },
                        { role: 'user', content: topico }
                    ]
                }),
                groq.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: 'Dê um insight final, tendências atuais e o que vale a pena estudar a seguir sobre o tema. Seja breve (3-4 frases).' },
                        { role: 'user', content: topico }
                    ]
                })
            ]);

            return (
                `🔬 *Pesquisa: ${topico}*\n\n` +
                `📖 *Visão Geral:*\n${geral.choices[0].message.content}\n\n` +
                `🔍 *Aprofundamento:*\n${detalhes.choices[0].message.content}\n\n` +
                `💡 *Insight Final:*\n${opiniao.choices[0].message.content}`
            );
        } catch (e: any) {
            addLog(`❌ Research: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
