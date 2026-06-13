/**
 * server.ts
 * Servidor Express para OAuth callbacks e API do painel web
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Imports das integrações
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
// No Render, PORT é a porta pública.
const PORT = parseInt(process.env.PORT || process.env.WEBAPP_PORT || '3001');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════════════
// SERVIR ARQUIVOS ESTÁTICOS
// ═══════════════════════════════════════════════════════════

const publicDir = path.join(process.cwd(), 'public');

// ═══════════════════════════════════════════════════════════
// ROTA EXPLÍCITA PARA CONECTORES.HTML E REDIRECTS
// ═══════════════════════════════════════════════════════════

app.get('/conectores.html', (req: Request, res: Response) => {
  const filePath = path.join(publicDir, 'conectores.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('<h1>❌ Arquivo conectores.html não encontrado</h1>');
  }
});

app.get('/', (req: Request, res: Response) => {
  res.redirect('/conectores.html');
});

// Servir outros estáticos da pasta public
app.use(express.static(publicDir));

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    service: 'ConectaClaw',
    timestamp: Date.now()
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
  if (!decoded) {
    console.warn('⚠️ [API] Tentativa de acesso às conexões com token inválido');
    return res.status(401).json({ error: 'Sua sessão expirou ou o link é inválido. Por favor, gere um novo link no Telegram.' });
  }

  try {
    console.log(`🔍 [API] Buscando conexões para usuário ${decoded.telegram_id}`);
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
    console.error(`❌ [API] Erro ao buscar conexões para ${decoded.telegram_id}:`, error);
    res.status(500).json({ error: `Falha ao carregar conexões: ${error.message}` });
  }
});

app.post('/api/auth/google/url', async (req: Request, res: Response) => {
  const { token, services } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });
  try {
    res.json({ url: generateGoogleAuthUrl(services || [], decoded.telegram_id) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/oauth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  if (error) return res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(String(error))}&provider=google`);
  if (!code || !state) {
    console.error('❌ [Google OAuth] Código ou state ausente:', { code: !!code, state: !!state });
    return res.status(400).send('Erro: Código de autorização ou estado de segurança ausente.');
  }

  try {
    console.log('🔄 [Google OAuth] Iniciando troca de código...');
    const stateData = resolveGoogleState(String(state));
    console.log(`👤 [Google OAuth] Usuário: ${stateData.telegram_id}, Serviços: ${stateData.services.join(', ')}`);
    
    const tokens = await exchangeGoogleCode(String(code));
    console.log('✅ [Google OAuth] Tokens obtidos com sucesso');
    
    await saveGoogleConnection(stateData.telegram_id, tokens, stateData.services);
    notifyTelegram(stateData.telegram_id, stateData.services);
    
    res.redirect(`${baseUrl}/conectores.html?success=true&provider=google&services=${stateData.services.join(',')}`);
  } catch (error: any) {
    const errorMsg = error.response?.data?.error_description || error.message;
    console.error('❌ [Google OAuth] Erro no callback:', {
      message: error.message,
      details: error.response?.data,
      stack: error.stack
    });
    res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(`Falha na conexão com Google: ${errorMsg}`)}&provider=google`);
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
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  if (error) return res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(String(error))}&provider=notion`);
  if (!code || !state) {
    console.error('❌ [Notion OAuth] Código ou state ausente:', { code: !!code, state: !!state });
    return res.status(400).send('Erro: Código de autorização ou estado de segurança ausente.');
  }

  try {
    console.log('🔄 [Notion OAuth] Iniciando troca de código...');
    const stateData = resolveNotionState(String(state));
    console.log(`👤 [Notion OAuth] Usuário: ${stateData.telegram_id}`);
    
    const tokenData = await exchangeNotionCode(String(code));
    console.log('✅ [Notion OAuth] Tokens obtidos com sucesso');
    
    await saveNotionConnection(stateData.telegram_id, tokenData);
    notifyTelegram(stateData.telegram_id, ['notion']);
    
    res.redirect(`${baseUrl}/conectores.html?success=true&provider=notion`);
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message;
    console.error('❌ [Notion OAuth] Erro no callback:', {
      message: error.message,
      details: error.response?.data,
      stack: error.stack
    });
    res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(`Falha na conexão com Notion: ${errorMsg}`)}&provider=notion`);
  }
});

app.post('/api/auth/github/url', async (req: Request, res: Response) => {
  const { token, scopes } = req.body;
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
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  if (error) return res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(String(error))}&provider=github`);
  if (!code || !state) {
    console.error('❌ [GitHub OAuth] Código ou state ausente:', { code: !!code, state: !!state });
    return res.status(400).send('Erro: Código de autorização ou estado de segurança ausente.');
  }

  try {
    console.log('🔄 [GitHub OAuth] Iniciando troca de código...');
    const stateData = resolveGitHubState(String(state));
    console.log(`👤 [GitHub OAuth] Usuário: ${stateData.telegram_id}`);
    
    const tokenData = await exchangeGitHubCode(String(code));
    console.log('✅ [GitHub OAuth] Tokens obtidos com sucesso');
    
    await saveGitHubConnection(stateData.telegram_id, tokenData);
    notifyTelegram(stateData.telegram_id, ['github']);
    
    res.redirect(`${baseUrl}/conectores.html?success=true&provider=github`);
  } catch (error: any) {
    const errorMsg = error.response?.data?.error_description || error.message;
    console.error('❌ [GitHub OAuth] Erro no callback:', {
      message: error.message,
      details: error.response?.data,
      stack: error.stack
    });
    res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(`Falha na conexão com GitHub: ${errorMsg}`)}&provider=github`);
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

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÃO TELEGRAM
// ═══════════════════════════════════════════════════════════

async function notifyTelegram(telegramId: number, services: string[]) {
  try {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) {
      console.warn('⚠️ [Telegram] Notificação ignorada: TELEGRAM_TOKEN não configurado.');
      return;
    }
    const serviceNames = services.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    const message = `✅ *${serviceNames}* conectado${services.length > 1 ? 's' : ''} com sucesso!`;
    
    console.log(`📤 [Telegram] Enviando notificação para ${telegramId}...`);
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramId, text: message, parse_mode: 'Markdown' }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [Telegram] Falha ao enviar notificação:', errorData);
    } else {
      console.log('✅ [Telegram] Notificação enviada com sucesso');
    }
  } catch (error) {
    console.error('❌ [Telegram] Erro crítico ao notificar:', error);
  }
}

// ═══════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════

export function startWebApp(): any {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 WebApp rodando na porta ${PORT}`);
  });
  return server;
}

export { app };
