/**
 * VisionAgent.ts
 * Agente que analisa imagens enviadas pelo usuário.
 * Usa Llama 3.2 Vision (via Groq) para descrever e responder.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';
import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { addLog } from '../web-terminal.js';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

const TMP_DIR = path.join(os.tmpdir(), 'joelbot-vision');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/** Faz download da imagem vinda do Telegram */
async function downloadTelegramImage(ctx: Context, fileId: string): Promise<string> {
    const tg: any = (ctx as any).telegram;
    const fileLink = await tg.getFileLink(fileId);
    const dest = path.join(TMP_DIR, `img_${Date.now()}.jpg`);
    const res = await axios.get(fileLink, { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(dest, Buffer.from(res.data));
    return dest;
}

/** Converte arquivo local para base64 */
function toBase64(filePath: string): string {
    return fs.readFileSync(filePath).toString('base64');
}

/** Detecta MIME type básico */
function detectMime(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
}

export async function analyzeImage(imagePath: string, prompt = 'Descreva esta imagem em detalhes em português.'): Promise<string> {
    try {
        const groq = getGroq();
        const b64 = toBase64(imagePath);
        const dataUrl = `data:${detectMime(imagePath)};base64,${b64}`;

        const chat = await groq.chat.completions.create({
            model: 'llama-3.2-90b-vision-preview',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ]
            }],
            max_tokens: 1024,
            temperature: 0.3
        });

        return chat.choices[0]?.message?.content || 'Não consegui analisar a imagem.';
    } catch (e: any) {
        addLog(`❌ Vision erro: ${e.message}`);
        return `❌ Erro ao analisar imagem: ${e.message}`;
    }
}

export class VisionAgent implements Agent {
    name = 'VisionAgent';
    description = 'Analisa imagens enviadas pelo usuário usando Llama 3.2 Vision.';
    keywords = ['imagem', 'foto', 'figura', 'olha isso', 'o que tem', 'o que é isso', 'descreve', 'analisa imagem', 'analisar foto', 'vê isso', 've isso'];
    category = 'media' as const;

    canHandle(ctx: AgentContext): boolean {
        // VisionAgent é ativado quando há imagem anexada (extra flag setada pelo router)
        return ctx.extra?.hasImage === true;
    }

    async execute(ctx: AgentContext, tg: Context): Promise<AgentResult | string | null> {
        // Implementação real está no joelbot-agent (porque precisa do file_id do Telegram)
        return null;
    }

    /** Método estático para o router chamar quando há imagem */
    static async analyzeFromTelegram(ctx: Context, prompt?: string): Promise<string> {
        try {
            // Pega o maior photo disponível
            const photos = (ctx.message as any)?.photo;
            if (!photos || photos.length === 0) return '❌ Nenhuma imagem encontrada na mensagem.';

            const photo = photos[photos.length - 1]; // maior resolução
            const imagePath = await downloadTelegramImage(ctx, photo.file_id);

            const pergunta = prompt || 'Descreva esta imagem em detalhes, em português, identificando objetos, pessoas, texto visível e contexto.';

            addLog(`👁️ Vision: analisando ${path.basename(imagePath)}`);
            return await analyzeImage(imagePath, pergunta);
        } catch (e: any) {
            addLog(`❌ VisionAgent: ${e.message}`);
            return `❌ Erro ao processar imagem: ${e.message}`;
        }
    }
}
