/**
 * VoiceAgent.ts
 * Agente responsável por:
 *  - Transcrever áudios recebidos (Whisper via Groq)
 *  - Sintetizar respostas em áudio (Replicate TTS com fallback Google)
 *  - Manter histórico de mensagens em texto + áudio
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import googleTTS from 'google-tts-api';
import axios from 'axios';
import Groq from 'groq-sdk';
import Replicate from 'replicate';
import { addLog } from '../web-terminal.js';

const TMP_DIR = path.join(os.tmpdir(), 'conectaclaw-voice');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

/** Faz download de uma URL para um arquivo local */
async function downloadToFile(url: string, dest: string): Promise<void> {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(dest, Buffer.from(res.data));
}

/** Converte OGG/Opus do Telegram para um Buffer */
async function getTelegramFile(ctx: Context, fileId: string): Promise<string> {
    const tg = (ctx as any).telegram;
    const fileLink = await tg.getFileLink(fileId);
    const dest = path.join(TMP_DIR, `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.ogg`);
    await downloadToFile(fileLink, dest);
    return dest;
}

/** Transcreve áudio via Whisper (Groq) */
export async function transcribeAudio(filePath: string): Promise<string> {
    try {
        const groq = getGroq();
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-large-v3',
            language: 'pt',
            response_format: 'text'
        });
        return typeof transcription === 'string' ? transcription : (transcription as any).text || '';
    } catch (e: any) {
        addLog(`❌ Whisper erro: ${e.message}`);
        return '';
    }
}

/** Sintetiza texto em MP3 via Replicate (Kokoro-82M) com fallback Google TTS */
export async function synthesizeSpeech(text: string, lang: string = 'pt-BR'): Promise<string> {
    if (!text) return '';

    // ── Tentativa 1: Replicate (Kokoro-82M de alta qualidade) ─
    if (process.env.REPLICATE_API_TOKEN) {
        try {
            const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
            const output = await replicate.run(
                'lucataco/kokoro-82m:dfdfc08348274bc84c1728f9906665046243cf20f8629f3f45230986e3926861',
                { input: { text, speed: 1, voice: 'af_heart' } }
            ) as any;

            const audioUrl = Array.isArray(output) ? output[0] : output;
            if (audioUrl && typeof audioUrl === 'string') {
                const outPath = path.join(TMP_DIR, `tts_replicate_${Date.now()}.mp3`);
                await downloadToFile(audioUrl, outPath);
                addLog(`🔊 TTS Replicate: ${text.length} chars → ${path.basename(outPath)}`);
                return outPath;
            }
        } catch (e: any) {
            addLog(`⚠️ Replicate TTS falhou: ${e.message?.substring(0, 100)}`);
        }
    }

    // ── Tentativa 2: Google TTS (fallback) ─────────────────────
    try {
        const maxLen = 100;
        const chunks: string[] = [];
        let restante = text;

        while (restante.length > 0) {
            if (restante.length <= maxLen) {
                chunks.push(restante);
                break;
            }

            // Tenta quebrar em pontuação
            const trecho = restante.substring(0, maxLen);
            const ultimoPonto = Math.max(
                trecho.lastIndexOf('. '),
                trecho.lastIndexOf('! '),
                trecho.lastIndexOf('? '),
                trecho.lastIndexOf(', '),
                trecho.lastIndexOf(' ')
            );
            const corte = ultimoPonto > 50 ? ultimoPonto + 1 : maxLen;
            chunks.push(restante.substring(0, corte).trim());
            restante = restante.substring(corte).trim();
        }

        const buffers: Buffer[] = [];
        for (const c of chunks) {
            const url = googleTTS.getAudioUrl(c, {
                lang,
                slow: false,
                host: 'https://translate.google.com'
            });
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
            buffers.push(Buffer.from(res.data));
        }

        const outPath = path.join(TMP_DIR, `tts_${Date.now()}.mp3`);
        fs.writeFileSync(outPath, Buffer.concat(buffers));
        addLog(`🔊 TTS Google: ${text.length} chars → ${path.basename(outPath)}`);
        return outPath;
    } catch (e: any) {
        addLog(`❌ Google TTS erro: ${e.message}`);
        return '';
    }
}

/** Retorna a duração estimada do texto falado (em segundos) */
export function estimateSpeechDuration(text: string): number {
    // ~ 14 chars/segundo em PT-BR velocidade normal
    return Math.ceil(text.length / 14);
}

export class VoiceAgent implements Agent {
    name = 'VoiceAgent';
    description = 'Transcreve áudios via Whisper e responde com voz usando TTS.';
    keywords = ['falar', 'voz', 'áudio', 'audio', 'fala', 'diz', 'fale', 'responde em áudio', 'responder em audio', 'manda audio', 'manda áudio', 'conversar por voz'];
    category = 'media' as const;
    priority = 8;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/voz') || l.startsWith('/falar') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, tg: Context): Promise<AgentResult | string | null> {
        const texto = ctx.userMessage
            .replace(/^\/(voz|falar)\s*/i, '')
            .trim();

        if (!texto) {
            return '🔊 Diga o que você quer que eu fale. Ex: `/voz Olá, mundo!`';
        }

        // Gera TTS
        const audioPath = await synthesizeSpeech(texto, 'pt-BR');
        if (!audioPath) return '❌ Não consegui gerar o áudio agora. Tente novamente.';
        
        return {
            text: `🔊 _"${texto.substring(0, 80)}"_`,
            file: { path: audioPath, type: 'voice' }
        };
    }
}
