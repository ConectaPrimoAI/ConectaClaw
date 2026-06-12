/**
 * db/user-connections.ts
 * Armazena e gerencia tokens OAuth dos usuários (em memória + arquivo JSON).
 * Em produção, substitua por Redis ou PostgreSQL.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { UserConnection, OAuthTokens, IntegrationProvider } from '../integrations/types.js';

const DB_FILE = path.join(os.tmpdir(), 'conectaclaw_connections.json');
const connectionsMap = new Map<string, UserConnection>();

function makeKey(userId: number, provider: IntegrationProvider): string {
    return `${userId}:${provider}`;
}

function loadFromDisk() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
            for (const item of raw) {
                connectionsMap.set(makeKey(item.userId, item.provider), item);
            }
        }
    } catch { /* ignora erros de leitura */ }
}

function saveToDisk() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify([...connectionsMap.values()], null, 2));
    } catch { /* ignora erros de escrita */ }
}

loadFromDisk();

export function saveConnection(userId: number, provider: IntegrationProvider, tokens: OAuthTokens): void {
    const conn: UserConnection = { userId, provider, tokens, connectedAt: Date.now() };
    connectionsMap.set(makeKey(userId, provider), conn);
    saveToDisk();
}

export function getConnection(userId: number, provider: IntegrationProvider): UserConnection | null {
    return connectionsMap.get(makeKey(userId, provider)) || null;
}

export function removeConnection(userId: number, provider: IntegrationProvider): void {
    connectionsMap.delete(makeKey(userId, provider));
    saveToDisk();
}

export function getConnectedProviders(userId: number): IntegrationProvider[] {
    const providers: IntegrationProvider[] = [];
    for (const [key, conn] of connectionsMap.entries()) {
        if (conn.userId === userId) providers.push(conn.provider);
    }
    return providers;
}

export function isConnected(userId: number, provider: IntegrationProvider): boolean {
    const conn = getConnection(userId, provider);
    if (!conn) return false;
    if (conn.tokens.expiresAt && conn.tokens.expiresAt < Date.now() && !conn.tokens.refreshToken) {
        return false;
    }
    return true;
}
