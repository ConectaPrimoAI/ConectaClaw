/**
 * conectaclaw-agent.ts v22.0
 * Orquestrador principal — integra /conectar (Hub OAuth2) + lógica de intenção, áudio, vídeo e imagem
 */
import { Telegraf, Context } from 'telegraf';
import Groq from 'groq-sdk';
import Replicate from 'replicate';
import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { startWebTerminal, addLog, app as expressApp } from './web-terminal.js';
import { startReminderManager } from './reminderManager.js';
import { agentRegistry } from './agents/Agent.js';
import './agents/index.js';
import { registry as skillRegistry } from './skills/index.js';
import { transcribeAudio, synthesizeSpeech } from './agents/VoiceAgent.js';
import { analyzeImage } from './agents/VisionAgent.js';
import { handleConectar, handleConnectGoogle, handleDisconnectGoogle, handleIntegrationsHelp } from './commands/connect.js';
import { executeIntegration } from './integrations/hub.js';
import { resolveGoogleState, exchangeGoogleCode, generateGoogleAuthUrl } from './integrations/oauth/google.js';
import { saveConnection } from './db/user-connections.js';

// ── Validação ───────────────────────────────────────────────
if (!process.env.TELEGRAM_TOKEN || !process.env.GROQ_API_KEY) {
    console.error('❌ TELEGRAM_TOKEN ou GROQ_API_KEY não configurados.');
    process.exit(1);
}

export const bot: Telegraf<Context> = new Telegraf(process.env.TELEGRAM_TOKEN);
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const replicate = process.env.REPLICATE_API_TOKEN
    ? new Replicate({ auth: process.env.REPLICATE_API_TOKEN.trim() })
    : null;

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

// ── Enviar arquivo ─────────────────────────────────────────
async function sendSkillFile(ctx: Context, result: any): Promise<boolean> {
    if (!result || !result.file) return false;
    const filePath = result.file;
    const type = result.type;
    const caption = (result.text || '').substring(0, 1024);

    if (!fs.existsSync(filePath)) {
        addLog(`❌ Arquivo não existe: ${filePath}`);
        return false;
    }

    try {
        if (type === 'photo') {
            await ctx.replyWithPhoto({ source: filePath } as any, { caption });
        } else if (type === 'video') {
            await ctx.replyWithVideo({ source: filePath } as any, { caption, supports_streaming: true });
        } else if (type === 'voice') {
            await ctx.replyWithVoice({ source: filePath } as any, { caption });
        } else {
            await ctx.replyWithDocument({ source: filePath } as any, { caption });
        }
        return true;
    } catch (e: any) {
        addLog(`❌ Erro ao enviar arquivo (${type}): ${e.message}`);
        return false;
    }
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
            temperature: 0.7
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

// ── /start ──────────────────────────────────────────────────
bot.start((ctx) => {
    ctx.reply(
        '👋 Bem-vindo ao Conecta Claw🦞!\n\n' +
        '🤖 *Posso te ajudar com:*\n' +
        '   • 💬 Texto\n' +
        '   • 🎤 Áudio / voz\n' +
        '   • 🖼️ Foto (análise com visão)\n' +
        '   • 🎨 Imagem — Gero imagens profissionais!\n' +
        '   • 🎬 Video — Gero vídeos surreais\n\n' +
        '🔌 *Integrações:*\n' +
        '   • /conectar — Gmail, Drive, Calendar\n\n' +
        '   • 🗑️ /clear — limpa minha memória',
        { parse_mode: 'Markdown' }
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

// ── /conectar ────────────────────────────────────────────────
bot.command('conectar', (ctx) => handleConectar(ctx));

// ── Callback Queries (botões inline) ────────────────────────
bot.action('connect_google',      (ctx) => handleConnectGoogle(ctx));
bot.action('disconnect_google',   (ctx) => handleDisconnectGoogle(ctx));
bot.action('integrations_help',   (ctx) => handleIntegrationsHelp(ctx));

// ── /model — info ───────────────────────────────────────────
bot.command('model', (ctx) => {
    ctx.reply(
        `🧠 *Conecta Claw🦞 — Status*\n\n` +
        `LLM: \`llama-3.3-70b-versatile\` (Groq)\n` +
        `🎤 Áudio: \`whisper-large-v3\` (Groq)\n` +
        `🔊 TTS: Replicate (Kokoro) + Google (fallback)\n` +
        `👁️ Visão: \`llama-3.2-90b-vision-preview\` (Groq)\n` +
        `🎨 Imagem: Pollinations (FLUX) + Replicate\n` +
        `🎬 Vídeo: ${replicate ? 'Replicate (minimax/video-01)' : 'Desabilitado'}\n\n` +
        `${replicate ? '✅' : '⚠️'} Replicate: ${replicate ? 'configurado' : 'não configurado'}`
    );
});

// ── /imagem <prompt> ────────────────────────────────────────
bot.command('imagem', async (ctx) => {
    const prompt = ctx.message.text.replace(/^\/imagem\s*/i, '').trim();
    if (!prompt) {
        return ctx.reply('🎨 Uso: `/imagem <descrição>`', { parse_mode: 'Markdown' });
    }

    const status = await createStatusUpdater(ctx, '🎨 Gerando imagem...');

    // Tentativa 1: Pollinations
    try {
        const seed = Math.floor(Math.random() * 999999);
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=flux&seed=${seed}`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: { 'User-Agent': 'ConectaClaw/21.0' }
        });

        if (response.data && response.data.byteLength > 1000) {
            const outPath = path.join(TMP_DIR, `image_${Date.now()}.jpg`);
            fs.writeFileSync(outPath, Buffer.from(response.data));
            await status.delete();
            await ctx.replyWithPhoto(
                { source: outPath } as any,
                { caption: `🎨 ${prompt}\n_FLUX (Pollinations)_` }
            );
            setTimeout(() => { try { fs.unlinkSync(outPath); } catch {} }, 60_000);
            return;
        }
    } catch (e1: any) {
        addLog(`⚠️ Pollinations falhou: ${e1.message?.substring(0, 80)}`);
    }

    // Tentativa 2: Replicate
    if (replicate) {
        try {
            await status.update('⚠️ Tentando Replicate...');
            const output = await replicate.run(
                'black-forest-labs/flux-schnell',
                { input: { prompt, num_inference_steps: 4, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 80 } }
            ) as any;
            const imageUrl = Array.isArray(output) ? output[0] : output;

            if (typeof imageUrl === 'string') {
                await status.delete();
                await ctx.replyWithPhoto(imageUrl, { caption: `🎨 ${prompt}\n_flux-schnell (Replicate)_` });
                return;
            }
        } catch (e2: any) {
            addLog(`❌ Replicate imagem: ${e2.message?.substring(0, 80)}`);
        }
    }

    await status.delete();
    ctx.reply('❌ Não consegui gerar a imagem agora.').catch(() => {});
});

// ── /video <prompt> ─────────────────────────────────────────
bot.command('video', async (ctx) => {
    const prompt = ctx.message.text.replace(/^\/video\s*/i, '').trim();
    if (!prompt) {
        return ctx.reply('🎬 Uso: `/video <descrição>`', { parse_mode: 'Markdown' });
    }
    if (!replicate) {
        return ctx.reply('⚠️ *Vídeo requer REPLICATE_API_TOKEN.*\nConfigure em .env ou variáveis de ambiente.', { parse_mode: 'Markdown' }).catch(() => {});
    }

    const status = await createStatusUpdater(ctx, '🎬 Iniciando geração de vídeo...');
    const startTime = Date.now();
    let elapsed = 0;
    const updateTimer = setInterval(async () => {
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        await status.update(`🎬 Gerando vídeo... ${min}m ${sec}s`);
    }, 5000);

    try {
        const output = await replicate.run(
            'minimax/video-01',
            { input: { prompt, duration: 5 } }
        ) as any;
        clearInterval(updateTimer);

        const videoUrl = Array.isArray(output) ? output[0] : output;
        const finalUrl = (videoUrl && typeof videoUrl === 'object' && typeof videoUrl.url === 'function') ? videoUrl.url() : videoUrl;

        await status.delete();
        await ctx.replyWithVideo(finalUrl, {
            caption: `🎬 ${prompt}`,
            supports_streaming: true
        });
    } catch (e: any) {
        clearInterval(updateTimer);
        addLog(`❌ Vídeo erro: ${e.message?.substring(0, 200)}`);
        await status.delete();
        ctx.reply(`❌ Erro ao gerar vídeo: ${e.message?.substring(0, 100) || 'desconhecido'}`).catch(() => {});
    }
});

// ── /voz <texto> — TTS ──────────────────────────────────────
bot.command('voz', async (ctx) => {
    const text = ctx.message.text.replace(/^\/voz\s*/i, '').trim();
    if (!text) return ctx.reply('🔊 Uso: `/voz <texto>`', { parse_mode: 'Markdown' });

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
        const dl = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 60000 });
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
        const dl = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(audioPath, Buffer.from(dl.data));

        const userText = (await transcribeAudio(audioPath)).trim() || '(não consegui entender o áudio)';
        await status.update(`🎤 _"${userText.substring(0, 100)}"_`);

        await ctx.sendChatAction('typing');
        const replyText = await handleIntent(ctx, userText);

        await status.update('🔊 Gerando resposta em áudio...');
        const audioReplyPath = await synthesizeSpeech(replyText, 'pt-BR');

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

// ── Handler de TEXTO (rota via intenção) ────────────────────
bot.on('text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const userMessage = ctx.message.text;

    const status = await createStatusUpdater(ctx, '🤔 Pensando...');

    try {
        // Tenta executar via integrações conectadas primeiro
        const integrationResult = await executeIntegration(userId, userMessage).catch(() => null);
        if (integrationResult) {
            await status.delete();
            try { await ctx.reply(integrationResult, { parse_mode: 'Markdown' }); }
            catch { await ctx.reply(integrationResult); }
            return;
        }

        const reply = await handleIntent(ctx, userMessage);
        await status.delete();
        
        try { await ctx.reply(reply, { parse_mode: 'Markdown' }); }
        catch { await ctx.reply(reply); }

    } catch (e: any) {
        await status.delete();
        addLog(`❌ text handler: ${e.message?.substring(0, 200)}`);
        const code = e?.status ?? e?.response?.status;
        if (code === 429) ctx.reply('⏱️ Muitas mensagens. Espera uns segundos!').catch(() => {});
        else if (code === 503) ctx.reply('🔧 Modelo sobrecarregado. Tenta de novo.').catch(() => {});
        else if (code === 400) {
            ctx.reply('⚠️ Mensagem deu problema. Reformula!').catch(() => {});
            conversationMemory.delete(userId);
        }
        else ctx.reply('❌ Erro ao processar sua mensagem.').catch(() => {});
    }
});

// ── Rotas OAuth2 ─────────────────────────────────────────────
import * as pathModule from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname2 = pathModule.dirname(fileURLToPath(import.meta.url));

// Serve a página de integrações
expressApp.get('/conectar', (_req: any, res: any) => {
    res.sendFile(pathModule.join(__dirname2, '..', 'public', 'connect.html'));
});

// API: status de conexão do usuário
expressApp.get('/api/connections/status', (req: any, res: any) => {
    const token = req.query.token as string;
    // token aqui é o userId codificado em base64
    try {
        const userId = parseInt(Buffer.from(token, 'base64').toString('utf-8'));
        const { getConnectedProviders, getConnection } = require('./db/user-connections.js');
        const providers = getConnectedProviders(userId);
        const googleConn = getConnection(userId, 'google');
        res.json({ connected: providers, email: googleConn?.tokens?.email || '' });
    } catch { res.json({ connected: [], email: '' }); }
});

// API: gera URL de auth Google
expressApp.get('/api/auth/google/url', (req: any, res: any) => {
    const token = req.query.token as string;
    try {
        const userId = token ? parseInt(Buffer.from(token, 'base64').toString('utf-8')) : 0;
        if (!userId) return res.status(400).json({ error: 'Token inválido' });
        const url = generateGoogleAuthUrl(userId);
        res.json({ url });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Callback OAuth2 do Google
expressApp.get('/auth/google/callback', async (req: any, res: any) => {
    const { code, state, error } = req.query;
    if (error || !code || !state) {
        return res.redirect('/conectar?reason=auth_error');
    }
    try {
        const userId = resolveGoogleState(state as string);
        if (!userId) return res.redirect('/conectar?reason=state_expired');

        const tokens = await exchangeGoogleCode(code as string);
        saveConnection(userId, 'google', tokens);

        // Notifica o usuário no Telegram
        try {
            await bot.telegram.sendMessage(userId,
                `✅ *Google Workspace conectado!*\n\n` +
                `📧 Conta: ${tokens.email || 'conectada'}\n\n` +
                `Agora você pode dizer coisas como:\n` +
                `• _"Mostra meus últimos e-mails"_\n` +
                `• _"Cria um evento amanhã às 14h"_\n` +
                `• _"Busca o PDF do projeto no Drive"_ 🦞`,
                { parse_mode: 'Markdown' }
            );
        } catch { /* bot pode estar reiniciando */ }

        const email = encodeURIComponent(tokens.email || '');
        res.redirect(`/conectar?tool=google&email=${email}`);
    } catch (e: any) {
        addLog(`❌ OAuth callback erro: ${e.message}`);
        res.redirect('/conectar?reason=token_error');
    }
});

// ── Inicialização ───────────────────────────────────────────
startWebTerminal();
startReminderManager(bot);
bot.launch();

console.log('🚀 Conecta Claw🦞 v21.0 iniciado!');
console.log(`🎨 Replicate: ${replicate ? '✅ configurado' : '❌ desabilitado'}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
