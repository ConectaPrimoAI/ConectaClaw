/**
 * github.ts
 * Integração com GitHub API (OAuth2)
 */

import axios from 'axios';
import {
  getIntegration,
  saveIntegration,
  updateTokens,
  IntegrationData,
} from '../db/firebase.js';

const GITHUB_API_BASE = 'https://api.github.com';

// ── OAuth2 ─────────────────────────────────────────────────

/**
 * Gera URL de autorizacao GitHub
 */
export function generateGitHubAuthUrl(
  telegramId: number,
  scopes?: string[]
): string {
  const state = Buffer.from(
    JSON.stringify({ 
      telegram_id: telegramId, 
      ts: Date.now(),
      salt: process.env.JWT_SECRET?.substring(0, 8) || 'claw'
    })
  ).toString('base64url');

  // Se escopos nao foram fornecidos, usa os padrao
  const finalScopes = scopes && scopes.length > 0 ? scopes : ['repo', 'read:user', 'notifications'];

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    redirect_uri: process.env.GITHUB_REDIRECT_URI!,
    scope: finalScopes.join(' '),
    state,
  });

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Decodifica o state do callback GitHub
 */
export function resolveGitHubState(state: string): {
  telegram_id: number;
  ts: number;
} {
  return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
}

/**
 * Troca código de autorização por token GitHub
 */
export async function exchangeGitHubCode(code: string): Promise<{
  access_token: string;
  token_type: string;
  scope: string;
}> {
  try {
    const res = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI,
      },
      {
        headers: { Accept: 'application/json' },
      }
    );

    if (res.data.error) {
      console.error('❌ [GitHub OAuth] Erro retornado pelo GitHub:', res.data);
      throw new Error(res.data.error_description || res.data.error);
    }

    return res.data;
  } catch (error: any) {
    console.error('❌ [GitHub] Erro na troca de código:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Salva a conexão GitHub no Firebase
 */
export async function saveGitHubConnection(
  telegramId: number,
  tokenData: {
    access_token: string;
    token_type: string;
    scope: string;
  }
): Promise<void> {
  const data: IntegrationData = {
    provider: 'github',
    accessToken: tokenData.access_token,
    scope: tokenData.scope,
    connectedAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveIntegration(telegramId, 'github', data);
}

/**
 * Obtém o access token do GitHub
 */
export async function getGitHubToken(telegramId: number): Promise<string> {
  const integration = await getIntegration(telegramId, 'github');
  if (!integration) {
    throw new Error(`GitHub não conectado para o usuário ${telegramId}`);
  }
  return integration.accessToken;
}

// ── GitHub API ─────────────────────────────────────────────

async function githubRequest(
  telegramId: number,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: any
): Promise<any> {
  const token = await getGitHubToken(telegramId);

  const res = await axios({
    method,
    url: `${GITHUB_API_BASE}${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    data: body,
  });

  return res.data;
}

/**
 * Obtém info do usuário autenticado
 */
export async function getGitHubUser(telegramId: number): Promise<any> {
  return githubRequest(telegramId, 'GET', '/user');
}

/**
 * Lista repositórios do usuário
 */
export async function listGitHubRepos(
  telegramId: number,
  sort: string = 'updated',
  perPage: number = 20
): Promise<any[]> {
  return githubRequest(
    telegramId,
    'GET',
    `/user/repos?sort=${sort}&per_page=${perPage}&affiliation=owner,collaborator`
  );
}

/**
 * Lista issues de um repositório
 */
export async function listGitHubIssues(
  telegramId: number,
  owner: string,
  repo: string,
  state: string = 'open',
  perPage: number = 10
): Promise<any[]> {
  return githubRequest(
    telegramId,
    'GET',
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}`
  );
}

/**
 * Cria uma issue
 */
export async function createGitHubIssue(
  telegramId: number,
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[]
): Promise<any> {
  return githubRequest(telegramId, 'POST', `/repos/${owner}/${repo}/issues`, {
    title,
    body,
    labels,
  });
}

/**
 * Lista Pull Requests
 */
export async function listGitHubPRs(
  telegramId: number,
  owner: string,
  repo: string,
  state: string = 'open'
): Promise<any[]> {
  return githubRequest(
    telegramId,
    'GET',
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=10`
  );
}

/**
 * Cria um Pull Request
 */
export async function createGitHubPR(
  telegramId: number,
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string
): Promise<any> {
  return githubRequest(telegramId, 'POST', `/repos/${owner}/${repo}/pulls`, {
    title,
    head,
    base,
    body,
  });
}

/**
 * Lista notificações
 */
export async function listGitHubNotifications(
  telegramId: number,
  all: boolean = false
): Promise<any[]> {
  return githubRequest(
    telegramId,
    'GET',
    `/notifications?all=${all}&per_page=10`
  );
}

/**
 * Obtém conteúdo de um arquivo do repo
 */
export async function getGitHubFileContent(
  telegramId: number,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<any> {
  const endpoint = `/repos/${owner}/${repo}/contents/${path}${
    ref ? `?ref=${ref}` : ''
  }`;
  return githubRequest(telegramId, 'GET', endpoint);
}
