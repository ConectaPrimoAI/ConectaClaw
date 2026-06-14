/**
 * VoiceAgent.ts
 * Agente responsável por:
 *  - Transcrever áudios recebidos (Whisper via Groq)
 *  - Sintetizar respostas em áudio (Replicate TTS)
 *  - Manter histórico de mensagens em texto + áudio
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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

/** Sintetiza texto em MP3 via Replicate (Kokoro-82M) */
export async function synthesizeSpeech(text: string, lang: string = 'pt-BR'): Promise<string> {
    if (!text) return '';

    if (!process.env.REPLICATE_API_TOKEN) {
        addLog('⚠️ REPLICATE_API_TOKEN não configurado. Áudio desabilitado.');
        return '';
    }

    try {
        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
        const output = await replicate.run(
            'lucataco/kokoro-82m:dfdfc08348274bc84c1728f9906665046243cf20f8629f3f45230986e3926861',
            { input: { text, speed: 1, voice: 'am_michael' } }
        ) as any;

        const audioUrl = Array.isArray(output) ? output[0] : output;
        if (audioUrl && typeof audioUrl === 'string') {
            const outPath = path.join(TMP_DIR, `tts_replicate_${Date.now()}.mp3`);
            await downloadToFile(audioUrl, outPath);
            addLog(`🔊 TTS Replicate: ${text.length} chars → ${path.basename(outPath)}`);
            return outPath;
        }
        return '';
    } catch (e: any) {
        addLog(`⚠️ Replicate TTS falhou: ${e.message?.substring(0, 100)}`);
        return '';
    }
}

/** Retorna a duração estimada do texto falado (em segundos) */
export function estimateSpeechDuration(text: string): number {
    return Math.ceil(text.length / 14);
}

export class VoiceAgent implements Agent {
    name = 'VoiceAgent';
    description = 'Transcreve áudios via Whisper e responde com voz usando TTS Replicate (voz masculina).';
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

        if (!process.env.REPLICATE_API_TOKEN) {
            return '❌ Não consegui gerar o áudio agora. Verifique se REPLICATE_API_TOKEN está configurado.';
        }

        const audioPath = await synthesizeSpeech(texto, 'pt-BR');
        if (!audioPath) return '❌ Não consegui gerar o áudio agora. Verifique se REPLICATE_API_TOKEN está configurado.';
        
        return {
            text: `🔊 _"${texto.substring(0, 80)}"_`,
            file: { path: audioPath, type: 'voice' }
        };
    }
}
