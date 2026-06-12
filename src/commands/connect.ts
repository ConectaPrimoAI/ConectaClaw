/**
 * connect.ts
 * Handler do comando /conectar — gera JWT e envia botão para o painel web
 */

import { Context } from 'telegraf';
import jwt from 'jsonwebtoken';
import { getAllIntegrations } from '../db/firebase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';
const JWT_EXPIRY = '10m';

export function generateUserToken(telegramId: number): string {
  return jwt.sign(
    {
      telegram_id: telegramId,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyUserToken(token: string): { telegram_id: number } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return { telegram_id: decoded.telegram_id };
  } catch {
    return null;
  }
}

export async function handleConectar(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;
  const firstName = ctx.from!.first_name || 'amigo';

  const token = generateUserToken(telegramId);
  const panelUrl = `https://conecta-primo-ai.vercel.app/conectores.html?token=${token}`;

  const integrations = await getAllIntegrations(telegramId);
  const connectedList = Object.keys(integrations);

  let statusText = '';
  if (connectedList.length > 0) {
    const names = connectedList
      .filter((k) => k !== 'google')
      .map((k: string) => `✅ ${capitalize(k)}`)
      .join(', ');
    if (names) {
      statusText = `\n\n📊 *Conectados:* ${names}`;
    }
  }

  await ctx.reply(
    `🦞 E aí, ${firstName}! Vou te conectar às suas ferramentas favoritas.\n\n` +
      `Clica no botão abaixo pra abrir o painel de conectores. Lá você escolhe o que liberar e conecta em segundos.\n\n` +
      `🔒 *Seguro:* Seus tokens ficam criptografados e você pode desconectar quando quiser.${statusText}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔌 Abrir Painel de Conectores',
              web_app: { url: panelUrl },
            },
          ],
          [
            {
              text: '🔗 Abrir no navegador',
              url: panelUrl,
            },
          ],
        ],
      },
    }
  );
}

export async function handleIntegrationsStatus(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;
  const integrations = await getAllIntegrations(telegramId);

  const providers = ['gmail', 'drive', 'calendar', 'sheets', 'notion', 'github'];

  let message = '🔌 *Suas Integrações:*\n\n';

  for (const provider of providers) {
    const data = integrations[provider];
    if (data) {
      const date = new Date(data.connectedAt).toLocaleDateString('pt-BR');
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
    await ctx.reply(
      '⚠️ Use: `/desconectar <serviço>`\n\n' +
        'Serviços disponíveis: `gmail`, `drive`, `calendar`, `sheets`, `notion`, `github`',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  try {
    const { removeIntegration } = await import('../db/firebase.js');
    await removeIntegration(ctx.from!.id, provider);
    await ctx.reply(`✅ *${capitalize(provider)}* desconectado com sucesso!`, {
      parse_mode: 'Markdown',
    });
  } catch (error: any) {
    await ctx.reply(`❌ Erro ao desconectar: ${error.message}`);
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { JWT_SECRET };
