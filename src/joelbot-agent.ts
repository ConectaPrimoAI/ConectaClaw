import { Telegraf, Context } from 'telegraf';
import Groq from 'groq-sdk';
import Replicate from 'replicate';
import { startWebTerminal } from './web-terminal.js';

// ── Validação ───────────────────────────────────────────────
if (!process.env.TELEGRAM_TOKEN || !process.env.GROQ_API_KEY) {
    console.error('❌ TELEGRAM_TOKEN ou GROQ_API_KEY não configurados.');
    process.exit(1);
}

export const bot: Telegraf<Context> = new Telegraf(process.env.TELEGRAM_TOKEN);
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const replicate = process.env.REPLICATE_API_TOKEN
    ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    : null;

// ── Memória ─────────────────────────────────────────────────
interface ConversationMemory {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    timestamp: number;
}

const conversationMemory = new Map<number, ConversationMemory>();
const MEMORY_TIMEOUT = 30 * 60 * 1000;

function getConversationMemory(userId: number): ConversationMemory {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, { messages: [], timestamp: Date.now() });
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

setInterval(clearOldMemories, 5 * 60 * 1000);

// ── Helper: atualiza mensagem de status a cada X segundos ──
// Retorna uma função que atualiza a mesma mensagem (não cria várias)
async function createStatusUpdater(ctx: Context, initialText: string) {
    const statusMsg = await ctx.reply(initialText);
    let lastUpdate = Date.now();
    let currentText = initialText;
    const UPDATE_INTERVAL = 30000; // 30 segundos

    return {
        update: async (newText: string) => {
            const now = Date.now();
            // Só atualiza se passou o intervalo E o texto mudou
            if (now - lastUpdate < UPDATE_INTERVAL) return false;
            if (newText === currentText) return false;
            try {
                await ctx.telegram.editMessageText(
                    ctx.chat!.id,
                    statusMsg.message_id,
                    undefined,
                    newText
                );
                currentText = newText;
                lastUpdate = now;
                return true;
            } catch (e) {
                // Ignora erro de "message not modified"
                return false;
            }
        },
        delete: async () => {
            try {
                await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id);
            } catch {}
        },
        messageId: statusMsg.message_id
    };
}

// ── Comandos básicos ───────────────────────────────────────

bot.start((ctx) => {
    ctx.reply(
        '👋 Bem-vindo ao ConectaClaw!\n\n' +
        '🤖 Posso te ajudar com:\n' +
        '   • Texto (conversa normal)\n' +
        '   • 🎤 Áudio (manda que eu transcrevo e respondo)\n' +
        '   • 🎨 /imagem <descrição> - Gera imagem\n' +
        '   • 🎬 /video <descrição> - Gera vídeo\n' +
        '   • 🧠 /model - Mostra o modelo em uso\n' +
        '   • 🗑️ /clear - Limpa histórico'
    );
});

bot.command('clear', (ctx) => {
    const userId = ctx.from?.id;
    if (userId) {
        conversationMemory.delete(userId);
        ctx.reply('✅ Histórico limpo!');
    }
});

bot.command('model', (ctx) => {
    ctx.reply('🧠 LLM: `llama-3.3-70b-versatile`\n' +
        '🎤 Áudio: `whisper-large-v3` (Groq)\n' +
        '🎨 Imagem: `flux-schnell`\n' +
        '🎬 Vídeo: `minimax-video-01`\n\n' +
        `${replicate ? '✅' : '❌'} Replicate configurado`);
});

// ── /imagem <prompt> ────────────────────────────────────────

bot.command('imagem', async (ctx) => {
    const prompt = ctx.message.text.replace(/^\/imagem\s*/i, '').trim();

    if (!prompt) {
        return ctx.reply('🎨 Uso: `/imagem <descrição>`\nEx: `/imagem gato astronauta`', { parse_mode: 'Markdown' });
    }

    if (!replicate) {
        return ctx.reply('⚠️ REPLICATE_API_TOKEN não configurado no Render.');
    }

    const status = await createStatusUpdater(ctx, '🎨 Gerando imagem...');

    try {
        const output = await replicate.run(
            'black-forest-labs/flux-schnell',
            {
                input: {
                    prompt: prompt,
                    num_inference_steps: 4,
                    aspect_ratio: '1:1',
                    output_format: 'jpg',
                    output_quality: 80
                }
            }
        ) as any;

        const imageUrl = Array.isArray(output) ? output[0] : output;
        await status.delete();
        await ctx.replyWithPhoto(imageUrl, { caption: `🎨 ${prompt}` });
    } catch (error: any) {
        console.error('❌ Erro imagem:', error?.message);
        await status.delete();
        ctx.reply('❌ Erro ao gerar imagem. Tenta de novo.');
    }
});

// ── /video <prompt> ─────────────────────────────────────────

bot.command('video', async (ctx) => {
    const prompt = ctx.message.text.replace(/^\/video\s*/i, '').trim();

    if (!prompt) {
        return ctx.reply('🎬 Uso: `/video <descrição>`\nEx: `/video ondas do mar no pôr do sol`', { parse_mode: 'Markdown' });
    }

    if (!replicate) {
        return ctx.reply('⚠️ REPLICATE_API_TOKEN não configurado no Render.');
    }

    // Mensagem inicial
    const status = await createStatusUpdater(ctx, '🎬 Iniciando geração do vídeo...');

    // Timer pra atualização periódica (a cada 30s)
    let elapsed = 0;
    const startTime = Date.now();
    const updateTimer = setInterval(async () => {
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        await status.update(`🎬 Gerando vídeo... ${elapsed}s decorridos\n_(costuma levar 60-180s)_`);
    }, 30000);

    try {
        const output = await replicate.run(
            'minimax/video-01',
            { input: { prompt: prompt } }
        ) as any;

        clearInterval(updateTimer);

        const videoUrl = Array.isArray(output) ? output[0] : output;
        const totalTime = Math.floor((Date.now() - startTime) / 1000);

        await status.delete();
        await ctx.replyWithVideo(videoUrl, {
            caption: `🎬 ${prompt}\n⏱️ Gerado em ${totalTime}s`
        });
    } catch (error: any) {
        clearInterval(updateTimer);
        console.error('❌ Erro vídeo:', error?.message);
        await status.delete();
        ctx.reply('❌ Erro ao gerar vídeo. Pode ter atingido limite do Replicate.');
    }
});

// ── Áudio de entrada (transcrição) ──────────────────────────

bot.on('voice', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const voice = ctx.message.voice;
    const memory = getConversationMemory(userId);
    const status = await createStatusUpdater(ctx, '🎤 Transcrevendo áudio...');

    try {
        // 1. Baixa o áudio
        const fileLink = await ctx.telegram.getFileLink(voice.file_id);
        const response = await fetch(fileLink.href);
        const audioBuffer = Buffer.from(await response.arrayBuffer());

        // 2. Transcreve com Whisper (Groq)
        const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });
        const transcription = await groq.audio.transcriptions.create({
            file: file,
            model: 'whisper-large-v3',
            language: 'pt',
            response_format: 'text'
        });

        const userText = transcription.text || '(não entendi o áudio)';

        await status.delete();
        await ctx.reply(`🎤 _"${userText}"_`, { parse_mode: 'Markdown' });

        // 3. Gera resposta com LLM
        await ctx.sendChatAction('typing');
        memory.messages.push({ role: 'user', content: userText });
        if (memory.messages.length > 10) {
            memory.messages = memory.messages.slice(-10);
        }

        const llmResponse = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: memory.messages,
            max_tokens: 1024,
            temperature: 0.7
        });

        const assistantMessage = llmResponse.choices[0]?.message?.content || 'Desculpe, não consegui responder.';
        memory.messages.push({ role: 'assistant', content: assistantMessage });
        memory.timestamp = Date.now();

        // 4. Envia resposta (só texto)
        try {
            await ctx.reply(assistantMessage, { parse_mode: 'Markdown' });
        } catch {
            await ctx.reply(assistantMessage);
        }

    } catch (error: any) {
        console.error('❌ Erro áudio:', error?.message);
        await status.delete();
        ctx.reply('❌ Erro ao processar áudio. Tenta de novo ou manda texto.');
    }
});

// Suporta áudio em outros formatos também
bot.on('audio', async (ctx) => {
    return bot.handleUpdate({ ...ctx.update, message: { ...ctx.message, voice: ctx.message.audio } as any });
});

// ── Texto ───────────────────────────────────────────────────

bot.on('text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const userMessage = ctx.message.text;
    const memory = getConversationMemory(userId);

    try {
        await ctx.sendChatAction('typing');

        memory.messages.push({ role: 'user', content: userMessage });
        if (memory.messages.length > 10) {
            memory.messages = memory.messages.slice(-10);
        }

        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: memory.messages,
            max_tokens: 1024,
            temperature: 0.7
        });

        const assistantMessage = response.choices[0]?.message?.content || 'Desculpe, não consegui responder.';

        memory.messages.push({ role: 'assistant', content: assistantMessage });
        memory.timestamp = Date.now();

        try {
            await ctx.reply(assistantMessage, { parse_mode: 'Markdown' });
        } catch {
            await ctx.reply(assistantMessage);
        }

    } catch (error: any) {
        console.error('❌ Erro:', error?.message);
        const status = error?.status ?? error?.response?.status;
        if (status === 429) ctx.reply('⏱️ Muitas mensagens. Espera uns segundos!');
        else if (status === 503) ctx.reply('🔧 Modelo sobrecarregado. Tenta de novo.');
        else if (status === 400) {
            ctx.reply('⚠️ Mensagem deu problema. Reformula!');
            conversationMemory.delete(userId);
        } else {
            ctx.reply('❌ Erro ao processar sua mensagem.');
        }
    }
});

// ── Inicialização ───────────────────────────────────────────
startWebTerminal();
bot.launch();

console.log('🚀 ConectaClaw iniciado com sucesso!');
console.log(`🎨 Replicate: ${replicate ? '✅' : '❌'}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));