/**
 * MusicAgent.ts
 * Agente musical: identifica humor, sugere músicas, explica teoria musical.
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

const PLAYLIST_POR_HUMOR: Record<string, string[]> = {
    'feliz':      ['Happy - Pharrell Williams', 'Walking on Sunshine - Katrina & The Waves', 'Bom dia - Emicida'],
    'triste':     ['Someone Like You - Adele', 'Tocando em Frente - Almir Sater', 'Fix You - Coldplay'],
    'focado':     ['Lofi beats', 'Brain Power - NOMA', 'Strobe - Deadmau5'],
    'relaxado':   ['Weightless - Marconi Union', 'Breathe - Telepopmusik', 'Aqui e Agora - Tribalistas'],
    'mal':        ['In the End - Linkin Park', 'Numb - Linkin Park', 'Petrúcia - Zeca Baleiro'],
    'nostálgico': ['Epitáfio - Titãs', 'Tente Outra Vez - Raul Seixas', 'Tears in Heaven - Eric Clapton'],
    'motivado':   ['Eye of the Tiger - Survivor', 'Lose Yourself - Eminem', 'Vai Dar Bom - Thiaguinho'],
    'apaixonado': ['Perfect - Ed Sheeran', 'All of Me - John Legend', 'Evidências - Chitãozinho & Xororó']
};

export class MusicAgent implements Agent {
    name = 'MusicAgent';
    description = 'Recomenda músicas por humor, explica teoria musical, sugere trilhas.';
    keywords = ['música', 'musica', 'playlist', 'ouvir', 'canção', 'cancao', 'banda', 'cantor', 'cantora', 'album', 'álbum', 'trilha sonora', 'lofi', 'rock', 'pop', 'mpb', 'sertanejo', 'funk', 'rap', 'hip hop', 'jazz', 'clássica', 'classica', 'hino'];
    category = 'creative' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/musica') || l.startsWith('/música') || l.startsWith('/playlist') || l.startsWith('/trilha') || l.startsWith('/music') ||
            this.keywords.some(k => l.includes(k));
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const msg = ctx.userMessage;
        const lower = msg.toLowerCase();

        // Sugestão por humor detectado
        const pedido = msg
            .replace(/^\/(musica|música|playlist|trilha|music)\s*/i, '')
            .trim();

        if (pedido) {
            // Detecta humor
            for (const [humor, musicas] of Object.entries(PLAYLIST_POR_HUMOR)) {
                if (lower.includes(humor)) {
                    return `🎵 *Playlist para ${humor}:*\n\n${musicas.map(m => `• ${m}`).join('\n')}\n\n_Espero que curtas!_`;
                }
            }
        }

        addLog(`🎵 Music: ${msg.substring(0, 60)}`);

        try {
            const groq = getGroq();
            const chat = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.8,
                messages: [
                    {
                        role: 'system',
                        content: `Você é o MusicAgent — um DJ e crítico musical.
Ajude com: sugestões por humor/gênero, explicar teoria musical (escalas, acordes, harmonia), história de bandas, trilhas para filmes, comparações entre artistas.
Sempre sugira pelo menos 3 obras concretas (música, álbum, banda).`
                    },
                    { role: 'user', content: msg }
                ]
            });
            return `🎵 *MusicAgent:*\n\n${chat.choices[0].message.content}`;
        } catch (e: any) {
            return `❌ Erro: ${e.message}`;
        }
    }
}
