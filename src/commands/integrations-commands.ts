/**
 * integrations-commands.ts
 * Comandos que usam integrações conectadas (ex: /email, /agenda, /repo)
 */

import { Context } from 'telegraf';
import { hasIntegration } from '../db/firebase.js';
import * as google from '../integrations/google.js';
import * as notion from '../integrations/notion.js';
import * as github from '../integrations/github.js';

/**
 * /email — envia e-mail via Gmail
 */
export async function handleEmailCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'gmail'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o Gmail primeiro!\nUse /conectar para conectar.'
    );
  }

  const text = ctx.message?.text?.replace(/^\/email\s*/i, '').trim() || '';

  if (!text) {
    return ctx.reply(
      '📧 Uso: `/email destino@exemplo.com | Assunto | Corpo do e-mail`\n\n' +
        'Exemplo: `/email joao@email.com | Reunião | Vamos marcar uma reunião amanhã?`',
      { parse_mode: 'Markdown' }
    );
  }

  const parts = text.split('|').map((p) => p.trim());
  if (parts.length < 3) {
    return ctx.reply(
      '⚠️ Formato: `destino | assunto | corpo`\nSepare cada parte com |'
    );
  }

  const [to, subject, ...bodyParts] = parts;
  const body = bodyParts.join(' | ');

  try {
    await ctx.reply('📤 Enviando e-mail...');
    await google.sendGmail(telegramId, to, subject, body);
    await ctx.reply(`✅ E-mail enviado para *${to}*!`, {
      parse_mode: 'Markdown',
    });
  } catch (error: any) {
    await ctx.reply(`❌ Erro ao enviar e-mail: ${error.message}`);
  }
}

/**
 * /emails — lê e-mails não lidos
 */
export async function handleReadEmailsCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'gmail'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o Gmail primeiro!\nUse /conectar para conectar.'
    );
  }

  try {
    await ctx.reply('📥 Buscando e-mails...');
    const emails = await google.readGmail(telegramId, 'is:unread', 5);

    if (emails.length === 0) {
      return ctx.reply('📭 Nenhum e-mail não lido!');
    }

    let message = `📬 *${emails.length} e-mail(s) não lido(s):*\n\n`;
    for (const email of emails) {
      message += `📩 *${email.subject || '(sem assunto)'}*\n`;
      message += `   De: ${email.from}\n`;
      message += `   ${email.snippet || ''}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

/**
 * /agenda — mostra próximos eventos
 */
export async function handleAgendaCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'calendar'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o Google Calendar primeiro!\nUse /conectar para conectar.'
    );
  }

  try {
    await ctx.reply('📅 Buscando eventos...');
    const events = await google.listCalendarEvents(telegramId);

    if (events.length === 0) {
      return ctx.reply('📭 Nenhum evento próximo na agenda!');
    }

    let message = `📅 *Próximos eventos:*\n\n`;
    for (const event of events.slice(0, 10)) {
      const start = event.start?.dateTime || event.start?.date;
      const date = start ? new Date(start).toLocaleString('pt-BR') : 'Sem data';
      message += `🔹 *${event.summary || '(sem título)'}*\n`;
      message += `   📆 ${date}\n`;
      if (event.location) message += `   📍 ${event.location}\n`;
      message += '\n';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

/**
 * /arquivos — lista arquivos do Drive
 */
export async function handleArquivosCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'drive'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o Google Drive primeiro!\nUse /conectar para conectar.'
    );
  }

  try {
    await ctx.reply('📁 Buscando arquivos...');
    const files = await google.listDriveFiles(telegramId);

    if (files.length === 0) {
      return ctx.reply('📭 Nenhum arquivo encontrado!');
    }

    let message = `📁 *Seus arquivos recentes:*\n\n`;
    for (const file of files.slice(0, 10)) {
      const icon = getFileIcon(file.mimeType);
      message += `${icon} *${file.name}*\n`;
      if (file.modifiedTime) {
        message += `   📆 ${new Date(file.modifiedTime).toLocaleDateString('pt-BR')}\n`;
      }
      message += '\n';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

/**
 * /notion — lista páginas do Notion
 */
export async function handleNotionCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'notion'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o Notion primeiro!\nUse /conectar para conectar.'
    );
  }

  try {
    await ctx.reply('📝 Buscando páginas do Notion...');
    const result = await notion.listNotionPages(telegramId);

    const pages = result.results || [];
    if (pages.length === 0) {
      return ctx.reply('📭 Nenhuma página encontrada no Notion!');
    }

    let message = `📝 *Suas páginas do Notion:*\n\n`;
    for (const page of pages.slice(0, 10)) {
      const title =
        page.properties?.title?.title?.[0]?.plain_text ||
        page.properties?.Name?.title?.[0]?.plain_text ||
        '(sem título)';
      message += `📄 *${title}*\n`;
      if (page.last_edited_time) {
        message += `   ✏️ ${new Date(page.last_edited_time).toLocaleDateString('pt-BR')}\n`;
      }
      message += '\n';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

/**
 * /repo — lista repositórios do GitHub
 */
export async function handleRepoCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'github'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o GitHub primeiro!\nUse /conectar para conectar.'
    );
  }

  try {
    await ctx.reply('🐙 Buscando repositórios...');
    const repos = await github.listGitHubRepos(telegramId);

    if (repos.length === 0) {
      return ctx.reply('📭 Nenhum repositório encontrado!');
    }

    let message = `🐙 *Seus repositórios:*\n\n`;
    for (const repo of repos.slice(0, 10)) {
      message += `📦 *${repo.full_name}*\n`;
      message += `   ⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count}\n`;
      if (repo.description) {
        message += `   📝 ${repo.description}\n`;
      }
      message += '\n';
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

/**
 * /issues — lista issues de um repo
 */
export async function handleIssuesCommand(ctx: Context): Promise<void> {
  const telegramId = ctx.from!.id;

  if (!(await hasIntegration(telegramId, 'github'))) {
    return ctx.reply(
      '⚠️ Você precisa conectar o GitHub primeiro!\nUse /conectar para conectar.'
    );
  }

  const text = ctx.message?.text?.replace(/^\/issues\s*/i, '').trim() || '';

  if (!text || !text.includes('/')) {
    return ctx.reply(
      '🐙 Uso: `/issues owner/repo`\n\nExemplo: `/issues facebook/react`',
      { parse_mode: 'Markdown' }
    );
  }

  const [owner, repo] = text.split('/');

  try {
    await ctx.reply('🔍 Buscando issues...');
    const issues = await github.listGitHubIssues(telegramId, owner, repo);

    if (issues.length === 0) {
      return ctx.reply('📭 Nenhuma issue aberta!');
    }

    let message = `🐙 *Issues abertas em ${owner}/${repo}:*\n\n`;
    for (const issue of issues.slice(0, 10)) {
      message += `#${issue.number} *${issue.title}*\n`;
      message += `   👤 ${issue.user?.login} | 💬 ${issue.comments}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } catch (error: any) {
    await ctx.reply(`❌ Erro: ${error.message}`);
  }
}

// ── Helpers ────────────────────────────────────────────────

function getFileIcon(mimeType: string): string {
  if (mimeType?.includes('folder')) return '📁';
  if (mimeType?.includes('pdf')) return '📕';
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('sheet'))
    return '📊';
  if (mimeType?.includes('presentation') || mimeType?.includes('slide'))
    return '📽️';
  if (mimeType?.includes('image')) return '🖼️';
  if (mimeType?.includes('video')) return '🎬';
  if (mimeType?.includes('audio')) return '🎵';
  return '📄';
}
