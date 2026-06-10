/**
 * AutonomousCoreAgent.ts
 * Núcleo autônomo para automação de navegador e manipulação de arquivos.
 *
 * CORREÇÃO V24: Keywords mais específicas para não colidir com outros agentes.
 * Adicionado priority=5 para ser preferido em contextos de automação real.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Context } from 'telegraf';
import { registry } from '../skills/index.js';
import { addLog } from '../web-terminal.js';

export class AutonomousCoreAgent implements Agent {
    name = 'AutonomousCoreAgent';
    description = 'Núcleo autônomo para automação de navegador e manipulação robusta de arquivos.';
    // CORRIGIDO: Removidos 'pesquisar', 'criar', 'ler', 'arquivo' genéricos
    // Mantidos apenas termos que implicam automação/navegação real
    keywords = [
        'navegar no site', 'abrir site', 'acessar site', 'abrir url', 'navegar até',
        'clicar no botão', 'clicar em', 'digitar no campo',
        'extrair dados do site', 'extrair do site', 'scraping', 'raspar',
        'criar arquivo no workspace', 'ler arquivo do workspace', 'workspace',
        'automatizar', 'automação web', 'bot web'
    ];
    priority = 5; // Alta prioridade quando bate
    category: 'system' = 'system';

    async canHandle(ctx: AgentContext): Promise<boolean> {
        const msg = ctx.userMessage.toLowerCase();
        // Requer contexto muito específico de automação/navegação
        return this.keywords.some(k => msg.includes(k));
    }

    async execute(agentCtx: AgentContext, telegrafCtx: Context): Promise<AgentResult | string | null> {
        const task = agentCtx.userMessage;
        addLog(`🤖 AutonomousCoreAgent executando: ${task.substring(0, 50)}...`);

        try {
            // ── Lógica de Navegação Web ─────────────────────────────
            if (task.match(/navegar|abrir\s+(site|url)|acessar\s+site/i)) {
                const urlMatch = task.match(/(https?:\/\/[^\s]+)/);
                if (urlMatch) {
                    const url = urlMatch[0];
                    const skill = await registry.selectBestSkill('[SYSTEM_BROWSER: acao="extract"]');
                    if (skill) {
                        const res = await skill.execute(`[SYSTEM_BROWSER: acao="extract", url="${url}"]`, telegrafCtx);
                        if (typeof res === 'string') return res;
                        if (res && typeof res === 'object') {
                            return {
                                text: res.text,
                                file: res.file ? { path: res.file, type: res.type || 'document' } : undefined
                            };
                        }
                    }
                    return `🌐 Tentei acessar ${url}. Certifique-se de que a BrowserSkill está configurada.`;
                }
                return '🌐 Por favor, informe a URL completa (ex: https://example.com)';
            }

            // ── Lógica de Pesquisa Web ──────────────────────────────
            if (task.match(/scraping|raspar|extrair dados do site/i)) {
                const queryMatch = task.match(/(?:scraping|raspar|extrair\s+dados\s+de?)\s+(?:de\s+)?(.+)/i);
                if (queryMatch) {
                    const query = queryMatch[1].replace(/(https?:\/\/[^\s]+)/, '').trim();
                    const urlMatch = task.match(/(https?:\/\/[^\s]+)/);
                    const url = urlMatch ? urlMatch[0] : '';
                    const skill = await registry.selectBestSkill('[SYSTEM_BROWSER: acao="extract"]');
                    if (skill && url) {
                        const res = await skill.execute(`[SYSTEM_BROWSER: acao="extract", url="${url}", query="${query}"]`, telegrafCtx);
                        if (typeof res === 'string') return res;
                        if (res && typeof res === 'object') {
                            return {
                                text: res.text,
                                file: res.file ? { path: res.file, type: res.type || 'document' } : undefined
                            };
                        }
                    }
                }
            }

            // ── Lógica de Arquivos (Sandbox Seguro) ─────────────────
            const workspace = path.join(process.cwd(), 'workspace');
            await fs.mkdir(workspace, { recursive: true });

            if (task.match(/criar arquivo/i)) {
                const match = task.match(/criar arquivo\s+["']?(.+?)["']?\s+com\s+o\s+conteúdo\s+([\s\S]+)/i);
                if (match) {
                    const fileName = path.basename(match[1]);
                    const content = match[2];
                    const filePath = path.join(workspace, fileName);
                    await fs.writeFile(filePath, content);
                    return `✅ Arquivo \`${fileName}\` criado no workspace.`;
                }
            }

            if (task.match(/ler arquivo/i)) {
                const match = task.match(/ler arquivo\s+["']?(.+?)["']?/i);
                if (match) {
                    const fileName = path.basename(match[1]);
                    const filePath = path.join(workspace, fileName);
                    try {
                        const content = await fs.readFile(filePath, 'utf-8');
                        return `📄 *Conteúdo de ${fileName}:*\n\n\`\`\`\n${content}\n\`\`\``;
                    } catch {
                        return `❌ Arquivo \`${fileName}\` não encontrado no workspace.`;
                    }
                }
            }

            return 'Compreendi a intenção de automação, mas preciso de mais detalhes. Informe a URL ou nome do arquivo e o que devo fazer.';
        } catch (error: any) {
            addLog(`❌ Erro no AutonomousCoreAgent: ${error.message}`);
            return `❌ Erro ao executar tarefa autônoma: ${error.message}`;
        }
    }
}
