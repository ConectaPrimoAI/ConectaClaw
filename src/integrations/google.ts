/**
 * google.ts
 * Integração com Google APIs (Gmail, Drive, Calendar, Sheets) + Refresh Token
 */

import { google } from 'googleapis';
import axios from 'axios';
import {
  getIntegration,
  updateTokens,
  saveIntegration,
  IntegrationData,
} from '../db/firebase.js';
import { GOOGLE_SCOPES } from './types.js';
import { addLog } from '../web-terminal.js';

const SENSITIVE_SCOPES = new Set<string>([
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.full',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
]);

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function generateGoogleAuthUrl(
  services: string[],
  telegramId: number,
  oauthScopes?: string[]
): string {
  const oauth2Client = createOAuth2Client();
  let scopes: string[] = [];

  if (oauthScopes && oauthScopes.length > 0) {
    scopes = oauthScopes;
  } else {
    for (const service of services) {
      const key = service as keyof typeof GOOGLE_SCOPES;
      if (GOOGLE_SCOPES[key]) {
        scopes.push(...GOOGLE_SCOPES[key]);
      }
    }

    if (scopes.length === 0) {
      scopes.push(
        ...GOOGLE_SCOPES.gmail,
        ...GOOGLE_SCOPES.drive,
        ...GOOGLE_SCOPES.calendar,
        ...GOOGLE_SCOPES.sheets
      );
    }
  }

  if (!scopes.includes('openid') && !scopes.includes('https://www.googleapis.com/auth/userinfo.email')) {
    scopes.unshift('openid', 'https://www.googleapis.com/auth/userinfo.email');
  }

  const hasSensitive = scopes.some(s => SENSITIVE_SCOPES.has(s));
  if (hasSensitive) {
    console.warn(
      `[google] ⚠️ Pedindo escopos sensíveis que exigem app verificado ou test user: ` +
      scopes.filter(s => SENSITIVE_SCOPES.has(s)).join(', ')
    );
  }

  const state = Buffer.from(
    JSON.stringify({
      telegram_id: telegramId,
      services,
      ts: Date.now(),
      salt: process.env.JWT_SECRET?.substring(0, 8) || 'claw'
    })
  ).toString('base64url');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state,
    include_granted_scopes: true,
  });
}

export function resolveGoogleState(state: string): {
  telegram_id: number;
  services: string[];
  ts: number;
} {
  return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
}

export async function exchangeGoogleCode(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
}> {
  try {
    const oauth2Client = createOAuth2Client();
    // Adicionando timeout via axios internamente se possível ou usando o padrão do oauth2Client
    const { tokens } = await oauth2Client.getToken({ code, opts: { timeout: 15000 } } as any);

    if (!tokens.access_token) {
      throw new Error('Google não retornou um access_token válido.');
    }

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
      scope: tokens.scope ?? undefined,
    };
  } catch (error: any) {
    console.error('❌ [Google OAuth] Erro na troca de código:', error.response?.data || error.message);
    throw error;
  }
}

export async function getValidAccessToken(
  telegramId: number,
  provider: string = 'google'
): Promise<string> {
  const integration = await getIntegration(telegramId, provider);

  if (!integration) {
    throw new Error(`Integração ${provider} não encontrada para o usuário ${telegramId}`);
  }

  const now = Date.now();
  const isExpired = integration.tokenExpiry && integration.tokenExpiry <= now;

  if (isExpired && integration.refreshToken) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      await updateTokens(
        telegramId,
        provider,
        credentials.access_token!,
        credentials.refresh_token ?? integration.refreshToken,
        credentials.expiry_date ?? undefined
      );

      return credentials.access_token!;
    } catch (error: any) {
      addLog(`❌ Falha ao refresh token ${provider} para ${telegramId}: ${error.message}`);
      throw new Error(`Falha ao atualizar acesso do Google. Por favor, conecte novamente via /conectar.`);
    }
  }

  return integration.accessToken;
}

export async function saveGoogleConnection(
  telegramId: number,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
    scope?: string;
  },
  services: string[]
): Promise<void> {
  const data: IntegrationData = {
    provider: 'google',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: tokens.expiry_date,
    scope: tokens.scope || services.join(','),
    connectedAt: Date.now(),
    updatedAt: Date.now(),
    extra: { services },
  };

  for (const service of services) {
    await saveIntegration(telegramId, service, {
      ...data,
      provider: service,
    });
  }

  await saveIntegration(telegramId, 'google', data);
}

// ── Gmail ──────────────────────────────────────────────────

export async function sendGmail(
  telegramId: number,
  to: string,
  subject: string,
  body: string
): Promise<any> {
  try {
    const token = await getValidAccessToken(telegramId, 'gmail');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return res.data;
  } catch (error: any) {
    addLog(`❌ Erro sendGmail: ${error.message}`);
    throw error;
  }
}

export async function readGmail(
  telegramId: number,
  query: string = 'is:unread',
  maxResults: number = 10
): Promise<any[]> {
  try {
    const token = await getValidAccessToken(telegramId, 'gmail');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });

    if (!listRes.data.messages) return [];

    const messages = await Promise.all(
      listRes.data.messages.map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
        });

        const headers = detail.data.payload?.headers || [];
        const from = headers.find((h) => h.name === 'From')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        return {
          id: msg.id,
          from,
          subject,
          date,
          snippet: detail.data.snippet,
        };
      })
    );

    return messages;
  } catch (error: any) {
    addLog(`❌ Erro readGmail: ${error.message}`);
    throw error;
  }
}

// ── Google Drive ───────────────────────────────────────────

export async function listDriveFiles(
  telegramId: number,
  query?: string,
  pageSize: number = 20
): Promise<any[]> {
  try {
    const token = await getValidAccessToken(telegramId, 'drive');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const res = await drive.files.list({
      q: query,
      pageSize,
      fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
      orderBy: 'modifiedTime desc',
    });

    return res.data.files || [];
  } catch (error: any) {
    addLog(`❌ Erro listDriveFiles: ${error.message}`);
    throw error;
  }
}

export async function uploadDriveFile(
  telegramId: number,
  name: string,
  mimeType: string,
  content: Buffer | string
): Promise<any> {
  try {
    const token = await getValidAccessToken(telegramId, 'drive');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const res = await drive.files.create({
      requestBody: { name, mimeType },
      media: { mimeType, body: typeof content === 'string' ? undefined : require('stream').Readable.from(content) },
    });

    return res.data;
  } catch (error: any) {
    addLog(`❌ Erro uploadDriveFile: ${error.message}`);
    throw error;
  }
}

// ── Google Calendar ────────────────────────────────────────

export async function listCalendarEvents(
  telegramId: number,
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 10
): Promise<any[]> {
  try {
    const token = await getValidAccessToken(telegramId, 'calendar');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax,
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return res.data.items || [];
  } catch (error: any) {
    addLog(`❌ Erro listCalendarEvents: ${error.message}`);
    throw error;
  }
}

export async function createCalendarEvent(
  telegramId: number,
  summary: string,
  start: string,
  end: string,
  description?: string
): Promise<any> {
  try {
    const token = await getValidAccessToken(telegramId, 'calendar');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: start, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: end, timeZone: 'America/Sao_Paulo' },
      },
    });

    return res.data;
  } catch (error: any) {
    addLog(`❌ Erro createCalendarEvent: ${error.message}`);
    throw error;
  }
}

// ── Google Sheets ──────────────────────────────────────────

export async function readSheet(
  telegramId: number,
  spreadsheetId: string,
  range: string
): Promise<any[][]> {
  try {
    const token = await getValidAccessToken(telegramId, 'sheets');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return (res.data.values as any[][]) || [];
  } catch (error: any) {
    addLog(`❌ Erro readSheet: ${error.message}`);
    throw error;
  }
}

export async function writeSheet(
  telegramId: number,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<any> {
  try {
    const token = await getValidAccessToken(telegramId, 'sheets');
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: token });

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const res = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return res.data;
  } catch (error: any) {
    addLog(`❌ Erro writeSheet: ${error.message}`);
    throw error;
  }
}
