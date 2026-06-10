import { Skill } from './Skill.js';
import { Context } from 'telegraf';
import { exec, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { promisify } from 'node:util';
import { addLog } from '../web-terminal.js';

const execAsync = promisify(exec);

// Comandos que destroem o servidor
const BLOCKED = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'shutdown', 'reboot', 'kill -9 1', 'pkill node'];

// Diretório de trabalho dedicado (computador Linux do bot)
const WORKDIR = path.join(process.cwd(), 'workspace');

export class ExecSkill implements Skill {
    name = 'ExecSkill';
    description = 'Terminal Linux completo: executar comandos, criar arquivos, instalar pacotes.';

    canHandle(i: string): boolean { return i.includes('[SYSTEM_EXEC:'); }

    constructor() {
        // Garante que o workspace existe
        if (!fs.existsSync(WORKDIR)) fs.mkdirSync(WORKDIR, { recursive: true });
        addLog(`💻 Workspace: ${WORKDIR}`);
    }

    private p(bloco: string, key: string): string | null {
        // Suporta conteudo=|||...|||  para conteúdo multi-linha
        const ml = bloco.match(new RegExp(`${key}\\s*=\\s*\\|\\|\\|([\\s\\S]*?)\\|\\|\\|`, 'i'));
        if (ml) return ml[1];
        const m = bloco.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`, 'i'));
        return m ? m[1].trim() : null;
    }

    async execute(params: string, _ctx: Context): Promise<string | { text: string; file?: string; type?: 'document' }> {
        const m = params.match(/\[SYSTEM_EXEC:([\s\S]*?)\]/i);
        if (!m) return '';

        const bloco = m[1];
        const acao  = this.p(bloco, 'acao') || 'exec';
        const cmd   = this.p(bloco, 'cmd') || this.p(bloco, 'codigo');
        const nome  = this.p(bloco, 'nome');
        const lang  = this.p(bloco, 'linguagem') || 'bash';

        addLog(`💻 Exec: ${acao}`);

        // ── EXECUTAR COMANDO ──────────────────────────────────────
        if (acao === 'exec' && cmd) {
            let finalCmd = cmd;
            if (lang === 'python') finalCmd = `python3 -c "${cmd.replace(/"/g, '\\"')}"`;
            
            const low = finalCmd.toLowerCase();
            if (BLOCKED.some(b => low.includes(b))) {
                return '⚠️ Comando bloqueado por segurança.';
            }

            try {
                const { stdout, stderr } = await execAsync(finalCmd, {
                    cwd: WORKDIR,
                    timeout: 60000,
                    shell: '/bin/bash',
                    env: { ...process.env, HOME: os.homedir(), PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
                });
                const out = (stdout || stderr || '✅ Concluído.').substring(0, 2500);
                return `💻 *Terminal (${lang}):*\n\`\`\`\n$ ${finalCmd}\n${out}\n\`\`\``;
            } catch (e: any) {
                const err = (e.stdout || e.stderr || e.message).substring(0, 1500);
                return `💻 *Terminal (erro ${lang}):*\n\`\`\`\n$ ${finalCmd}\n${err}\n\`\`\``;
            }
        }

        // ── CRIAR ARQUIVO ─────────────────────────────────────────
        if (acao === 'criar' && nome) {
            const conteudo = (cmd || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            const safeName = path.basename(nome);
            const filePath = path.join(WORKDIR, safeName);

            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, conteudo, 'utf-8');
            addLog(`📄 Arquivo criado: ${safeName} (${conteudo.length} chars)`);

            return {
                text: `📄 Arquivo \`${safeName}\` criado! (${conteudo.length} chars)`,
                file: filePath,
                type: 'document'
            };
        }

        // ── LER ARQUIVO ───────────────────────────────────────────
        if (acao === 'ler' && nome) {
            const safeName = path.basename(nome);
            const filePath = path.join(WORKDIR, safeName);
            if (!fs.existsSync(filePath)) return `⚠️ Arquivo \`${safeName}\` não encontrado.`;
            const content = fs.readFileSync(filePath, 'utf-8').substring(0, 3000);
            return `📄 *${safeName}:*\n\`\`\`\n${content}\n\`\`\``;
        }

        // ── LISTAR WORKSPACE ──────────────────────────────────────
        if (acao === 'listar' || acao === 'ls') {
            const items = fs.readdirSync(WORKDIR, { withFileTypes: true });
            if (!items.length) return '📭 Workspace vazio.';
            const lista = items.map(i => `${i.isDirectory() ? '📁' : '📄'} ${i.name}`).join('\n');
            return `💻 *Workspace (${WORKDIR}):*\n${lista}`;
        }

        // ── INSTALAR PACOTE ───────────────────────────────────────
        if (acao === 'instalar' && cmd) {
            const pkg = cmd.replace(/[^a-zA-Z0-9@._/-]/g, '');
            try {
                const { stdout } = await execAsync(`npm install ${pkg}`, {
                    cwd: WORKDIR, timeout: 120000
                });
                return `📦 *${pkg}* instalado!\n\`\`\`\n${stdout.substring(0, 800)}\n\`\`\``;
            } catch (e: any) {
                return `❌ Falha ao instalar ${pkg}: ${e.stderr?.substring(0, 500) || e.message}`;
            }
        }

        addLog(`⚠️ ExecSkill: ação "${acao}" não reconhecida`);
        return '';
    }
}
