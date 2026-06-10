/**
 * ImageGenAgent.ts
 * Agente de geração de imagens — interface amigável para o ImageSkill.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import { addLog } from '../web-terminal.js';

export class ImageGenAgent implements Agent {
    name = 'ImageGenAgent';
    description = 'Gera imagens de alta qualidade a partir de descrições em texto.';
    keywords = ['desenhe', 'desenhar', 'gere uma imagem', 'gera imagem', 'criar imagem', 'cria imagem', 'ilustração', 'ilustracao', 'pintura', 'wallpaper', 'papel de parede', 'arte digital', 'avatar', 'logo', 'logotipo'];
    category = 'media' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/imagem') || l.startsWith('/gerarimagem') || l.startsWith('/desenhar') || l.startsWith('/gerar-imagem') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const prompt = ctx.userMessage
            .replace(/^\/(imagem|gerarimagem|desenhar|gerar-imagem)\s*/i, '')
            .replace(/^(desenhe|desenhar|gere uma imagem|gera imagem|criar imagem|cria imagem)\s+/i, '')
            .trim();

        if (!prompt) return '🎨 Diga o que devo desenhar. Ex: `/imagem um gato astronauta em marte`';

        addLog(`🎨 ImageGen: ${prompt}`);

        // Retorna tag de skill para o router disparar
        return {
            text: `🎨 _Gerando imagem: "${prompt}"..._`,
            tags: [`[SYSTEM_IMAGE: prompt="${prompt}"]`]
        };
    }
}
