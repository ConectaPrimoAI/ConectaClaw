import { Skill } from './Skill.js';
import { Context } from 'telegraf';
import axios from 'axios';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addLog } from '../web-terminal.js';

export class VideoSkill implements Skill {
    name = 'VideoSkill';
    description = 'Gera vídeos com Replicate (minimax/video-01). Envia atualizações de progresso.';

    canHandle(i: string): boolean { return i.includes('[SYSTEM_VIDEO:'); }

    async execute(params: string, ctx: Context): Promise<string | { text: string; file?: string; type?: 'video' }> {
        const m = params.match(/\[SYSTEM_VIDEO:\s*prompt="([\s\S]+?)"\]/i);
        if (!m) return '';

        const prompt = m[1].trim();
        const token  = process.env.REPLICATE_API_TOKEN?.trim();

        if (!token) {
            return (
                `🎬 *Geração de Vídeo*\n\n` +
                `Configure \`REPLICATE_API_TOKEN\` no Render.\n` +
                `Crie sua chave em: replicate.com\n\n` +
                `Prompt recebido: _"${prompt}"_`
            );
        }

        // Aviso imediato ao usuário
        await safeSend(ctx, `🎬 *Iniciando geração de vídeo...*\n\n📝 _"${prompt.substring(0, 100)}"_\n\n⏳ Vídeos levam 2–5 minutos. Vou te atualizando!`);

        addLog(`🎬 Video: criando predição para "${prompt.substring(0, 50)}"`);

        try {
            // ── POST — cria predição SEM Prefer:wait (vídeo demora minutos) ──
            const createRes = await axios.post(
                'https://api.replicate.com/v1/models/minimax/video-01/predictions',
                { input: { prompt, duration: 5, aspect_ratio: '16:9' } },
                {
                    headers: {
                        Authorization: `Token ${token}`,
                        'Content-Type': 'application/json'
                        // NÃO usar Prefer:wait — cria conexão que expira antes do vídeo ficar pronto
                    },
                    timeout: 15000
                }
            );

            const predId = createRes.data?.id;
            if (!predId) {
                addLog(`❌ Sem ID na resposta Replicate: ${JSON.stringify(createRes.data)}`);
                return '❌ Replicate não retornou ID. Verifique sua chave de API.';
            }

            addLog(`🎬 Prediction ID: ${predId}`);

            // ── POLLING com atualizações ao usuário ──────────────────
            const MAX   = 150; // 150 × 3s = 7.5 min máx
            let attempt = 0;
            let result: any;
            let lastUpdate = Date.now();
            const UPDATE_INTERVAL = 30_000; // mensagem a cada 30s

            while (attempt < MAX) {
                await new Promise(r => setTimeout(r, 3000));
                attempt++;

                const poll = await axios.get(
                    `https://api.replicate.com/v1/predictions/${predId}`,
                    { headers: { Authorization: `Token ${token}` }, timeout: 10000 }
                );
                result = poll.data;

                // Atualiza usuário a cada 30s para não parecer travado
                if (Date.now() - lastUpdate > UPDATE_INTERVAL) {
                    const elapsed = Math.round(attempt * 3);
                    const msg =
                        elapsed < 60 ? `⏳ Gerando vídeo... ${elapsed}s` :
                        elapsed < 120 ? `🎬 Quase lá! ${Math.round(elapsed / 60)}min${elapsed % 60}s...` :
                        `🎬 Ainda processando... ${Math.round(elapsed / 60)}min (vídeo de alta qualidade leva tempo!)`;
                    await safeSend(ctx, msg);
                    lastUpdate = Date.now();
                }

                if (result.status === 'succeeded') break;
                if (result.status === 'failed' || result.status === 'canceled') {
                    addLog(`❌ Vídeo ${result.status}: ${result.error}`);
                    return `❌ Geração falhou: ${result.error || result.status}`;
                }
            }

            if (result?.status !== 'succeeded' || !result.output) {
                return `⏱️ Vídeo excedeu 7.5 minutos. Tente com um prompt mais curto.`;
            }

            // ── DOWNLOAD ──────────────────────────────────────────────
            const videoUrl = Array.isArray(result.output) ? result.output[0] : result.output;
            addLog(`📥 Baixando vídeo: ${videoUrl}`);

            const dlRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120_000 });
            const outPath = path.join(process.cwd(), `video_${Date.now()}.mp4`);
            fs.writeFileSync(outPath, Buffer.from(dlRes.data));

            const mb = (dlRes.data.byteLength / 1024 / 1024).toFixed(1);
            addLog(`✅ Vídeo pronto: ${path.basename(outPath)} (${mb} MB)`);

            return {
                text: `✅ *Vídeo pronto!* (${mb} MB)\n_"${prompt.substring(0, 80)}"_`,
                file: outPath,
                type: 'video'
            };

        } catch (e: any) {
            const status = e.response?.status;
            const msg    = e.response?.data?.detail || e.message;
            addLog(`❌ VideoSkill (${status}): ${msg}`);
            if (status === 401) return '❌ Chave Replicate inválida. Verifique REPLICATE_API_TOKEN.';
            if (status === 402) return '❌ Conta Replicate sem créditos.';
            return `❌ Erro ao gerar vídeo: ${msg}`;
        }
    }
}

async function safeSend(ctx: Context, text: string) {
    try { await ctx.reply(text, { parse_mode: 'Markdown' }); }
    catch { try { await ctx.reply(text); } catch {} }
}
