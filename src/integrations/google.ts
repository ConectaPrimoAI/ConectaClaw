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

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function generateGoogleAuthUrl(
  services: string[],
  telegramId: number
): string {
  const oauth2Client = createOAuth2Client();
  const scopes: string[] = [];

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

  const state = Buffer.from(
    JSON.stringify({ telegram_id: telegramId, services, ts: Date.now() })
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
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
  };
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
      throw new Error(`Falha ao refresh token: ${error.message}`);
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
}

export async function readGmail(
  telegramId: number,
  query: string = 'is:unread',
  maxResults: number = 10
): Promise<any[]> {
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
}

// ── Google Drive ───────────────────────────────────────────

export async function listDriveFiles(
  telegramId: number,
  query?: string,
  pageSize: number = 20
): Promise<any[]> {
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
}

export async function uploadDriveFile(
  telegramId: number,
  name: string,
  mimeType: string,
  content: Buffer | string
): Promise<any> {
  const token = await getValidAccessToken(telegramId, 'drive');
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: token });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const res = await drive.files.create({
    requestBody: { name, mimeType },
    media: { mimeType, body: typeof content === 'string' ? undefined : require('stream').Readable.from(content) },
  });

  return res.data;
}

// ── Google Calendar ────────────────────────────────────────

export async function listCalendarEvents(
  telegramId: number,
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 10
): Promise<any[]> {
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
}

export async function createCalendarEvent(
  telegramId: number,
  summary: string,
  start: string,
  end: string,
  description?: string
): Promise<any> {
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
}

// ── Google Sheets ──────────────────────────────────────────

export async function readSheet(
  telegramId: number,
  spreadsheetId: string,
  range: string
): Promise<any[][]> {
  const token = await getValidAccessToken(telegramId, 'sheets');
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: token });

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (res.data.values as any[][]) || [];
}

export async function writeSheet(
  telegramId: number,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<any> {
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
}
