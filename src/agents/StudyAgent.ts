/**
 * StudyAgent.ts
 * CORREÇÃO V24: Removidas keywords 'o que é', 'explique', 'me explica', 'conceito'
 * que são muito genéricas e conflitam com ResearchAgent, HealthAgent, etc.
 * Agora requer contexto explícito de estudo/aprendizado.
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

export class StudyAgent implements Agent {
    name = 'StudyAgent';
    description = 'Explica conceitos, ajuda com provas, gera flashcards e quizzes para estudo.';
    // CORRIGIDO: Removidos 'o que é', 'explique', 'me explica', 'conceito', 'defina' (genéricos)
    keywords = [
        'estudar', 'estudo', 'prova de', 'concurso', 'vestibular', 'flashcard',
        'quiz', 'perguntas para estudar', 'resumo de matéria', 'matéria de',
        'aprender sobre', 'me ensina', 'como aprender', 'mapa mental',
        'fixar conteúdo', 'revisão de matéria', 'simulado', 'gabarito',
        'enem', 'exercício de fixação', 'atividade de estudo'
    ];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/estudar') || l.startsWith('/estudo') || l.startsWith('/estuda') || l.startsWith('/aprender') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const topico = ctx.userMessage
            .replace(/^\/(estudar|estudo|estuda|aprender)\s*/i, '')
            .replace(/^(me ensina|aprender sobre|como aprender)\s*/i, '')
            .trim();

        if (!topico) return '📚 Sobre o que você quer estudar?';

        addLog(`📚 Study: ${topico}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `Você é o StudyAgent — um professor didático.
Estruture SEMPRE a resposta assim:
1. **Definição simples** (1-2 frases acessíveis)
2. **Explicação detalhada** (parágrafos curtos)
3. **Exemplos práticos** (2-3 exemplos do cotidiano)
4. **Mapa mental em texto** (use indentação e setas)
5. **3 perguntas de fixação** com respostas (no final)
Use português claro e amigável.`
                    },
                    { role: 'user', content: topico }
                ]
            });
            return `📚 *StudyAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
