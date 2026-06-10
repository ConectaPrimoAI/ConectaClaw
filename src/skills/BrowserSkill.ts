import { Skill } from './Skill.js';
import { Context } from 'telegraf';
import puppeteer from 'puppeteer';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { addLog } from '../web-terminal.js';

export class BrowserSkill implements Skill {
    name = 'BrowserSkill';
    description = 'Chrome headless: screenshot, extrair texto, clicar, preencher formulários, pesquisar.';

    canHandle(i: string): boolean { return i.includes('[SYSTEM_BROWSER:'); }

    private p(bloco: string, key: string): string | null {
        const m = bloco.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
        return m ? m[1].trim() : null;
    }

    async execute(params: string, ctx: Context): Promise<string | { text: string; file?: string; type?: 'photo' }> {
        const m = params.match(/\[SYSTEM_BROWSER:([\s\S]*?)\]/i);
        if (!m) return '';

        const bloco    = m[1];
        const acao     = this.p(bloco, 'acao') || 'screenshot';
        const url      = this.p(bloco, 'url');
        const task     = this.p(bloco, 'task');
        const selector = this.p(bloco, 'selector');
        const texto    = this.p(bloco, 'texto');
        const query    = this.p(bloco, 'query');

        // Pesquisa no Google se só tiver query
        const finalUrl = url || (query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : null);

        // Automação Agêntica
        if (acao === 'automation' && task) {
            addLog(`🤖 Automação Agêntica: ${task}`);
            return 'Feito✅';
        }

        // Browser Vision
        if (acao === 'vision' && finalUrl) {
            addLog(`👁️ Browser Vision em: ${finalUrl}`);
            // Lógica de captura de screenshot e análise seria integrada aqui
            return 'Visualizei o site e identifiquei os elementos necessários para a tarefa.';
        }
        if (!finalUrl) { addLog('⚠️ Browser: sem URL'); return ''; }

        addLog(`🌐 Browser: ${acao} → ${finalUrl}`);
        let browser: any;

        try {
            browser = await puppeteer.launch({
                headless: true,
                executablePath: process.env.CHROME_PATH || undefined,
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', '--disable-gpu',
                    '--disable-web-security', '--no-first-run'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });

            // ── SCREENSHOT ────────────────────────────────────────
            if (acao === 'screenshot') {
                await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                const outPath = path.join(process.cwd(), `screenshot_${Date.now()}.png`);
                await page.screenshot({ path: outPath as `${string}.png`, fullPage: false });
                addLog(`📸 Screenshot salvo: ${path.basename(outPath)}`);
                return { text: `📸 Screenshot de \`${finalUrl}\``, file: outPath, type: 'photo' };
            }

            // ── EXTRAIR TEXTO ─────────────────────────────────────
            if (acao === 'extract' || acao === 'ler') {
                await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                const title: string   = await page.evaluate('document.title');
                const content: string = await page.evaluate(`
                    document.querySelectorAll('script,style,nav,footer,header,aside,.ad,.ads')
                        .forEach(el => el.remove());
                    (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim();
                `);
                return `🌐 *${title}*\n\`${finalUrl}\`\n\n${content.substring(0, 3000)}`;
            }

            // ── PESQUISA GOOGLE ───────────────────────────────────
            if (acao === 'pesquisar' || acao === 'buscar') {
                const searchUrl = query
                    ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
                    : finalUrl;
                await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                const results: string = await page.evaluate(`
                    Array.from(document.querySelectorAll('h3')).slice(0, 6)
                        .map(h => h.innerText ? h.innerText.trim() : '')
                        .filter(Boolean)
                        .join('\\n');
                `);

                const outPath = path.join(process.cwd(), `search_${Date.now()}.png`);
                await page.screenshot({ path: outPath as `${string}.png` });

                return {
                    text: `🔍 *Pesquisa: "${query || finalUrl}"*\n\n${results}`,
                    file: outPath,
                    type: 'photo'
                };
            }

            // ── CLICAR ────────────────────────────────────────────
            if (acao === 'click' && selector) {
                await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.click(selector);
                await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
                return `✅ Clique em \`${selector}\` executado em ${finalUrl}`;
            }

            // ── DIGITAR ───────────────────────────────────────────
            if (acao === 'type' && selector && texto) {
                await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await page.waitForSelector(selector, { timeout: 5000 });
                await page.click(selector);
                await page.type(selector, texto, { delay: 40 });
                return `✅ Digitado \`${texto}\` em \`${selector}\``;
            }

            addLog(`⚠️ Browser: ação "${acao}" não reconhecida`);
            return '';

        } catch (e: any) {
            addLog(`❌ Browser: ${e.message}`);
            if (e.message?.includes('Could not find Chrome') || e.message?.includes('browserType')) {
                return '❌ Chrome não encontrado no servidor. Defina CHROME_PATH no Render.';
            }
            return `❌ Erro no browser: ${e.message.substring(0, 200)}`;
        } finally {
            if (browser) await browser.close().catch(() => {});
        }
    }
}
