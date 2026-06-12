/**
 * integrations/hub.ts
 * Gerenciador central de integrações — roteador de ações por provedor
 */
import { getConnection, saveConnection, isConnected, getConnectedProviders } from '../db/user-connections.js';
import { refreshGoogleToken } from './oauth/google.js';
import { listEmails, sendEmail } from './providers/gmail.js';
import { searchFiles, listRecentFiles } from './providers/drive.js';
import { listEvents, createEvent } from './providers/calendar.js';
import { OAuthTokens, IntegrationProvider } from './types.js';
import { addLog } from '../web-terminal.js';

async function getValidToken(userId: number, provider: IntegrationProvider): Promise<string | null> {
    const conn = getConnection(userId, provider);
    if (!conn) return null;

    let tokens = conn.tokens;
    if (tokens.expiresAt < Date.now() + 60_000) {
        if (!tokens.refreshToken) return null;
        try {
            if (provider === 'google') {
                tokens = await refreshGoogleToken(tokens);
                saveConnection(userId, provider, tokens);
            }
        } catch (e: any) {
            addLog(`❌ Falha ao renovar token ${provider}: ${e.message}`);
            return null;
        }
    }
    return tokens.accessToken;
}

export async function executeIntegration(userId: number, intent: string): Promise<string | null> {
    const lower = intent.toLowerCase();

    if (lower.includes('email') || lower.includes('gmail') || lower.includes('mensagem')) {
        const token = await getValidToken(userId, 'google');
        if (!token) return null;

        if (lower.includes('enviar') || lower.includes('mandar') || lower.includes('send')) {
            const toMatch = intent.match(/para[:\s]+([\w.@+-]+@[\w.-]+)/i);
            const assuntoMatch = intent.match(/assunto[:\s]+"?([^"\n]+)"?/i);
            const corpoMatch = intent.match(/(?:corpo|mensagem|dizendo)[:\s]+"?([^"\n]+)"?/i);

            if (toMatch) {
                const to = toMatch[1];
                const subject = assuntoMatch?.[1] || 'Mensagem via ConectaClaw';
                const body = corpoMatch?.[1] || intent;
                await sendEmail(token, to, subject, body);
                return `✅ E-mail enviado para **${to}** com assunto "${subject}"`;
            }
        }

        const emails = await listEmails(token, 5);
        if (!emails.length) return '📭 Nenhum e-mail não lido encontrado.';
        return '📬 **Últimos e-mails não lidos:**\n\n' + emails.map((e, i) =>
            `${i + 1}. **${e.subject || '(sem assunto)'}**\n   De: ${e.from}\n   _${e.snippet?.substring(0, 80)}..._`
        ).join('\n\n');
    }

    if (lower.includes('drive') || lower.includes('arquivo') || lower.includes('documento') || lower.includes('pdf')) {
        const token = await getValidToken(userId, 'google');
        if (!token) return null;

        const queryMatch = intent.match(/(?:buscar?|procurar?|achar?|pegar?)\s+(.+?)(?:\s+no\s+drive)?$/i);
        const files = queryMatch ? await searchFiles(token, queryMatch[1], 5) : await listRecentFiles(token, 5);

        if (!files.length) return '📁 Nenhum arquivo encontrado.';
        return '📁 **Arquivos encontrados:**\n\n' + files.map((f, i) =>
            `${i + 1}. [${f.name}](${f.webViewLink || '#'}) — \`${f.mimeType.split('.').pop()}\``
        ).join('\n');
    }

    if (lower.includes('agenda') || lower.includes('calendar') || lower.includes('evento') || lower.includes('reunião') || lower.includes('reuniao')) {
        const token = await getValidToken(userId, 'google');
        if (!token) return null;

        if (lower.includes('criar') || lower.includes('marcar') || lower.includes('agendar')) {
            const titleMatch = intent.match(/(?:reunião|evento|compromisso)\s+(?:de\s+|sobre\s+)?["'"]?([^'"\n]+)/i);
            const dateMatch = intent.match(/(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|amanhã|hoje|próxima?\s+\w+)/i);
            const timeMatch = intent.match(/(\d{1,2}[h:]\d{0,2}\s*(?:am|pm)?)/i);

            const now = new Date();
            const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            if (timeMatch) {
                const parts = timeMatch[1].replace('h', ':').split(':');
                startDate.setHours(parseInt(parts[0]), parseInt(parts[1] || '0'), 0);
            }
            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

            const event = await createEvent(token, {
                summary: titleMatch?.[1] || 'Evento criado via ConectaClaw',
                start: { dateTime: startDate.toISOString() },
                end: { dateTime: endDate.toISOString() }
            });
            return `✅ Evento criado: **${event.summary}**\n📅 ${startDate.toLocaleString('pt-BR')}`;
        }

        const events = await listEvents(token, 5);
        if (!events.length) return '📅 Sem eventos próximos.';
        return '📅 **Próximos eventos:**\n\n' + events.map((e, i) => {
            const dt = e.start?.dateTime || e.start?.date || '';
            const formatted = dt ? new Date(dt).toLocaleString('pt-BR') : '';
            return `${i + 1}. **${e.summary}** — ${formatted}`;
        }).join('\n');
    }

    return null;
}

export { getConnectedProviders, isConnected };
