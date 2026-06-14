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
import { getPermissionScopes } from '../db/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
// No Render (e em qualquer PaaS), PORT e a porta publica que o proxy reverso
// do provider roteia para o app. Se escutarmos outra porta (ex.: WEBAPP_PORT=3001),
// o trafego externo NAO chega ate la e os callbacks OAuth quebram com timeout.
// Por isso priorizamos PORT (definida automaticamente pelo Render) e s� caimos
// para WEBAPP_PORT/3001 em ambiente local de desenvolvimento.
const PORT = parseInt(process.env.PORT || process.env.WEBAPP_PORT || '3001', 10);
if (process.env.PORT && process.env.WEBAPP_PORT && process.env.PORT !== process.env.WEBAPP_PORT) {
  console.warn(`[boot] PORT=${process.env.PORT} difere de WEBAPP_PORT=${process.env.WEBAPP_PORT}. Usando PORT para o listen publico.`);
}

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

    // Traduz o erro "PERMISSION_DENIED / Cloud Firestore API has not been used"
    // em uma mensagem que o painel sabe mostrar e que indica o que fazer.
    const raw = String(error?.message || error);
    let friendly = `Falha ao carregar conexões: ${raw}`;
    if (/PERMISSION_DENIED/i.test(raw) || /Cloud Firestore API has not been used/i.test(raw)) {
      friendly = 'O Cloud Firestore não está habilitado (ou a Service Account não tem acesso) no projeto Firebase. Acesse console.firebase.google.com → seu projeto → Firestore Database → "Criar banco de dados" e habilite a API Cloud Firestore no Google Cloud Console do mesmo projeto.';
    } else if (/Could not load the default credentials/i.test(raw)) {
      friendly = 'Credenciais do Firebase Admin não encontradas. Configure FIREBASE_SERVICE_ACCOUNT (JSON completo) ou FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL + FIREBASE_PROJECT_ID no Render.';
    } else if (/private key/i.test(raw)) {
      friendly = 'A FIREBASE_PRIVATE_KEY está mal formatada. Ela precisa conter \\n nas quebras de linha e estar entre aspas duplas no .env do Render.';
    }
    res.status(500).json({ error: friendly, raw });
  }
});

// Handler unificado para Google (Gmail, Drive, Calendar, Sheets)
const googleAuthHandler = async (req: Request, res: Response) => {
  const { token, services, scopes } = req.body;
  // Força o provider a ser uma string para evitar erro TS2345 (string | string[])
  const provider = String(req.params.provider || 'google');
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });
  try {
    // Mapeia permissões granulares para escopos OAuth reais
    // Se o provider for um dos serviços Google, usamos ele para buscar os escopos
    const scopeProvider = ['gmail', 'drive', 'calendar', 'sheets'].includes(provider) ? provider : 'google';
    const selectedScopes = scopes || services || [];
    const oauthScopes = getPermissionScopes(scopeProvider, selectedScopes);
    
    // Para o Google, sempre enviamos o serviço atual na lista de services se não estiver lá
    const finalServices = services || [];
    if (['gmail', 'drive', 'calendar', 'sheets'].includes(provider) && !finalServices.includes(provider)) {
      finalServices.push(provider);
    }

    res.json({ url: generateGoogleAuthUrl(finalServices, decoded.telegram_id, oauthScopes) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

app.post('/api/auth/:provider/url', async (req, res, next) => {
  const provider = String(req.params.provider);
  if (['google', 'gmail', 'drive', 'calendar', 'sheets'].includes(provider)) {
    return googleAuthHandler(req, res);
  }
  next();
});

app.get('/oauth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  if (error) {
    const errStr = String(error);
    let friendly = `Falha na conexão com Google: ${errStr}`;
    // Erros mais comuns do OAuth do Google e o que o usuário precisa fazer.
    if (errStr === 'access_denied') {
      friendly = 'Você cancelou a autorização do Google. Tente novamente e clique em "Permitir" na tela do Google.';
    } else if (errStr === 'invalid_request' || errStr.includes('invalid_client')) {
      friendly = 'Configuração OAuth do Google inválida. Verifique GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI nas variáveis de ambiente do Render.';
    } else if (errStr.includes('unauthorized_client')) {
      friendly = 'O app Google não está autorizado para este redirect_uri. Adicione https://conectaclaw.onrender.com/oauth/google/callback em "Authorized redirect URIs" no Google Cloud Console.';
    }
    // 🔥 NOVO: Se for 403 (test user), oferecer modo bypass
    if (errStr === '403' || errStr.includes('access_denied')) {
      friendly = 'Google bloqueou a verificação. Tentando modo bypass com escopos reduzidos...';
      return res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(friendly)}&provider=google&bypass=true`);
    }
    return res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(friendly)}&provider=google`);
  }
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

    let friendly = `Falha na conexão com Google: ${errorMsg}`;
    const status = error.response?.status;
    if (status === 400 && /redirect_uri_mismatch/i.test(errorMsg)) {
      friendly = 'redirect_uri_mismatch: o redirect_uri enviado não bate com o cadastrado no Google Cloud. Atualize GOOGLE_REDIRECT_URI para https://conectaclaw.onrender.com/oauth/google/callback e cadastre o mesmo valor em "Authorized redirect URIs".';
    } else if (status === 403) {
      // 🔥 NOVO: Modo bypass para 403
      friendly = 'Google bloqueou a requisição (403). Tentando modo bypass com escopos reduzidos...';
      console.log('🔄 [Google OAuth] Ativando modo bypass para 403');
      return res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(friendly)}&provider=google&bypass=true`);
    } else if (/access_denied/i.test(errorMsg)) {
      friendly = 'Acesso negado pelo Google. Se o seu e-mail não foi adicionado como test user, o Google bloqueia a tela com "Acesso bloqueado: o app não concluiu o processo de verificação". Adicione-o em OAuth Consent Screen → Test users.';
    }
    res.redirect(`${baseUrl}/conectores.html?error=${encodeURIComponent(friendly)}&provider=google`);
  }
});

app.post('/api/auth/notion/url', async (req: Request, res: Response) => {
  const { token, scopes } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });
  try {
    const selectedScopes = scopes || [];
    const oauthScopes = getPermissionScopes('notion', selectedScopes);
    res.json({ url: generateNotionAuthUrl(decoded.telegram_id, oauthScopes) });
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
    const selectedScopes = scopes || [];
    const oauthScopes = getPermissionScopes('github', selectedScopes);
    res.json({ url: generateGitHubAuthUrl(decoded.telegram_id, oauthScopes) });
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
    console.log(`✅ [API] Desconectado: ${provider} para usuário ${decoded.telegram_id}`);
    res.json({ success: true, message: `${provider} desconectado com sucesso` });
  } catch (error: any) {
    console.error(`❌ [API] Erro ao desconectar ${provider}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 NOVO: Endpoint para atualizar permissões
app.post('/api/reconnect', async (req: Request, res: Response) => {
  const { token, provider, scopes } = req.body;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });

  try {
    console.log(`🔄 [API] Reconectando ${provider} com novas permissões para ${decoded.telegram_id}`);
    const { removeIntegration } = await import('../db/firebase.js');
    await removeIntegration(decoded.telegram_id, provider);
    
    // Gera nova URL de auth com escopos atualizados
    const selectedScopes = scopes || [];
    const oauthScopes = getPermissionScopes(provider, selectedScopes);
    
    let authUrl = '';
    if (['gmail', 'drive', 'calendar', 'sheets'].includes(provider)) {
      const { generateGoogleAuthUrl } = await import('../integrations/google.js');
      authUrl = generateGoogleAuthUrl([provider], decoded.telegram_id, oauthScopes);
    } else if (provider === 'notion') {
      const { generateNotionAuthUrl } = await import('../integrations/notion.js');
      authUrl = generateNotionAuthUrl(decoded.telegram_id, oauthScopes);
    } else if (provider === 'github') {
      const { generateGitHubAuthUrl } = await import('../integrations/github.js');
      authUrl = generateGitHubAuthUrl(decoded.telegram_id, oauthScopes);
    }
    
    res.json({ success: true, url: authUrl });
  } catch (error: any) {
    console.error(`❌ [API] Erro ao reconectar ${provider}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 NOVO: Endpoint para consultar permissões ativas
app.get('/api/permissions', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  const provider = req.query.provider as string;
  const decoded = verifyUserToken(token || '');
  if (!decoded) return res.status(401).json({ error: 'Token inválido' });

  try {
    const { getIntegration } = await import('../db/firebase.js');
    const integration = await getIntegration(decoded.telegram_id, provider);
    
    if (!integration) {
      return res.json({ connected: false, scopes: [] });
    }
    
    const scopes = integration.scope ? integration.scope.split(',') : [];
    res.json({
      connected: true,
      provider,
      scopes,
      connectedAt: integration.connectedAt,
      updatedAt: integration.updatedAt
    });
  } catch (error: any) {
    console.error(`❌ [API] Erro ao buscar permissões:`, error);
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
