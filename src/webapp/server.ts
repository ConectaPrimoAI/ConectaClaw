/**
 * server.ts
 * Servidor Express para OAuth callbacks e API do painel web
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  generateGoogleAuthUrl, exchangeGoogleCode, resolveGoogleState, saveGoogleConnection,
} from '../integrations/google.js';
import {
  generateNotionAuthUrl, exchangeNotionCode, resolveNotionState, saveNotionConnection,
} from '../integrations/notion.js';
import {
  generateGitHubAuthUrl, exchangeGitHubCode, resolveGitHubState, saveGitHubConnection,
} from '../integrations/github.js';
import { getAllIntegrations } from '../db/firebase.js';
import { verifyUserToken } from '../commands/connect.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
const PORT = parseInt(process.env.WEBAPP_PORT || '3001');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════════════
// ENCONTRAR PASTA PUBLIC - MÚLTIPLOS CAMINHOS
// ═══════════════════════════════════════════════════════════

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' DEBUG: Procurando pasta public/');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📍 __dirname: ${__dirname}`);
console.log(`📍 process.cwd(): ${process.cwd()}`);

const possiblePaths = [
  path.join(process.cwd(), 'public'),
  path.join(__dirname, '..', '..', 'public'),
  path.join(__dirname, '..', 'public'),
  path.join(process.cwd(), 'dist', 'public'),
  path.join(__dirname, 'public'),
];
let publicDir = '';
for (const p of possiblePaths) {
  const exists = fs.existsSync(p);
  console.log(`  ${exists ? '✅' : '❌'} ${p}`);
  if (exists && !publicDir) {
    publicDir = p;
  }
}

if (!publicDir) {
  console.error('❌ ERRO: Pasta public/ não encontrada!');
  console.error('💡 Verifique se public/connectors.html existe no repositório');
} else {
  console.log(`✅ Usando: ${publicDir}`);
  app.use(express.static(publicDir));
}

// ══════════════════════════════════════════════════════════
// ROTAS EXPLÍCITAS PARA HTML
// ═══════════════════════════════════════════════════════════

app.get('/conectores.html', (req: Request, res: Response) => {
  const filePath = path.join(publicDir || process.cwd(), 'connectors.html');
  console.log(`🔍 Tentando servir: ${filePath}`);
  
  if (fs.existsSync(filePath)) {
    console.log(`✅ Servindo connectors.html de: ${filePath}`);
    res.sendFile(filePath);
  } else {
    console.error(`❌ Arquivo não encontrado: ${filePath}`);
    res.status(404).send(`
      <h1>❌ Arquivo não encontrado</h1>
      <p>Caminho: ${filePath}</p>
      <p>Public dir: ${publicDir || 'não definido'}</p>
    `);
  }
});

app.get('/', (req: Request, res: Response) => {
  res.redirect('/conectores.html');
});

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'ConectaClaw',     timestamp: Date.now(),
    publicDir: publicDir || 'não encontrado'
  });
});

app.get('/api/verify', (req: Request, res: Response) => {
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

app.get('/api/connections', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });

  try {
    const integrations = await getAllIntegrations(decoded.telegram_id);
    const status: Record<string, { connected: boolean; connectedAt?: number; scope?: string }> = {};
    const providers = ['gmail', 'drive', 'calendar', 'sheets', 'notion', 'github'];
    
    for (const p of providers) {
      status[p] = integrations[p] 
        ? { connected: true, connectedAt: integrations[p].connectedAt, scope: integrations[p].scope }
        : { connected: false };
    }
    res.json({ telegram_id: decoded.telegram_id, integrations: status });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/google/url', async (req: Request, res: Response) => {
  const { token, services } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });
  try {
    res.json({ url: generateGoogleAuthUrl(services || [], decoded.telegram_id) });
  } catch (error: any) {    res.status(500).json({ error: error.message });
  }
});

app.get('/oauth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`https://conectaclaw.onrender.com/conectores.html?error=${encodeURIComponent(String(error))}&provider=google`);
  if (!code || !state) return res.status(400).send('Código ou state ausente');

  try {
    const stateData = resolveGoogleState(String(state));
    const tokens = await exchangeGoogleCode(String(code));
    await saveGoogleConnection(stateData.telegram_id, tokens, stateData.services);
    notifyTelegram(stateData.telegram_id, stateData.services);
    res.redirect(`https://conectaclaw.onrender.com/conectores.html?success=true&provider=google&services=${stateData.services.join(',')}`);
  } catch (error: any) {
    console.error('Erro no callback Google:', error);
    res.redirect(`https://conectaclaw.onrender.com/conectores.html?error=${encodeURIComponent(error.message)}&provider=google`);
  }
});

app.post('/api/auth/notion/url', async (req: Request, res: Response) => {
  const { token } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });
  try {
    res.json({ url: generateNotionAuthUrl(decoded.telegram_id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/oauth/notion/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`https://conectaclaw.onrender.com/conectores.html?error=${encodeURIComponent(String(error))}&provider=notion`);
  if (!code || !state) return res.status(400).send('Código ou state ausente');

  try {
    const stateData = resolveNotionState(String(state));
    const tokenData = await exchangeNotionCode(String(code));
    await saveNotionConnection(stateData.telegram_id, tokenData);
    notifyTelegram(stateData.telegram_id, ['notion']);
    res.redirect(`https://conectaclaw.onrender.com/conectores.html?success=true&provider=notion`);
  } catch (error: any) {
    console.error('Erro no callback Notion:', error);
    res.redirect(`https://conectaclaw.onrender.com/conectores.html?error=${encodeURIComponent(error.message)}&provider=notion`);
  }
});

app.post('/api/auth/github/url', async (req: Request, res: Response) => {  const { token, scopes } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });
  try {
    res.json({ url: generateGitHubAuthUrl(decoded.telegram_id, scopes) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/oauth/github/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`https://conectaclaw.onrender.com/conectores.html?error=${encodeURIComponent(String(error))}&provider=github`);
  if (!code || !state) return res.status(400).send('Código ou state ausente');

  try {
    const stateData = resolveGitHubState(String(state));
    const tokenData = await exchangeGitHubCode(String(code));
    await saveGitHubConnection(stateData.telegram_id, tokenData);
    notifyTelegram(stateData.telegram_id, ['github']);
    res.redirect(`https://conectaclaw.onrender.com/conectores.html?success=true&provider=github`);
  } catch (error: any) {
    console.error('Erro no callback GitHub:', error);
    res.redirect(`https://conectaclaw.onrender.com/conectores.html?error=${encodeURIComponent(error.message)}&provider=github`);
  }
});

app.post('/api/disconnect', async (req: Request, res: Response) => {
  const { token, provider } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });

  try {
    const { removeIntegration } = await import('../db/firebase.js');
    await removeIntegration(decoded.telegram_id, provider);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function notifyTelegram(telegramId: number, services: string[]) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) return;
    const serviceNames = services.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    const message = `✅ *${serviceNames}* conectado${services.length > 1 ? 's' : ''} com sucesso!`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },      body: JSON.stringify({ chat_id: telegramId, text: message, parse_mode: 'Markdown' }),
    });
  } catch (error) {
    console.error('Erro ao notificar Telegram:', error);
  }
}

export function startWebApp(): void {
  app.listen(PORT, () => {
    console.log(`🌐 WebApp rodando na porta ${PORT}`);
    console.log(`   Painel: https://conectaclaw.onrender.com/conectores.html`);
  });
}

export { app };