/**
 * conectaclaw-agent.ts
 * Orquestrador principal do Conecta Claw🦞.
 *
 * v20.1 — correções:
 *  - Áudio: usa transcribeAudio (stream-based, compatível Node 18/20/22)
 *  - Imagem: Pollinations como padrão (grátis, sem token) + Replicate se configurado
 *  - Vídeo: Replicate (minimax/video-01) com polling e fallback
 *  - Integra de verdade o sistema de Agentes + Skills
 *  - Vision: analisa fotos via Llama 3.2 Vision (Groq)
 *  - Trata áudio (mp3, ogg, voice)
 */
import { Telegraf, Context } from 'telegraf';
// `InputFile` não é exportado oficialmente pelo telegraf v4; usamos `any` para os casts
// de fonte de arquivo (path/stream) que o replyWith* aceita.
import Groq from 'groq-sdk';
import Replicate from 'replicate';
import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { startWebTerminal, addLog } from './web-terminal.js';
import { startReminderManager } from './reminderManager.js';

// ── Agentes + Skills (sistema real) ─────────────────────────
import { agentRegistry, AgentContext, AgentResult } from './agents/Agent.js';
import './agents/index.js'; // popula o agentRegistry
import { registry as skillRegistry } from './skills/index.js';
import { transcribeAudio, synthesizeSpeech } from './agents/VoiceAgent.js';
import { analyzeImage } from './agents/VisionAgent.js';
import { VisionAgent } from './agents/VisionAgent.js';

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

// Diretório temporário dedicado (evita encher disco do app em produção)
const TMP_DIR = path.join(os.tmpdir(), 'conectaclaw');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ── Memória de conversa por usuário ─────────────────────────
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

// ── Helper: atualiza mensagem de status (uma única editável) ─
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
        },
        messageId: statusMsg?.message_id
    };
}

// ── Helper: envia arquivo (foto/vídeo/doc) com fallback de caption
async function sendSkillFile(ctx: Context, result: any): Promise<boolean> {
    if (!result || !result.file) return false;
    const filePath = result.file;
    const type = result.type;
    const caption = (result.text || '').substring(0, 1024);

    if (!fs.existsSync(filePath)) {
        addLog(`❌ Arquivo de skill não existe: ${filePath}`);
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
        addLog(`❌ Falha ao enviar arquivo (${type}): ${e.message}`);
        try { await ctx.replyWithDocument({ source: filePath } as any, { caption: caption.substring(0, 200) }); return true; }
        catch (e2: any) { addLog(`❌ Fallback doc também falhou: ${e2.message}`); return false; }
    }
}

// ── Executor de skills a partir de tags [SYSTEM_X: ...] ─────
async function executeSkillTags(tags: string[], ctx: Context, status: any): Promise<string | null> {
    if (!tags || tags.length === 0) return null;
    let lastText: string | null = null;

    for (const tag of tags) {
        const skill = await skillRegistry.selectBestSkill(tag);
        if (!skill) {
            addLog(`⚠️ Tag sem skill correspondente: ${tag.substring(0, 40)}`);
            continue;
        }
        addLog(`🎯 Skill: ${skill.name} ← ${tag.substring(0, 60)}`);

        try {
            const res = await skill.execute(tag, ctx);
            if (res == null) continue;

            // Resultado é objeto com arquivo? Envia como mídia
            if (typeof res === 'object' && 'file' in res && res.file) {
                await sendSkillFile(ctx, res);
                lastText = res.text || lastText;
            } else if (typeof res === 'string' && res.length > 0) {
                lastText = res;
            }
        } catch (e: any) {
            addLog(`❌ Erro na skill ${skill.name}: ${e.message}`);
            if (status?.update) await status.update(`❌ Erro em ${skill.name}: ${e.message.substring(0, 100)}`);
        }
    }

    return lastText;
}

// ── /start ──────────────────────────────────────────────────
bot.start((ctx) => {
    ctx.reply(
        '👋 Bem-vindo ao Conecta Claw🦞 v20.1!\n\n' +
        '🤖 *Posso te ajudar com:*\n' +
        '   • 💬 Texto (conversa normal)\n' +
        '   • 🎤 Áudio / voz (manda que eu transcrevo e respondo)\n' +
        '   • 🖼️ Foto (manda que eu descrevo/análise)\n' +
        '   • 🎨 /imagem <descrição> — gera imagem\n' +
        '   • 🎬 /video <descrição> — gera vídeo\n' +
        '   • 🔊 /voz <texto> — converto texto em áudio\n' +
        '   • 🌐 /site <url> — tiro print e extraio texto\n' +
        '   • 🧮 /calcular <expr> — cálculos\n' +
        '   • 🧠 /agentes — ver agentes disponíveis\n' +
        '   • 🗑️ /clear — limpa histórico'
    );
});

// ── /clear ──────────────────────────────────────────────────
bot.command('clear', (ctx) => {
    const userId = ctx.from?.id;
    if (userId) { conversationMemory.delete(userId); ctx.reply('✅ Histórico limpo!'); }
});

// ── /model — info do sistema ────────────────────────────────
bot.command('model', (ctx) => {
    const agentCount = agentRegistry.getAll().length;
    ctx.reply(
        `🧠 *Conecta Claw🦞 — Status*\n\n` +
        `LLM: \`llama-3.3-70b-versatile\` (Groq)\n` +
        `🎤 Áudio: \`whisper-large-v3\` (Groq)\n` +
        `🔊 TTS: Google TTS (pt-BR)\n` +
        `👁️ Visão: \`llama-3.2-90b-vision-preview\` (Groq)\n` +
        `🎨 Imagem: Pollinations (FLUX) + ${replicate ? 'Replicate (flux-schnell)' : 'Replicate (off)'}\n` +
        `🎬 Vídeo: ${replicate ? 'Replicate (minimax/video-01)' : 'Replicate (off)'}\n` +
        `🤖 Agentes: ${agentCount}\n\n` +
        `${replicate ? '✅' : '⚠️'} Replicate: ${replicate ? 'configurado' : 'não configurado — vídeo desabilitado'}`
    );
});

// ── /agentes — lista os agentes registrados ─────────────────
bot.command('agentes', (ctx) => {
    const all = agentRegistry.getAll();
    const byCategory: Record<string, string[]> = {};
    for (const a of all) {
        if (!byCategory[a.category]) byCategory[a.category] = [];
        byCategory[a.category].push(`• ${a.name} — ${a.description.substring(0, 60)}`);
    }
    let txt = `🤖 *${all.length} agentes registrados:*\n\n`;
    for (const [cat, list] of Object.entries(byCategory)) {
        txt += `*${cat.toUpperCase()}*\n${list.join('\n')}\n\n`;
    }
    ctx.reply(txt, { parse_mode: 'Markdown' }).catch(() => ctx.reply(txt));
});

// ── /imagem <prompt> ────────────────────────────────────────
bot.command('imagem', async (ctx) => {
    const prompt = ctx.message.text.replace(/^\/imagem\s*/i, '').trim();
    if (!prompt) {
        return ctx.reply('🎨 Uso: `/imagem <descrição>`\nEx: `/imagem gato astronauta`', { parse_mode: 'Markdown' });
    }

    const status = await createStatusUpdater(ctx, '🎨 Gerando imagem...');

    // ── Tentativa 1: Pollinations (grátis, sempre disponível) ─
    try {
        const seed = Math.floor(Math.random() * 999999);
        const encodedPrompt = encodeURIComponent(prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=flux&seed=${seed}`;

        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: { 'User-Agent': 'ConectaClaw/20.1' }
        });

        if (response.data && response.data.byteLength > 1000) {
            const outPath = path.join(TMP_DIR, `image_${Date.now()}.jpg`);
            fs.writeFileSync(outPath, Buffer.from(response.data));
            await status.delete();
            await ctx.replyWithPhoto(
                { source: outPath } as any,
                { caption: `🎨 ${prompt}\n_Modelo: FLUX (Pollinations)_` }
            );
            // Limpa o arquivo depois de enviar (telegram já tem)
            setTimeout(() => { try { fs.unlinkSync(outPath); } catch {} }, 60_000);
            return;
        }
        throw new Error('Pollinations retornou payload vazio');
    } catch (e1: any) {
        addLog(`⚠️ Pollinations falhou: ${e1.message?.substring(0, 80)}`);
        await status.update('⚠️ Pollinations falhou, tentando Replicate...');
    }

    // ── Tentativa 2: Replicate (se configurado) ────────────────
    if (replicate) {
        try {
            const output = await replicate.run(
                'black-forest-labs/flux-schnell',
                { input: { prompt, num_inference_steps: 4, aspect_ratio: '1:1', output_format: 'jpg', output_quality: 80 } }
            ) as any;
            const imageUrl = Array.isArray(output) ? output[0] : output;

            // Pode ser URL ou ReadableStream
            if (typeof imageUrl === 'string') {
                await status.delete();
                await ctx.replyWithPhoto(imageUrl, { caption: `🎨 ${prompt}\n_Modelo: flux-schnell (Replicate)_` });
                return;
            }
            if (imageUrl && typeof imageUrl === 'object' && typeof imageUrl.url === 'function') {
                const url = imageUrl.url();
                await status.delete();
                await ctx.replyWithPhoto(url, { caption: `🎨 ${prompt}\n_Modelo: flux-schnell (Replicate)_` });
                return;
            }
        } catch (e2: any) {
            addLog(`❌ Replicate imagem: ${e2.message?.substring(0, 80)}`);
        }
    }

    await status.delete();
    ctx.reply('❌ Não consegui gerar a imagem agora. Tenta de novo em alguns segundos.').catch(() => {});
});

// ── /video <prompt> ─────────────────────────────────────────
bot.command('video', async (ctx) => {
    const prompt = ctx.message.text.replace(/^\/video\s*/i, '').trim();
    if (!prompt) {
        return ctx.reply('🎬 Uso: `/video <descrição>`\nEx: `/video ondas do mar no pôr do sol`', { parse_mode: 'Markdown' });
    }
    if (!replicate) {
        return ctx.reply(
            '⚠️ *Vídeo requer REPLICATE_API_TOKEN.*\n\n' +
            '1. Crie conta em https://replicate.com\n' +
            '2. Gere um token em https://replicate.com/account/api-tokens\n' +
            '3. Adicione `REPLICATE_API_TOKEN=r8_...` no .env ou no Render\n' +
            '4. Reinicie o bot\n\n' +
            '_(Custa cerca de US$ 0,05 por vídeo de 5s)_'
        , { parse_mode: 'Markdown' }).catch(() => {});
    }

    const status = await createStatusUpdater(ctx, '🎬 Iniciando geração do vídeo...');
    const startTime = Date.now();
    let elapsed = 0;
    const updateTimer = setInterval(async () => {
        elapsed = Math.floor((Date.now() - startTime) / 1000);
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        await status.update(`🎬 Gerando vídeo... ${min}m ${sec}s\n_(costuma levar 1-3 min)_`);
    }, 5000);

    try {
        const output = await replicate.run(
            'minimax/video-01',
            { input: { prompt, duration: 5 } }
        ) as any;
        clearInterval(updateTimer);

        const videoUrl = Array.isArray(output) ? output[0] : output;
        const totalTime = Math.floor((Date.now() - startTime) / 1000);
        const finalUrl = (videoUrl && typeof videoUrl === 'object' && typeof videoUrl.url === 'function') ? videoUrl.url() : videoUrl;

        await status.delete();
        await ctx.replyWithVideo(finalUrl, {
            caption: `🎬 ${prompt}\n⏱️ Gerado em ${totalTime}s`,
            supports_streaming: true
        });
    } catch (e: any) {
        clearInterval(updateTimer);
        addLog(`❌ Vídeo erro: ${e.message?.substring(0, 200)}`);
        await status.delete();
        const msg = e.message?.includes('402') || e.message?.includes('credit')
            ? '❌ Conta Replicate sem créditos. Adicione saldo em replicate.com/account/billing'
            : `❌ Erro ao gerar vídeo: ${e.message?.substring(0, 200) || 'desconhecido'}`;
        ctx.reply(msg).catch(() => {});
    }
});

// ── /voz <texto> — TTS ─────────────────────────────────────
bot.command('voz', async (ctx) => {
    const text = ctx.message.text.replace(/^\/voz\s*/i, '').trim();
    if (!text) return ctx.reply('🔊 Uso: `/voz <texto>`\nEx: `/voz Olá, mundo!`', { parse_mode: 'Markdown' });

    const status = await createStatusUpdater(ctx, '🔊 Gerando áudio...');
    try {
        const audioPath = await synthesizeSpeech(text, 'pt-BR');
        if (!audioPath) {
            await status.delete();
            return ctx.reply('❌ Não consegui gerar o áudio agora. Tente novamente.');
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

// ── /site <url> — print + extração ──────────────────────────
bot.command('site', async (ctx) => {
    const text = ctx.message.text.replace(/^\/site\s*/i, '').trim();
    const urlMatch = text.match(/https?:\/\/\S+/);
    const url = urlMatch ? urlMatch[0] : text;
    if (!url) return ctx.reply('🌐 Uso: `/site <url>`\nEx: `/site https://exemplo.com`', { parse_mode: 'Markdown' });

    const status = await createStatusUpdater(ctx, '🌐 Acessando site...');
    try {
        const skill = await skillRegistry.selectBestSkill(`[SYSTEM_BROWSER: acao="screenshot", url="${url}"]`);
        if (!skill) {
            await status.delete();
            return ctx.reply('❌ BrowserSkill não disponível.');
        }
        const res = await skill.execute(`[SYSTEM_BROWSER: acao="screenshot", url="${url}"]`, ctx);
        if (typeof res === 'object' && res?.file) {
            await status.delete();
            await sendSkillFile(ctx, res);
        } else {
            await status.delete();
            ctx.reply(typeof res === 'string' ? res : '❌ Erro desconhecido.').catch(() => {});
        }
    } catch (e: any) {
        await status.delete();
        addLog(`❌ /site: ${e.message}`);
        ctx.reply('❌ Erro ao acessar o site. O servidor pode não ter Chrome instalado.').catch(() => {});
    }
});

// ── /calcular <expr> ────────────────────────────────────────
bot.command('calcular', async (ctx) => {
    const expr = ctx.message.text.replace(/^\/calcular\s*/i, '').trim();
    if (!expr) return ctx.reply('🔢 Uso: `/calcular <expressão>`\nEx: `/calcular 2+2*5`', { parse_mode: 'Markdown' });

    const status = await createStatusUpdater(ctx, '🔢 Calculando...');
    try {
        // Tenta eval seguro de expressões simples
        let calcResult: string | null = null;
        if (/^[\d\s+\-*/().,%^]+$/.test(expr)) {
            try {
                // eslint-disable-next-line no-new-func
                const r = Function(`"use strict"; return (${expr});`)();
                if (typeof r === 'number' && isFinite(r)) calcResult = String(r);
            } catch {}
        }

        const groq_ = groq;
        const chat = await groq_.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            temperature: 0,
            messages: [
                { role: 'system', content: 'Você é o MathAgent. Resolva o problema com precisão. Mostre o resultado em **negrito**.' },
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
        const photo = photos[photos.length - 1]; // maior resolução
        const tg: any = (ctx as any).telegram;
        const fileLink = await tg.getFileLink(photo.file_id);
        const dest = path.join(TMP_DIR, `img_${Date.now()}.jpg`);
        const dl = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(dest, Buffer.from(dl.data));

        const caption = ctx.message.caption || 'Descreva esta imagem em detalhes, em português.';
        const desc = await analyzeImage(dest, caption);
        await status.delete();
        ctx.reply(`👁️ *Análise da imagem:*\n\n${desc}`).catch(() => {});
        setTimeout(() => { try { fs.unlinkSync(dest); } catch {} }, 60_000);
    } catch (e: any) {
        await status.delete();
        addLog(`❌ photo handler: ${e.message}`);
        ctx.reply('❌ Erro ao analisar a imagem.').catch(() => {});
    }
});

// ── Handler de VOZ (transcrição + resposta) ─────────────────
async function handleAudioMessage(ctx: Context, fileId: string, mimeHint = 'audio/ogg') {
    const userId = ctx.from?.id;
    if (!userId) return;

    const memory = getConversationMemory(userId);
    const status = await createStatusUpdater(ctx, '🎤 Transcrevendo áudio...');

    try {
        // ── Download do áudio ────────────────────────────────────
        const tg: any = (ctx as any).telegram;
        const fileLink = await tg.getFileLink(fileId);
        const ext = mimeHint.includes('mp4') || mimeHint.includes('m4a') ? 'm4a' :
                    mimeHint.includes('mpeg') ? 'mp3' : 'ogg';
        const audioPath = path.join(TMP_DIR, `audio_${Date.now()}.${ext}`);
        const dl = await axios.get(fileLink.href, { responseType: 'arraybuffer', timeout: 60000 });
        fs.writeFileSync(audioPath, Buffer.from(dl.data));

        // ── Transcrição via Whisper (Groq) — usa stream, compatível Node 18+ ─
        const userText = (await transcribeAudio(audioPath)).trim() || '(não consegui entender o áudio)';
        await status.update(`🎤 _"${userText.substring(0, 100)}"_`);

        // ── LLM responde ─────────────────────────────────────────
        await ctx.sendChatAction('typing');
        memory.messages.push({ role: 'user', content: userText });
        if (memory.messages.length > MAX_MEMORY_MESSAGES) memory.messages = memory.messages.slice(-MAX_MEMORY_MESSAGES);

        const chat = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: memory.messages,
            max_tokens: 1024,
            temperature: 0.7
        });

        const assistantMessage = chat.choices[0]?.message?.content || 'Desculpe, não consegui responder.';
        memory.messages.push({ role: 'assistant', content: assistantMessage });
        memory.timestamp = Date.now();

        await status.delete();

        // Envia a transcrição
        await ctx.reply(`🎤 _"${userText}"_`, { parse_mode: 'Markdown' }).catch(() => {});

        // Envia a resposta
        try { await ctx.reply(assistantMessage, { parse_mode: 'Markdown' }); }
        catch { await ctx.reply(assistantMessage); }

        // Limpa arquivo
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

// ── Handler de TEXTO (rota via Agentes) ─────────────────────
bot.on('text', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const userMessage = ctx.message.text;
    const memory = getConversationMemory(userId);

    const status = await createStatusUpdater(ctx, '🤔 Pensando...');

    try {
        // ── Roteamento via AgentRegistry ─────────────────────────
        const agentCtx: AgentContext = {
            userId,
            userMessage,
            userName: ctx.from?.username || ctx.from?.first_name,
            history: memory.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            extra: {}
        };

        const agent = await agentRegistry.selectBestAgent(agentCtx);

        // Se um agente foi escolhido e não é o VisionAgent (que é só pra imagens)
        if (agent && !(agent instanceof VisionAgent)) {
            addLog(`🤖 Agente: ${agent.name}`);
            const result = await agent.execute(agentCtx, ctx);
            await status.delete();

            let replyText: string | null = null;
            let sentMedia = false;

            if (typeof result === 'string') {
                replyText = result;
            } else if (result) {
                if (result.text) replyText = result.text;
                if (result.file) {
                    sentMedia = await sendSkillFile(ctx, result);
                }
                // Se o agente retorna tags de skill, executa
                if (result.tags && result.tags.length > 0) {
                    const skillText = await executeSkillTags(result.tags, ctx, status);
                    if (skillText) replyText = replyText ? `${replyText}\n\n${skillText}` : skillText;
                    sentMedia = true;
                }
            }

            if (replyText) {
                try { await ctx.reply(replyText, { parse_mode: 'Markdown' }); }
                catch { await ctx.reply(replyText); }
            } else if (!sentMedia) {
                await ctx.reply('✅ Tarefa concluída!');
            }

            // Atualiza memória
            memory.messages.push({ role: 'user', content: userMessage });
            if (replyText) memory.messages.push({ role: 'assistant', content: replyText });
            if (memory.messages.length > MAX_MEMORY_MESSAGES) memory.messages = memory.messages.slice(-MAX_MEMORY_MESSAGES);
            memory.timestamp = Date.now();
            return;
        }

        // ── Fallback: LLM puro ──────────────────────────────────
        await ctx.sendChatAction('typing');
        memory.messages.push({ role: 'user', content: userMessage });
        if (memory.messages.length > MAX_MEMORY_MESSAGES) memory.messages = memory.messages.slice(-MAX_MEMORY_MESSAGES);

        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: memory.messages,
            max_tokens: 1024,
            temperature: 0.7
        });

        const assistantMessage = response.choices[0]?.message?.content || 'Desculpe, não consegui responder.';
        memory.messages.push({ role: 'assistant', content: assistantMessage });
        memory.timestamp = Date.now();

        await status.delete();
        try { await ctx.reply(assistantMessage, { parse_mode: 'Markdown' }); }
        catch { await ctx.reply(assistantMessage); }

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

// ── Inicialização ───────────────────────────────────────────
startWebTerminal();
startReminderManager(bot);
bot.launch();

console.log('🚀 Conecta Claw🦞 v20.1 iniciado!');
console.log(`🤖 Agentes: ${agentRegistry.getAll().length}`);
console.log(`🛠️ Skills: ${skillRegistry.getAll().length}`);
console.log(`🎨 Replicate: ${replicate ? '✅' : '❌ (vídeo desabilitado)'}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
