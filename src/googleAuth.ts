/**
 * googleAuth.ts
 * Gerencia token OAuth2 do Google (Gmail + Drive).
 * Suporta 2 modos:
 *   1. Token estático (GOOGLE_ACCESS_TOKEN) — simples, expira em 1h
 *   2. Refresh automático (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN)
 */
import axios from 'axios';
import { addLog } from './web-terminal.js';

let cachedToken: string | null    = null;
let tokenExpiresAt: number        = 0;

export async function getGoogleToken(): Promise<string> {
    // Modo 1: token estático (sem refresh)
    if (process.env.GOOGLE_ACCESS_TOKEN && !process.env.GOOGLE_REFRESH_TOKEN) {
        return process.env.GOOGLE_ACCESS_TOKEN;
    }

    // Modo 2: refresh automático
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        throw new Error('Configure GOOGLE_ACCESS_TOKEN ou GOOGLE_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET');
    }

    // Cache válido?
    if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
        return cachedToken;
    }

    addLog('🔑 Google: renovando access token...');

    const res = await axios.post('https://oauth2.googleapis.com/token', {
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        grant_type:    'refresh_token',
    }, { timeout: 10000 });

    cachedToken    = res.data.access_token;
    tokenExpiresAt = Date.now() + (res.data.expires_in || 3600) * 1000;

    addLog(`✅ Google: token renovado (expira em ${res.data.expires_in}s)`);
    return cachedToken!;
}
