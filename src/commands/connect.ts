/**
 * connect.ts
 * Handler do comando /conectar — gera JWT e envia botão para o painel web
 */

import { Context } from 'telegraf';
import jwt from 'jsonwebtoken';
import { getAllIntegrations } from '../db/firebase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'conectaclaw_secret_2026_x9f2m7p4q8r1w5e6';
const JWT_EXPIRY = '30m';

export function generateUserToken(telegramId: number): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      telegram_id: telegramId,
      iat: now,
      type: 'connector_panel',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyUserToken(token: string): { telegram_id: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      clockTolerance: 60,
    }) as any;
    return { telegram_id: decoded.telegram_id };
  } catch (error: any) {
    console.error('❌ Erro ao verificar token JWT:', error.message);
    return null;
  }
}

export async function handleConectar(ctx: Context): Promise<void> {
  try {
    const telegramId = ctx.from!.id;
    const firstName = ctx.from!.first_name || 'amigo';

    const token = generateUserToken(telegramId);
    const panelUrl = `https://conecta-primo-ai.vercel.app/conectores.html?token=${token}`;

    console.log(`🔗 Token gerado para ${telegramId} (válido por ${JWT_EXPIRY})`);

    let statusText = '';
    try {
      const integrations = await getAllIntegrations(telegramId);
      const connectedList = Object.keys(integrations);

      if (connectedList.length > 0) {
        const names = connectedList
          .filter((k: string) => k !== 'google')
          .map((k: string) => `✅ ${capitalize(k)}`)
          .join(', ');
        if (names) statusText = `\n\n📊 *Conectados:* ${names}`;
      }
    } catch (dbError: any) {
      console.warn('⚠️ Falha ao buscar integrações:', dbError.message);
    }

    await ctx.reply(
      `🦞 E aí, ${firstName}! Vou te conectar às suas ferramentas favoritas.\n\n` +
        `Clica no botão abaixo pra abrir o painel de conectores. Lá você escolhe o que liberar e conecta em segundos.\n\n` +
        `🔒 *Seguro:* Seus tokens ficam criptografados e você pode desconectar quando quiser.\n` +
        `⏰ *Validade:* 30 minutos${statusText}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔌 Abrir Painel de Conectores', web_app: { url: panelUrl } }],
            [{ text: '🔗 Abrir no navegador', url: panelUrl }],
          ],
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Erro CRÍTICO no handleConectar:', error);
    throw error;
  }
}

export async function handleIntegrationsStatus(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;
  const integrations = await getAllIntegrations(telegramId);
  const providers = ['gmail', 'drive', 'calendar', 'sheets', 'notion', 'github'];

  let message = '🔌 *Suas Integrações:*\n\n';
  for (const provider of providers) {
    if (integrations[provider]) {
      const date = new Date(integrations[provider].connectedAt).toLocaleDateString('pt-BR');
      message += `✅ *${capitalize(provider)}* — conectado em ${date}\n`;
    } else {
      message += `⬜ *${capitalize(provider)}* — não conectado\n`;
    }
  }
  message += '\n💡 Use /conectar para gerenciar suas integrações.';

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

export async function handleDisconnect(ctx: Context): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : '';
  const parts = text.split(' ');
  const provider = parts[1]?.toLowerCase();

  if (!provider) {
    await ctx.reply('⚠️ Use: `/desconectar <serviço>`\n\nServiços: `gmail`, `drive`, `calendar`, `sheets`, `notion`, `github`', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const { removeIntegration } = await import('../db/firebase.js');
    await removeIntegration(ctx.from!.id, provider);
    await ctx.reply(`✅ *${capitalize(provider)}* desconectado com sucesso!`, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro ao desconectar: ${error.message}`);
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { JWT_SECRET };
