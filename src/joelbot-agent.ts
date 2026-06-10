import { Telegraf, Context } from 'telegraf';
import Groq from 'groq-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { startWebTerminal } from './web-terminal.js';

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

// ── Sanitizador de Markdown para o Telegram ─────────────────
// Converte Markdown comum (que a IA gera) pra MarkdownV2 válido do Telegram
function escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

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

bot.command('model', (ctx) => {
    ctx.reply('🧠 Modelo atual: `llama-3.3-70b-versatile`\n\n' +
        'Modelos disponíveis: llama-3.3-70b-versatile, llama-3.1-8b-instant');
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
            model: 'llama-3.3-70b-versatile',
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

        // ✅ FIX 1: Tenta enviar como Markdown; se der erro de parse, cai pro texto puro
        try {
            await ctx.reply(assistantMessage, { parse_mode: 'Markdown' });
        } catch (mdError) {
            console.warn('⚠️ Markdown falhou, enviando como texto puro');
            await ctx.reply(assistantMessage);
        }
    } catch (error: any) {
        // ✅ FIX 2: Log detalhado pra debug
        console.error('❌ Erro ao processar mensagem:');
        console.error('  userId:', userId);
        console.error('  message:', userMessage.slice(0, 100));
        console.error('  status:', error?.status ?? error?.response?.status);
        console.error('  code:', error?.code);
        console.error('  groqError:', error?.error?.error?.message);
        console.error('  full:', JSON.stringify(error?.error ?? error, null, 2));

        // ✅ FIX 3: Resposta específica baseada no tipo de erro
        const status = error?.status ?? error?.response?.status;
        if (status === 429) {
            ctx.reply('⏱️ Tô recebendo muitas mensagens agora. Espera uns segundos e tenta de novo!');
        } else if (status === 503) {
            ctx.reply('🔧 O modelo de IA tá sobrecarregado. Tenta de novo em alguns segundos.');
        } else if (status === 400) {
            ctx.reply('⚠️ Sua mensagem deu problema no processamento. Tenta reformular de outro jeito!');
            // Limpa memória do user pra evitar loop
            conversationMemory.delete(userId);
        } else {
            ctx.reply('❌ Desculpe, ocorreu um erro ao processar sua mensagem.');
        }
    }
});

// ── Inicialização do Bot ─────────────────────────────────────
startWebTerminal();
bot.launch();

console.log('🚀 ConectaClaw iniciado com sucesso!');
console.log('Bot aguardando mensagens...');

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));