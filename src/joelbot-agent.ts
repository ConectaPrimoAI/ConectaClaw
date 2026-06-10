import { Telegraf, Context } from 'telegraf';
import Groq from 'groq-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Validação de variáveis obrigatórias ────────────────────
if (!process.env.TELEGRAM_TOKEN || !process.env.GROQ_API_KEY) {
    console.error('❌ TELEGRAM_TOKEN ou GROQ_API_KEY não configurados.');
    process.exit(1);
}

export const bot: Telegraf<Context> = new Telegraf(process.env.TELEGRAM_TOKEN);
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Memória de Conversa (Armazenamento em Memória) ──────────
interface ConversationMemory {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    timestamp: number;
}

const conversationMemory = new Map<number, ConversationMemory>();
const MEMORY_TIMEOUT = 30 * 60 * 1000; // 30 minutos de inatividade

function getConversationMemory(userId: number): ConversationMemory {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, {
            messages: [],
            timestamp: Date.now()
        });
    }
    return conversationMemory.get(userId)!;
}

function clearOldMemories() {
    const now = Date.now();
    for (const [userId, memory] of conversationMemory.entries()) {
        if (now - memory.timestamp > MEMORY_TIMEOUT) {
            conversationMemory.delete(userId);
        }
    }
}

// Limpar memórias antigas a cada 5 minutos
setInterval(clearOldMemories, 5 * 60 * 1000);

// ── Handlers do Bot ──────────────────────────────────────────

bot.start((ctx) => {
    ctx.reply(
        '👋 Bem-vindo ao ConectaClaw!\n\n' +
        'Sou um assistente de IA pronto para ajudar. ' +
        'Envie mensagens de texto e manterei o contexto da nossa conversa.\n\n' +
        'Use /clear para limpar o histórico de conversa.'
    );
});

bot.command('clear', (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
        conversationMemory.delete(userId);
        ctx.reply('✅ Histórico de conversa limpo!');
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const userMessage = ctx.message.text;
    const memory = getConversationMemory(userId);

    try {
        // Mostrar indicador de digitação
        await ctx.sendChatAction('typing');

        // Adicionar mensagem do usuário ao histórico
        memory.messages.push({
            role: 'user',
            content: userMessage
        });

        // Manter apenas as últimas 10 mensagens (5 pares)
        if (memory.messages.length > 10) {
            memory.messages = memory.messages.slice(-10);
        }

        // Chamar API Groq com histórico
        const response = await groq.chat.completions.create({
            model: 'mixtral-8x7b-32768',
            messages: memory.messages,
            max_tokens: 1024,
            temperature: 0.7
        });

        const assistantMessage = response.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';

        // Adicionar resposta ao histórico
        memory.messages.push({
            role: 'assistant',
            content: assistantMessage
        });

        // Atualizar timestamp
        memory.timestamp = Date.now();

        // Enviar resposta ao usuário
        await ctx.reply(assistantMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        ctx.reply('❌ Desculpe, ocorreu um erro ao processar sua mensagem.');
    }
});

// ── Inicialização do Bot ─────────────────────────────────────
bot.launch();

console.log('🚀 ConectaClaw iniciado com sucesso!');
console.log('Bot aguardando mensagens...');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
