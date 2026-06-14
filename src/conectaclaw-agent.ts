/**
 * conectaclaw-agent.ts v23.0
 * Orquestrador principal com lógica de intenção, áudio e integrações OAuth2
 */
import { Telegraf, Context } from 'telegraf';
import Groq from 'groq-sdk';
import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { startWebTerminal, addLog } from './web-terminal.js';
import { startReminderManager } from './reminderManager.js';
import { agentRegistry } from './agents/Agent.js';
import './agents/index.js';
import { transcribeAudio, synthesizeSpeech } from './agents/VoiceAgent.js';
import { analyzeImage } from './agents/VisionAgent.js';

// ── Integrações OAuth2 ─────────────────────────────────────
import { startWebApp } from './webapp/server.js';
import { handleConectar, handleIntegrationsStatus, handleDisconnect } from './commands/connect.js';
import { 
  handleEmailCommand, 
  handleReadEmailsCommand, 
  handleAgendaCommand, 
  handleArquivosCommand, 
  handleNotionCommand, 
  handleRepoCommand, 
  handleIssuesCommand 
} from './commands/integrations-commands.js';

// ── Validação ───────────────────────────────────────────────
if (!process.env.TELEGRAM_TOKEN || !process.env.GROQ_API_KEY) {
    console.error('❌ TELEGRAM_TOKEN ou GROQ_API_KEY não configurados.');
    process.exit(1);
}

export const bot: Telegraf<Context> = new Telegraf(process.env.TELEGRAM_TOKEN);
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const TMP_DIR = path.join(os.tmpdir(), 'conectaclaw');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Memória de conversa ─────────────────────────────────────
interface ConversationMemory {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    timestamp: number;
}
const conversationMemory = new Map<number, ConversationMemory>();
const MEMORY_TIMEOUT = 30 * 60 * 1000;
const MAX_MEMORY_MESSAGES = 12;

function getConversationMemory(userId: number): ConversationMemory {
    if (!conversationMemory.has(userId)) {
        conversationMemory.set(userId, { messages: [], timestamp: Date.now() });
    }
    return conversationMemory.get(userId)!;
}

function clearOldMemories() {
    const now = Date.now();
    for (const [userId, memory] of conversationMemory.entries()) {
        if (now - memory.timestamp > MEMORY_TIMEOUT) conversationMemory.delete(userId);
    }
}
setInterval(clearOldMemories, 5 * 60 * 1000);

// ── Atualizador de status ───────────────────────────────────
async function createStatusUpdater(ctx: Context, initialText: string) {
    let statusMsg: { message_id: number } | null = null;
    try { statusMsg = await ctx.reply(initialText); } catch {}
    let lastUpdate = Date.now();
    let currentText = initialText;
    const UPDATE_INTERVAL = 4000;

    return {
        update: async (newText: string) => {
            if (!statusMsg) return false;
            const now = Date.now();
            if (now - lastUpdate < UPDATE_INTERVAL) return false;
            if (newText === currentText) return false;
            try {
                await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, newText);
                currentText = newText;
                lastUpdate = now;
                return true;
            } catch { return false; }
        },
        delete: async () => {
            if (!statusMsg) return;
            try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch {}
        }
    };
}

// ── Lógica de Intenção com LLM ──────────────────────────────
const systemPrompt = `Você é o Conecta Claw🦞, um assistente brasileiro extremamente inteligente, prestativo e com personalidade humana.
Sua missão é ajudar o usuário da melhor forma possível.
Mantenha um tom amigável, direto e natural. Não use robotismos.
Respostas devem ser concisas mas informativas.`;

async function handleIntent(ctx: Context, text: string): Promise<string> {
    const userId = ctx.from!.id;
    const memory = getConversationMemory(userId);
    
    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                ...memory.messages,
                { role: "user", content: text }
            ],
            max_tokens: 1024,
            temperature: 0.7,
            stream: false
        });
        
        const reply = response.choices[0].message.content || '';
        memory.messages.push({ role: 'user', content: text });
        memory.messages.push({ role: 'assistant', content: reply });
        if (memory.messages.length > MAX_MEMORY_MESSAGES) {
            memory.messages = memory.messages.slice(-MAX_MEMORY_MESSAGES);
        }
        memory.timestamp = Date.now();
        
        return reply;
    } catch (e: any) {
        addLog(`❌ Intent error: ${e.message}`);
        return '❌ Desculpe, tive um problema ao processar sua mensagem.';
    }
}

// ═══════════════════════════════════════════════════════════
// COMANDOS DE INTEGRAÇÃO OAUTH2
// ═══════════════════════════════════════════════════════════

bot.command('conectar', async (ctx) => {
    try {
        await handleConectar(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /conectar: ${error.message}`);
        await ctx.reply('❌ Erro ao abrir painel de conectores. Tente novamente.');
    }
});

bot.command('integracoes', async (ctx) => {
    try {
        await handleIntegrationsStatus(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /integracoes: ${error.message}`);
        await ctx.reply('❌ Erro ao verificar integrações.');
    }
});

bot.command('desconectar', async (ctx) => {
    try {
        await handleDisconnect(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /desconectar: ${error.message}`);
        await ctx.reply('❌ Erro ao desconectar.');
    }
});

bot.command('email', async (ctx) => {
    try {
        await handleEmailCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /email: ${error.message}`);
        await ctx.reply('❌ Erro ao enviar e-mail.');
    }
});

bot.command('emails', async (ctx) => {
    try {
        await handleReadEmailsCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /emails: ${error.message}`);
        await ctx.reply('❌ Erro ao ler e-emails.');
    }
});

bot.command('agenda', async (ctx) => {
    try {
        await handleAgendaCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro na /agenda: ${error.message}`);
        await ctx.reply('❌ Erro ao verificar agenda.');
    }
});

bot.command('arquivos', async (ctx) => {
    try {
        await handleArquivosCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /arquivos: ${error.message}`);
        await ctx.reply('❌ Erro ao listar arquivos.');
    }
});

bot.command('notion', async (ctx) => {
    try {
        await handleNotionCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /notion: ${error.message}`);
        await ctx.reply('❌ Erro ao acessar Notion.');
    }
});

bot.command('repo', async (ctx) => {
    try {
        await handleRepoCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /repo: ${error.message}`);
        await ctx.reply('❌ Erro ao listar repositórios.');
    }
});

bot.command('issues', async (ctx) => {
    try {
        await handleIssuesCommand(ctx);
    } catch (error: any) {
        addLog(`❌ Erro no /issues: ${error.message}`);
        await ctx.reply('❌ Erro ao listar issues.');
    }
});

// ═══════════════════════════════════════════════════════════
// COMANDOS ORIGINAIS
// ═══════════════════════════════════════════════════════════

// ── /start ──────────────────────────────────────────────────
bot.start((ctx) => {
    ctx.reply(
        '👋 Bem-vindo ao Conecta Claw🦞!\n\n' +
        '🤖 *Posso te ajudar com:*\n' +
        '   • 💬 Texto\n' +
        '   • 🎤 Áudio / voz \n' +
        '   • 🖼️ Foto (análise com visão)\n' +
        '   • 🔌 /conectar — Conecte Gmail, Drive, Notion, GitHub\n' +
        '   • 📧 /email — Enviar e-mails\n' +
        '   • 📅 /agenda — Ver sua agenda\n' +
        '   • 🐙 /repo — Repositórios do GitHub\n' +
        '   • 🗑️ /clear — limpa minha memória'
    );
});

// ── /clear ──────────────────────────────────────────────────
bot.command('clear', (ctx) => {
    const userId = ctx.from?.id;
    if (userId) { 
        conversationMemory.delete(userId); 
        ctx.reply('✅ memória limpa!'); 
    }
});

// ── /model — info ───────────────────────────────────────────
bot.command('model', (ctx) => {
    const replicateToken = process.env.REPLICATE_API_TOKEN ? '✅ Configurado' : '⚠️ Não configurado';
    ctx.reply(
        `🧠 *Conecta Claw🦞 — Status*\n\n` +
        `LLM: \`llama-3.3-70b-versatile\` (Groq)\n` +
        `🎤 Áudio: \`whisper-large-v3\` (Groq)\n` +
        `🔊 TTS: Replicate (Kokoro) — voz masculina\n` +
        `👁️ Visão: \`llama-3.2-90b-vision-preview\` (Groq)\n` +
        `🔌 Integrações: Gmail, Drive, Calendar, Sheets, Notion, GitHub\n\n` +
        `⚙️ *Configuração:*\n` +
        `Replicate: ${replicateToken}\n` +
        `🎨 Imagem: ${process.env.REPLICATE_API_TOKEN ? 'Habilitada' : 'Desabilitada'}\n` +
        `🎬 Vídeo: ${process.env.REPLICATE_API_TOKEN ? 'Habilitado' : 'Desabilitado'}`
    );
});

// ── /voz <texto> — TTS ──────────────────────────────────────
bot.command('voz', async (ctx) => {
    const text = ctx.message.text.replace(/^\/voz\s*/i, '').trim();
    if (!text) return ctx.reply('🔊 Uso: `/voz <texto>`', { parse_mode: 'Markdown' });

    if (!process.env.REPLICATE_API_TOKEN) {
        return ctx.reply('⚠️ Replicate não configurado. Não consigo gerar áudio no momento.');
    }

    const status = await createStatusUpdater(ctx, '🔊 Gerando áudio...');
    try {
        const audioPath = await synthesizeSpeech(text, 'pt-BR');
        if (!audioPath) {
            await status.delete();
            return ctx.reply('❌ Não consegui gerar o áudio agora.');
        }
        await status.delete();
        await ctx.replyWithVoice({ source: audioPath } as any, { caption: `🔊 _"${text.substring(0, 80)}"_` });
        setTimeout(() => { try { fs.unlinkSync(audioPath); } catch {} }, 60_000);
    } catch (e: any) {
        await status.delete();
        addLog(`❌ /voz: ${e.message}`);
        ctx.reply('❌ Erro ao gerar voz.').catch(() => {});
    }
});

// ── /calcular <expr> ────────────────────────────────────────
bot.command('calcular', async (ctx) => {
    const expr = ctx.message.text.replace(/^\/calcular\s*/i, '').trim();
    if (!expr) return ctx.reply('🔢 Uso: `/calcular <expressão>`', { parse_mode: 'Markdown' });

    const status = await createStatusUpdater(ctx, '🔢 Calculando...');
    try {
        const chat = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            temperature: 0,
            messages: [
                { role: 'system', content: 'Você é o MathAgent. Resolva com precisão. Mostre o resultado em **negrito**.' },
                { role: 'user', content: expr }
            ]
        });
        const ans = chat.choices[0]?.message?.content || '';
        await status.delete();
        ctx.reply(`🔢 *Resultado:*\n\n${ans}`).catch(() => {});
    } catch (e: any) {
        await status.delete();
        addLog(`❌ /calcular: ${e.message}`);
        ctx.reply('❌ Erro ao calcular.').catch(() => {});
    }
});

// ── Handler de FOTO (vision) ───────────────────────────────
bot.on('photo', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const status = await createStatusUpdater(ctx, '👁️ Analisando imagem...');
    try {
        const photos = (ctx.message as any).photo;
        const photo = photos[photos.length - 1];
        const tg: any = (ctx as any).telegram;
        const fileLink = await tg.getFileLink(photo.file_id);
        const dest = path.join(TMP_DIR, `img_${Date.now()}.jpg`);
        const dl = await axios.get(fileLink.href || fileLink, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(dest, Buffer.from(dl.data));

        const caption = ctx.message.caption || 'Descreva esta imagem em detalhes, em português.';
        const desc = await analyzeImage(dest, caption);
        await status.delete();
        ctx.reply(`👁️ *Análise:*\n\n${desc}`).catch(() => {});
        setTimeout(() => { try { fs.unlinkSync(dest); } catch {} }, 60_000);
    } catch (e: any) {
        await status.delete();
        addLog(`❌ photo handler: ${e.message}`);
        ctx.reply('❌ Erro ao analisar a imagem.').catch(() => {});
    }
});

// ── Handler de VOZ (transcrição + resposta em áudio) ────────
async function handleAudioMessage(ctx: Context, fileId: string, mimeHint = 'audio/ogg') {
    const userId = ctx.from?.id;
    if (!userId) return;

    const status = await createStatusUpdater(ctx, '🎤 Transcrevendo áudio...');

    try {
        const tg: any = (ctx as any).telegram;
        const fileLink = await tg.getFileLink(fileId);
        const ext = mimeHint.includes('mp4') || mimeHint.includes('m4a') ? 'm4a' :
                    mimeHint.includes('mpeg') ? 'mp3' : 'ogg';
        const audioPath = path.join(TMP_DIR, `audio_${Date.now()}.${ext}`);
        const dl = await axios.get(fileLink.href || fileLink, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(audioPath, Buffer.from(dl.data));

        const userText = (await transcribeAudio(audioPath)).trim() || '(não consegui entender o áudio)';
        await status.update(`🎤 _"${userText.substring(0, 100)}"_`);

        await ctx.sendChatAction('typing');
        const replyText = await handleIntent(ctx, userText);

        let audioReplyPath = '';
        if (process.env.REPLICATE_API_TOKEN) {
            await status.update('🔊 Gerando resposta em áudio...');
            audioReplyPath = await synthesizeSpeech(replyText, 'pt-BR');
        }

        await status.delete();
        await ctx.reply(`🎤 _"${userText}"_`, { parse_mode: 'Markdown' }).catch(() => {});
        
        if (audioReplyPath) {
            await ctx.replyWithVoice({ source: audioReplyPath } as any, { caption: '🔊 Resposta em áudio' });
            setTimeout(() => { try { fs.unlinkSync(audioReplyPath); } catch {} }, 60_000);
        }
        
        try { await ctx.reply(replyText, { parse_mode: 'Markdown' }); }
        catch { await ctx.reply(replyText); }

        setTimeout(() => { try { fs.unlinkSync(audioPath); } catch {} }, 30_000);
    } catch (e: any) {
        await status.delete();
        addLog(`❌ Áudio erro: ${e.message}`);
        ctx.reply(`❌ Erro ao processar áudio: ${e.message?.substring(0, 100) || 'desconhecido'}`).catch(() => {});
    }
}

bot.on('voice', async (ctx) => {
    if (!ctx.message.voice) return;
    await handleAudioMessage(ctx, ctx.message.voice.file_id, 'audio/ogg');
});

bot.on('audio', async (ctx) => {
    if (!ctx.message.audio) return;
    await handleAudioMessage(ctx, ctx.message.audio.file_id, ctx.message.audio.mime_type || 'audio/mpeg');
});

// ── Handler de TEXTO (inteligente com detecção de intenção) ─
import { detectIntent, executeIntent } from './intent-detector.js';

bot.on('text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const userMessage = ctx.message.text;

    // Ignorar comandos
    if (userMessage.startsWith('/')) return;

    try {
        await ctx.sendChatAction('typing');
        
        // 1. Tentar detectar intenção
        const intent = await detectIntent(userId, userMessage);
        
        if (intent) {
            // Tem intenção → executar ação
            console.log(`🎯 Intenção detectada: ${intent.intent}`, intent.params);
            const result = await executeIntent(ctx, intent);
            
            try { await ctx.reply(result, { parse_mode: 'Markdown' }); }
            catch { await ctx.reply(result); }
            return;
        }
        
        // 2. Sem intenção → conversa normal com IA
        const reply = await handleIntent(ctx, userMessage);
        
        try { await ctx.reply(reply, { parse_mode: 'Markdown' }); }
        catch { await ctx.reply(reply); }

    } catch (e: any) {
        addLog(`❌ text handler: ${e.message?.substring(0, 200)}`);
        ctx.reply('❌ Erro ao processar sua mensagem.').catch(() => {});
    }
});

// ═══════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

// Iniciar WebApp (servidor Express para OAuth callbacks e Painel)
import { app as webApp } from './webapp/server.js';
startWebApp();

// Montar o Web Terminal no mesmo servidor para evitar conflito de portas no Render
startWebTerminal(webApp);

// Iniciar serviços originais
startReminderManager(bot);

// Launch bot
bot.launch();

console.log('🚀 Conecta Claw🦞 v23.0 iniciado!');
console.log('✅ Bot Telegram online');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
