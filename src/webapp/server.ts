/**
 * server.ts
 * Servidor Express para OAuth callbacks e API do painel web
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import {
  generateGoogleAuthUrl,
  exchangeGoogleCode,
  resolveGoogleState,
  saveGoogleConnection,
} from '../integrations/google.js';
import {
  generateNotionAuthUrl,
  exchangeNotionCode,
  resolveNotionState,
  saveNotionConnection,
} from '../integrations/notion.js';
import {
  generateGitHubAuthUrl,
  exchangeGitHubCode,
  resolveGitHubState,
  saveGitHubConnection,
} from '../integrations/github.js';
import { getAllIntegrations } from '../db/firebase.js';
import { verifyUserToken, JWT_SECRET } from '../commands/connect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.WEBAPP_PORT || '3001');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// ── Health check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ConectaClaw', timestamp: Date.now() });
});

// ── Verifica token JWT ─────────────────────────────────────
app.get('/api/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = req.query.token as string;

  const tokenToVerify = authHeader?.replace('Bearer ', '') || token;

  if (!tokenToVerify) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const decoded = verifyUserToken(tokenToVerify);
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  res.json({ valid: true, telegram_id: decoded.telegram_id });
});

// ── Status das integrações ─────────────────────────────────
app.get('/api/connections', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = req.query.token as string;
  const tokenToVerify = authHeader?.replace('Bearer ', '') || token;

  const decoded = verifyUserToken(tokenToVerify || '');
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const integrations = await getAllIntegrations(decoded.telegram_id);
    const status: Record<string, { connected: boolean; connectedAt?: number; scope?: string }> = {};

    const providers = ['gmail', 'drive', 'calendar', 'sheets', 'notion', 'github'];
    for (const p of providers) {
      if (integrations[p]) {
        status[p] = {
          connected: true,
          connectedAt: integrations[p].connectedAt,
          scope: integrations[p].scope,
        };
      } else {
        status[p] = { connected: false };
      }
    }

    res.json({ telegram_id: decoded.telegram_id, integrations: status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Gerar URL de auth Google ───────────────────────────────
app.post('/api/auth/google/url', async (req, res) => {
  const { token, services } = req.body;

  const decoded = verifyUserToken(token || '');
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const authUrl = generateGoogleAuthUrl(services || [], decoded.telegram_id);
    res.json({ url: authUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Callback OAuth Google ──────────────────────────────────
app.get('/oauth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?error=${encodeURIComponent(String(error))}&provider=google`
    );
  }

  if (!code || !state) {
    return res.status(400).send('Código ou state ausente');
  }

  try {
    const stateData = resolveGoogleState(String(state));
    const tokens = await exchangeGoogleCode(String(code));

    await saveGoogleConnection(stateData.telegram_id, tokens, stateData.services);

    // Notifica via Telegram (se possível)
    notifyTelegram(stateData.telegram_id, stateData.services);

    res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?success=true&provider=google&services=${stateData.services.join(',')}`
    );
  } catch (error: any) {
    console.error('Erro no callback Google:', error);
    res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?error=${encodeURIComponent(error.message)}&provider=google`
    );
  }
});

// ── Gerar URL de auth Notion ───────────────────────────────
app.post('/api/auth/notion/url', async (req, res) => {
  const { token } = req.body;

  const decoded = verifyUserToken(token || '');
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const authUrl = generateNotionAuthUrl(decoded.telegram_id);
    res.json({ url: authUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Callback OAuth Notion ──────────────────────────────────
app.get('/oauth/notion/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?error=${encodeURIComponent(String(error))}&provider=notion`
    );
  }

  if (!code || !state) {
    return res.status(400).send('Código ou state ausente');
  }

  try {
    const stateData = resolveNotionState(String(state));
    const tokenData = await exchangeNotionCode(String(code));

    await saveNotionConnection(stateData.telegram_id, tokenData);

    notifyTelegram(stateData.telegram_id, ['notion']);

    res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?success=true&provider=notion`
    );
  } catch (error: any) {
    console.error('Erro no callback Notion:', error);
    res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?error=${encodeURIComponent(error.message)}&provider=notion`
    );
  }
});

// ── Gerar URL de auth GitHub ───────────────────────────────
app.post('/api/auth/github/url', async (req, res) => {
  const { token, scopes } = req.body;

  const decoded = verifyUserToken(token || '');
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const authUrl = generateGitHubAuthUrl(decoded.telegram_id, scopes);
    res.json({ url: authUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Callback OAuth GitHub ──────────────────────────────────
app.get('/oauth/github/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?error=${encodeURIComponent(String(error))}&provider=github`
    );
  }

  if (!code || !state) {
    return res.status(400).send('Código ou state ausente');
  }

  try {
    const stateData = resolveGitHubState(String(state));
    const tokenData = await exchangeGitHubCode(String(code));

    await saveGitHubConnection(stateData.telegram_id, tokenData);

    notifyTelegram(stateData.telegram_id, ['github']);

    res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?success=true&provider=github`
    );
  } catch (error: any) {
    console.error('Erro no callback GitHub:', error);
    res.redirect(
      `https://conecta-primo-ai.vercel.app/conectores.html?error=${encodeURIComponent(error.message)}&provider=github`
    );
  }
});

// ── Desconectar integração ─────────────────────────────────
app.post('/api/disconnect', async (req, res) => {
  const { token, provider } = req.body;

  const decoded = verifyUserToken(token || '');
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const { removeIntegration } = await import('../db/firebase.js');
    await removeIntegration(decoded.telegram_id, provider);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Notificação Telegram ───────────────────────────────────
async function notifyTelegram(telegramId: number, services: string[]) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) return;

    const serviceNames = services.map(capitalize).join(', ');
    const message = `✅ *${serviceNames}* conectado${services.length > 1 ? 's' : ''} com sucesso!\n\nAgora você pode usar os comandos:\n${services
      .map((s) => getCommandHint(s))
      .join('\n')}`;

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch (error) {
    console.error('Erro ao notificar Telegram:', error);
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getCommandHint(service: string): string {
  const hints: Record<string, string> = {
    gmail: '• `/email` — enviar e-mails\n• `/emails` — ler não lidos',
    drive: '• `/arquivos` — listar arquivos',
    calendar: '• `/agenda` — ver próximos eventos',
    sheets: '• `/planilha` — ler planilhas',
    notion: '• `/notion` — buscar páginas',
    github: '• `/repo` — listar repositórios\n• `/issues` — ver issues',
  };
  return hints[service] || '';
}

// ── Inicia servidor ────────────────────────────────────────
export function startWebApp() {
  app.listen(PORT, () => {
    console.log(`🌐 WebApp rodando na porta ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
  });
  return app;
}

export { app };
