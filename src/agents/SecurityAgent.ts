/**
 * SecurityAgent.ts
 * Agente de segurança: gera senhas, avalia força, valida 2FA conceitualmente.
 */
import { Agent, AgentContext, AgentResult } from './Agent.js';
import { Context } from 'telegraf';
import Groq from 'groq-sdk';
import * as crypto from 'node:crypto';
import { addLog } from '../web-terminal.js';

export class SecurityAgent implements Agent {
    name = 'SecurityAgent';
    description = 'Gera senhas fortes, valida senhas, dicas de segurança digital.';
    keywords = ['senha', 'senhas', 'password', 'segurança digital', 'seguranca digital', '2fa', 'autenticação', 'autenticacao', 'criptografia', 'phishing', 'golpe', 'fraude'];
    category = 'system' as const;

    canHandle(ctx: AgentContext): boolean {
        const l = ctx.userMessage.toLowerCase();
        return l.startsWith('/senha') || l.startsWith('/password') || l.startsWith('/seguranca') || l.startsWith('/segurança') ||
            this.keywords.some(k => l.includes(k));
    }

    private gerarSenha(tamanho = 20, comSimbolos = true): string {
        const letras = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const nums   = '0123456789';
        const simb   = '!@#$%^&*()-_=+[]{}|;:,.<>?';
        const charset = letras + nums + (comSimbolos ? simb : '');

        let senha = '';
        // Garante ao menos 1 de cada
        senha += letras[crypto.randomInt(letras.length)];
        senha += nums[crypto.randomInt(nums.length)];
        if (comSimbolos) senha += simb[crypto.randomInt(simb.length)];

        for (let i = senha.length; i < tamanho; i++) {
            senha += charset[crypto.randomInt(charset.length)];
        }
        // Embaralha
        return senha.split('').sort(() => crypto.randomInt(-1, 2)).join('');
    }

    private avaliarForca(s: string): { score: number; label: string; dicas: string[] } {
        let score = 0;
        const dicas: string[] = [];
        if (s.length >= 12) score += 2; else if (s.length >= 8) score += 1; else dicas.push('Use pelo menos 12 caracteres');
        if (/[a-z]/.test(s)) score += 1; else dicas.push('Adicione letras minúsculas');
        if (/[A-Z]/.test(s)) score += 1; else dicas.push('Adicione letras maiúsculas');
        if (/[0-9]/.test(s)) score += 1; else dicas.push('Adicione números');
        if (/[^a-zA-Z0-9]/.test(s)) score += 2; else dicas.push('Adicione símbolos (!@#$)');
        if (/(.)\1\1/.test(s)) { score -= 1; dicas.push('Evite caracteres repetidos'); }
        if (/^(123|abc|qwerty|senha|password)/i.test(s)) { score -= 3; dicas.push('Evite padrões comuns'); }

        const label = score >= 6 ? '💪 Muito forte' : score >= 4 ? '✅ Forte' : score >= 2 ? '⚠️ Média' : '❌ Fraca';
        return { score: Math.max(0, score), label, dicas };
    }

    async execute(ctx: AgentContext, _tg: Context): Promise<AgentResult | string | null> {
        const msg = ctx.userMessage.trim();
        const lower = msg.toLowerCase();

        // /senha [tamanho]
        if (lower.startsWith('/senha') || lower.startsWith('/password')) {
            const args = msg.replace(/^\/(senha|password)\s*/i, '').trim();
            const tamanho = Math.min(Math.max(parseInt(args) || 20, 8), 64);
            const senha = this.gerarSenha(tamanho);
            return `🔐 *Senha gerada (${tamanho} caracteres):*\n\n\`${senha}\`\n\n⚠️ _Use um gerenciador de senhas (Bitwarden, 1Password) e ative 2FA._`;
        }

        // /avaliar senha <senha>
        const avalMatch = lower.match(/^\/(avaliar|avaliar|forca|senha)\s+["']?(.+?)["']?$/i);
        if (avalMatch || lower.startsWith('avaliar senha') || lower.startsWith('qual a força')) {
            const senha = msg.replace(/^(\/avaliar|\/forca|\/senha|avaliar senha|qual a força da senha)\s*/i, '').replace(/^["']|["']$/g, '').trim();
            if (!senha) return '🔐 Diga a senha para avaliar. Ex: `avaliar senha MinhaSenh@123`';
            const r = this.avaliarForca(senha);
            return `🔐 *Força da senha:*\n\n${r.label} (score: ${r.score}/8)\n\n${r.dicas.length > 0 ? '💡 *Dicas:*\n' + r.dicas.map(d => `• ${d}`).join('\n') : '✅ Nenhuma melhoria necessária.'}`;
        }

        addLog(`🛡️ Security: ${msg.substring(0, 60)}`);

        return `🛡️ *SecurityAgent*\n\nComandos disponíveis:\n• \`/senha [tamanho]\` — gera senha forte\n• \`avaliar senha <s>\` — analisa força da senha\n• Pergunte sobre: 2FA, phishing, golpes digitais, criptografia`;
    }
}
