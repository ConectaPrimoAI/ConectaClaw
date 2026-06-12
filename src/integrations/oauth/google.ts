/**
 * integrations/oauth/google.ts
 * Fluxo OAuth2 para Google (Gmail, Drive, Calendar, Sheets)
 */
import axios from 'axios';
import * as crypto from 'node:crypto';
import { OAuthTokens } from '../types.js';
import { addLog } from '../../web-terminal.js';

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/calendar',
    'email',
    'profile'
].join(' ');

const pendingStates = new Map<string, { userId: number; expiresAt: number }>();

export function generateGoogleAuthUrl(userId: number): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`;

    if (!clientId) throw new Error('GOOGLE_CLIENT_ID não configurado');

    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function resolveGoogleState(state: string): number | null {
    const pending = pendingStates.get(state);
    if (!pending) return null;
    if (pending.expiresAt < Date.now()) { pendingStates.delete(state); return null; }
    pendingStates.delete(state);
    return pending.userId;
}

export async function exchangeGoogleCode(code: string): Promise<OAuthTokens> {
    const clientId     = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri  = process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`;

    const res = await axios.post(GOOGLE_TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
    }, { timeout: 15000 });

    const { access_token, refresh_token, expires_in } = res.data;

    let email = '';
    try {
        const info = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        });
        email = info.data.email || '';
    } catch { /* opcional */ }

    addLog(`✅ Google OAuth concluído para ${email || 'usuário'}`);

    return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (expires_in || 3600) * 1000,
        email
    };
}

export async function refreshGoogleToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) throw new Error('Sem refresh token');

    const res = await axios.post(GOOGLE_TOKEN_URL, {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token'
    }, { timeout: 15000 });

    return {
        ...tokens,
        accessToken: res.data.access_token,
        expiresAt: Date.now() + (res.data.expires_in || 3600) * 1000
    };
}
