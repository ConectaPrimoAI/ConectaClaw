/**
 * NewsAgent.ts
 * Agente de notícias: busca manchetes atuais via RSS público.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import axios from 'axios';
import { addLog } from '../web-terminal.js';

interface NewsItem {
    title: string;
    link: string;
    pubDate: string;
    source: string;
}

export class NewsAgent implements Agent {
    name = 'NewsAgent';
    description = 'Busca notícias atuais de várias fontes em tempo real.';
    keywords = ['notícia', 'noticia', 'notícias', 'noticias', 'manchete', 'manchetes', 'jornal', 'novidades', 'o que está acontecendo', 'acontecendo hoje', 'últimas notícias', 'ultimas noticias', 'news', 'headlines'];
    category = 'analysis' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/news') || l.startsWith('/noticias') || l.startsWith('/notícias') || l.startsWith('/manchetes') ||
            this.keywords.some(k => l.includes(k));
    }

    private async fetchRSS(url: string, source: string, limit = 5): Promise<NewsItem[]> {
        try {
            const res = await axios.get(url, {
                timeout: 10000,
                headers: { 'User-Agent': 'Conecta Claw🦞/22.0' },
                responseType: 'text'
            });
            const xml = res.data as string;
            const items: NewsItem[] = [];
            const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
            let match: RegExpExecArray | null;
            let count = 0;

            while ((match = itemRegex.exec(xml)) !== null && count < limit) {
                const block = match[1];
                const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '';
                const link  = block.match(/<link>(.*?)<\/link>/i)?.[1] || '';
                const pub   = block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || '';
                if (title) {
                    items.push({
                        title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
                        link: link.trim(),
                        pubDate: pub.trim(),
                        source
                    });
                    count++;
                }
            }
            return items;
        } catch {
            return [];
        }
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        addLog(`📰 NewsAgent`);

        // Fontes públicas (Google News RSS por idioma/tópico)
        const query = ctx.userMessage
            .replace(/^\/(news|noticias|notícias|manchetes)\s*/i, '')
            .trim() || 'brasil';

        const urls: Array<{ url: string; source: string }> = [
            { url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`, source: 'Google News' },
            { url: `https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=pt-BR&gl=BR&ceid=BR:pt-419`, source: 'Tech' }
        ];

        const allItems: NewsItem[] = [];
        for (const { url, source } of urls) {
            const items = await this.fetchRSS(url, source, 5);
            allItems.push(...items);
        }

        if (allItems.length === 0) {
            return '⚠️ Não consegui buscar notícias agora. Tente novamente em alguns instantes.';
        }

        const top = allItems.slice(0, 8);
        const linhas = top.map((it, i) => {
            const date = it.pubDate ? new Date(it.pubDate).toLocaleDateString('pt-BR') : '';
            return `${i + 1}. *${it.title}*\n   📡 ${it.source}${date ? ` • ${date}` : ''}\n   🔗 ${it.link}`;
        }).join('\n\n');

        return `📰 *Notícias sobre "${query}":*\n\n${linhas}`;
    }
}
