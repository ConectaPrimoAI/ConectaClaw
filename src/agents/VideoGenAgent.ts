/**
 * VideoGenAgent.ts
 * Agente de geração de vídeos — interface amigável para o VideoSkill.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import { addLog } from '../web-terminal.js';

export class VideoGenAgent implements Agent {
    name = 'VideoGenAgent';
    description = 'Gera vídeos curtos a partir de descrições em texto.';
    keywords = ['gere um vídeo', 'gera video', 'gera um vídeo', 'gerar vídeo', 'criar vídeo', 'cria video', 'criar video', 'animação', 'animacao', 'clipe', 'reels automático', 'shorts automático'];
    category = 'media' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/video') || l.startsWith('/gerarvideo') || l.startsWith('/gerar-video') || l.startsWith('/animar') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const prompt = ctx.userMessage
            .replace(/^\/(video|gerarvideo|gerar-video|animar)\s*/i, '')
            .replace(/^(gere um vídeo|gera video|criar vídeo|animação)\s+/i, '')
            .trim();

        if (!prompt) return '🎬 Descreva o vídeo. Ex: `/video um astronauta caminhando em marte`';

        addLog(`🎬 VideoGen: ${prompt}`);

        return {
            text: `🎬 _Gerando vídeo: "${prompt}"..._`,
            tags: [`[SYSTEM_VIDEO: prompt="${prompt}"]`]
        };
    }
}
