/**
 * TranslatorAgent.ts
 * Agente tradutor multi-idioma.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';
import { addLog } from '../web-terminal.js';

let groqInstance: Groq | null = null;
function getGroq(): Groq {
    if (!groqInstance) groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    return groqInstance;
}

const IDIOMAS: Record<string, string> = {
    'en': 'inglês', 'pt': 'português', 'es': 'espanhol',
    'fr': 'francês', 'de': 'alemão', 'it': 'italiano',
    'ja': 'japonês', 'zh': 'chinês', 'ru': 'russo',
    'ko': 'coreano', 'ar': 'árabe', 'hi': 'hindi'
};

export class TranslatorAgent implements Agent {
    name = 'TranslatorAgent';
    description = 'Traduz textos entre vários idiomas com detecção automática.';
    keywords = ['traduzir', 'traduz', 'tradução', 'traducao', 'translate', 'inglês', 'espanhol', 'francês', 'alemão', 'italiano', 'japonês', 'chinês', 'russo', 'coreano'];
    category = 'communication' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/traduzir') || l.startsWith('/traduz') ||
            (l.startsWith('traduz ') && l.length > 8) ||
            l.startsWith('translate ') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        let prompt = ctx.userMessage.replace(/^\/(traduzir|traduz)\s*/i, '').trim();

        // Detecta formato: "traduz <texto> para <idioma>"
        let idioma = 'inglês';
        const paraMatch = prompt.match(/para\s+(\w+)/i);
        if (paraMatch) {
            const id = paraMatch[1].toLowerCase();
            idioma = IDIOMAS[id] || id;
            prompt = prompt.replace(/para\s+\w+/i, '').trim();
        } else {
            // Detecta idioma na frase
            for (const [code, name] of Object.entries(IDIOMAS)) {
                if (prompt.toLowerCase().includes(`em ${name}`) || prompt.toLowerCase().includes(`para ${name}`)) {
                    idioma = name;
                    break;
                }
            }
        }

        if (!prompt || prompt.length < 2) {
            return '🌐 Use: `traduz <texto> para <idioma>` ou `/traduzir texto en`';
        }

        addLog(`🌐 Traduzindo para ${idioma}: ${prompt.substring(0, 40)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `Você é um tradutor profissional. Traduza o texto a seguir para ${idioma}. Preserve o tom, contexto e formatação. Responda APENAS com a tradução, sem explicações extras.`
                    },
                    { role: 'user', content: prompt }
                ]
            });
            return `🌐 *Tradução (${idioma}):*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            addLog(`❌ Translator: ${e.message}`);
            return `❌ Erro: ${e.message}`;
        }
    }
}
