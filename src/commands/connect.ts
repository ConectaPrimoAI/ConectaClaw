/**
 * commands/connect.ts
 * Handler do comando /conectar — Hub de integrações com botões inline
 */
import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { generateGoogleAuthUrl } from '../integrations/oauth/google.js';
import { getConnectedProviders, isConnected } from '../integrations/hub.js';
import { addLog } from '../web-terminal.js';

export async function handleConectar(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const connected = getConnectedProviders(userId);
    const googleOk = connected.includes('google');

    const googleLabel = googleOk ? '✅ Google Workspace (Conectado)' : '🔗 Conectar Google Workspace';

    await ctx.reply(
        '🔌 *Hub de Integrações ConectaClaw🦞*\n\n' +
        'Conecte suas ferramentas de trabalho para ativar automações inteligentes.\n\n' +
        (googleOk
            ? '✅ *Google Workspace* — Gmail, Drive e Calendar conectados!\n'
            : '⚪ *Google Workspace* — Gmail, Drive, Calendar\n') +
        '\n_Clique para conectar:_',
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(googleLabel, 'connect_google')],
                ...(googleOk ? [[Markup.button.callback('🔴 Desconectar Google', 'disconnect_google')]] : []),
                [Markup.button.callback('ℹ️ Como usar integrações', 'integrations_help')]
            ])
        }
    );
}

export async function handleConnectGoogle(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) { await ctx.answerCbQuery(); return; }

    await ctx.answerCbQuery('Gerando link de autenticação...');

    const hasConfig = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    if (!hasConfig) {
        await ctx.reply(
            '⚠️ *Google OAuth não configurado.*\n\n' +
            'O administrador precisa configurar:\n' +
            '• `GOOGLE_CLIENT_ID`\n' +
            '• `GOOGLE_CLIENT_SECRET`\n' +
            '• `GOOGLE_REDIRECT_URI`\n\n' +
            'Veja o `.env.example` para instruções.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    try {
        const authUrl = generateGoogleAuthUrl(userId);
        await ctx.reply(
            '🔐 *Autenticação Google*\n\n' +
            'Clique no botão abaixo para autorizar acesso ao Gmail, Drive e Calendar.\n\n' +
            '⏱️ _Link válido por 10 minutos._',
            {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.url('🔗 Autorizar Google', authUrl)]
                ])
            }
        );
    } catch (e: any) {
        addLog(`❌ /conectar google: ${e.message}`);
        await ctx.reply('❌ Erro ao gerar link de autenticação.');
    }
}

export async function handleDisconnectGoogle(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) { await ctx.answerCbQuery(); return; }

    await ctx.answerCbQuery('Desconectando...');
    const { removeConnection } = await import('../db/user-connections.js');
    removeConnection(userId, 'google');
    await ctx.reply('✅ *Google Workspace desconectado.*\nSeus dados foram removidos.', { parse_mode: 'Markdown' });
}

export async function handleIntegrationsHelp(ctx: Context): Promise<void> {
    await ctx.answerCbQuery();
    await ctx.reply(
        '💡 *Como usar as integrações:*\n\n' +
        '*Gmail:*\n' +
        '• _"Mostra meus últimos e-mails"_\n' +
        '• _"Manda e-mail para joao@gmail.com assunto: Reunião"_\n\n' +
        '*Drive:*\n' +
        '• _"Busca o PDF do projeto Alpha no Drive"_\n' +
        '• _"Lista meus arquivos recentes"_\n\n' +
        '*Calendar:*\n' +
        '• _"Quais são meus próximos eventos?"_\n' +
        '• _"Marca reunião amanhã às 14h"_\n\n' +
        '_Fale naturalmente — a IA detecta automaticamente quando usar suas integrações!_ 🦞',
        { parse_mode: 'Markdown' }
    );
}
