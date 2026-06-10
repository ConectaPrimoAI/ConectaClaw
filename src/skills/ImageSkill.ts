import { Skill } from './Skill.js';
import { Context } from 'telegraf';
import axios from 'axios';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { addLog } from '../web-terminal.js';

export class ImageSkill implements Skill {
    name = 'ImageSkill';
    description = 'Gera imagens de alta qualidade via Pollinations.ai (FLUX model).';

    canHandle(intent: string): boolean {
        return intent.includes('[SYSTEM_IMAGE:');
    }

    async execute(params: any, ctx: Context): Promise<string | { text: string; file?: string; type?: 'photo' }> {
        const match = params.match(/\[SYSTEM_IMAGE:\s*prompt="([\s\S]+?)"\]/i);
        if (!match) return "";

        const prompt = match[1].trim();
        addLog(`🎨 Gerando imagem: "${prompt.substring(0, 60)}..."`);

        try {
            await (ctx as any).sendChatAction('upload_photo');

            const seed = Math.floor(Math.random() * 999999);
            const encodedPrompt = encodeURIComponent(prompt);
            // Usando FLUX — melhor qualidade, sem limites de API
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true&model=flux&seed=${seed}`;

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: { 'User-Agent': 'JoelBot/20.0' }
            });

            if (!response.data || response.data.byteLength < 1000) {
                addLog('⚠️ Imagem retornada muito pequena, pode ter falhado');
                return "";
            }

            const imagePath = path.join(process.cwd(), `image_${Date.now()}.jpg`);
            fs.writeFileSync(imagePath, Buffer.from(response.data));

            addLog(`✅ Imagem gerada: ${path.basename(imagePath)}`);
            return {
                text: `🎨 Imagem gerada com sucesso!`,
                file: imagePath,
                type: 'photo'
            };
        } catch (error: any) {
            addLog(`❌ ImageSkill erro: ${error.message}`);
            return "";
        }
    }
}
