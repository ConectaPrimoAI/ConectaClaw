/**
 * notion.ts
 * Integração com Notion API (OAuth2)
 */

import axios from 'axios';
import {
  getIntegration,
  saveIntegration,
  updateTokens,
  IntegrationData,
} from '../db/firebase.js';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ── OAuth2 ─────────────────────────────────────────────────

/**
 * Gera URL de autorização Notion
 */
export function generateNotionAuthUrl(telegramId: number): string {
  const state = Buffer.from(
    JSON.stringify({ 
      telegram_id: telegramId, 
      ts: Date.now(),
      salt: process.env.JWT_SECRET?.substring(0, 8) || 'claw'
    })
  ).toString('base64url');

  const params = new URLSearchParams({
    client_id: process.env.NOTION_CLIENT_ID!,
    redirect_uri: process.env.NOTION_REDIRECT_URI!,
    response_type: 'code',
    owner: 'user',
    state,
  });

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
}

/**
 * Decodifica o state do callback Notion
 */
export function resolveNotionState(state: string): {
  telegram_id: number;
  ts: number;
} {
  return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
}

/**
 * Troca código de autorização por tokens Notion
 */
export async function exchangeNotionCode(code: string): Promise<{
  access_token: string;
  workspace_id: string;
  workspace_name: string;
  bot_id: string;
  owner: any;
  duplicated_template_id: string | null;
}> {
  const credentials = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const res = await axios.post(
      'https://api.notion.com/v1/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.data;
  } catch (error: any) {
    console.error('❌ [Notion] Erro na troca de código:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Salva a conexão Notion no Firebase
 */
export async function saveNotionConnection(
  telegramId: number,
  tokenData: {
    access_token: string;
    workspace_id: string;
    workspace_name: string;
    bot_id: string;
    owner: any;
  }
): Promise<void> {
  const data: IntegrationData = {
    provider: 'notion',
    accessToken: tokenData.access_token,
    connectedAt: Date.now(),
    updatedAt: Date.now(),
    extra: {
      workspace_id: tokenData.workspace_id,
      workspace_name: tokenData.workspace_name,
      bot_id: tokenData.bot_id,
      owner: tokenData.owner,
    },
  };

  await saveIntegration(telegramId, 'notion', data);
}

/**
 * Obtém o access token do Notion (não expira, mas mantemos a interface)
 */
export async function getNotionToken(telegramId: number): Promise<string> {
  const integration = await getIntegration(telegramId, 'notion');
  if (!integration) {
    throw new Error(`Notion não conectado para o usuário ${telegramId}`);
  }
  return integration.accessToken;
}

// ── Notion API ─────────────────────────────────────────────

async function notionRequest(
  telegramId: number,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: any
): Promise<any> {
  const token = await getNotionToken(telegramId);

  const res = await axios({
    method,
    url: `${NOTION_API_BASE}${endpoint}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    data: body,
  });

  return res.data;
}

/**
 * Lista páginas/bancos de dados compartilhados com a integração
 */
export async function listNotionPages(
  telegramId: number,
  filter?: any,
  pageSize: number = 20
): Promise<any> {
  return notionRequest(telegramId, 'POST', '/search', {
    filter: filter || { property: 'object', value: 'page' },
    page_size: pageSize,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  });
}

/**
 * Busca conteúdo de uma página
 */
export async function getNotionPageContent(
  telegramId: number,
  pageId: string
): Promise<any> {
  return notionRequest(telegramId, 'GET', `/blocks/${pageId}/children`);
}

/**
 * Cria uma página no Notion
 */
export async function createNotionPage(
  telegramId: number,
  parentId: string,
  title: string,
  content?: string
): Promise<any> {
  const children: any[] = [];

  if (content) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content } }],
      },
    });
  }

  return notionRequest(telegramId, 'POST', '/pages', {
    parent: { page_id: parentId },
    properties: {
      title: {
        title: [{ text: { content: title } }],
      },
    },
    children,
  });
}

/**
 * Query em um banco de dados do Notion
 */
export async function queryNotionDatabase(
  telegramId: number,
  databaseId: string,
  filter?: any,
  sorts?: any[]
): Promise<any> {
  return notionRequest(telegramId, 'POST', `/databases/${databaseId}/query`, {
    filter,
    sorts,
    page_size: 20,
  });
}

/**
 * Obtém info do workspace
 */
export async function getNotionWorkspace(telegramId: number): Promise<any> {
  const integration = await getIntegration(telegramId, 'notion');
  return integration?.extra || {};
}
