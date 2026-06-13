/**
 * firebase.ts
 * Conexão com Firebase Admin SDK (Firestore) + CRUD de integrações
 */

import admin from 'firebase-admin';

// ── Tipos ──────────────────────────────────────────────────
export interface IntegrationData {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: number;
  scope?: string;
  connectedAt: number;
  updatedAt: number;
  extra?: Record<string, any>;
}

export interface UserConnections {
  telegram_id: number;
  username?: string;
  first_name?: string;
  integrations: Record<string, IntegrationData>;
  createdAt: number;
  updatedAt: number;
}

// ── Função para normalizar a chave privada ─────────────────
function normalizePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  
  // Remove espaços extras no início/fim
  let normalized = key.trim();
  
  // Tenta diferentes formatações
  // 1. Se já tem \n literais, mantém
  if (normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }
  
  // 2. Se tem quebras de linha reais, mantém
  // 3. Se está tudo em uma linha, adiciona quebras onde necessário
  if (!normalized.includes('\n')) {
    normalized = normalized
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----\n')
      // Adiciona quebras a cada 64 caracteres no meio da chave
      .replace(/(.{64})/g, '$1\n');
  }  
  return normalized;
}

// ── Inicialização ──────────────────────────────────────────
let db: any = null;

try {
  if (!admin.apps.length) {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;
    const privateKey = normalizePrivateKey(rawKey);
    
    console.log('🔍 Firebase config:', {
      projectId: process.env.FIREBASE_PROJECT_ID ? '✅' : '❌',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? '✅' : '❌',
      privateKey: privateKey ? `✅ (length: ${privateKey.length})` : '❌',
    });
    
    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.warn('⚠️ Variáveis do Firebase incompletas. Integrações não funcionarão.');
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      console.log('✅ Firebase inicializado com sucesso!');
    }
  }
  db = admin.firestore();
} catch (error: any) {
  console.error('❌ Erro CRÍTICO ao inicializar Firebase:', error.message);
  console.error('💡 Dica: Verifique se a FIREBASE_PRIVATE_KEY está formatada corretamente no Render');
}

// ── CRUD ───────────────────────────────────────────────────

export async function saveIntegration(
  telegramId: number,
  provider: string,
  data: IntegrationData
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    const now = Date.now();
    if (userDoc.exists) {
      await userRef.update({
        [`integrations.${provider}`]: data,
        updatedAt: now,
      });
    } else {
      await userRef.set({
        telegram_id: telegramId,
        integrations: { [provider]: data },
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (error: any) {
    console.error(`❌ Erro ao salvar integração ${provider}:`, error.message);
    throw error;
  }
}

export async function getIntegration(
  telegramId: number,
  provider: string
): Promise<IntegrationData | null> {
  try {
    if (!db) return null;
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return null;
    const userData = userDoc.data() as UserConnections;
    return userData.integrations?.[provider] || null;
  } catch (error: any) {
    console.error(`⚠️ Erro ao buscar integração ${provider} de ${telegramId}:`, error.message);
    return null;
  }
}

export async function getAllIntegrations(
  telegramId: number
): Promise<Record<string, IntegrationData>> {
  try {
    if (!db) return {};
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return {};
    const userData = userDoc.data() as UserConnections;
    return userData.integrations || {};
  } catch (error: any) {
    console.error(`⚠️ Erro ao buscar integrações de ${telegramId}:`, error.message);
    return {};  }
}

export async function removeIntegration(
  telegramId: number,
  provider: string
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    await userRef.update({
      [`integrations.${provider}`]: admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    });
  } catch (error: any) {
    console.error(`❌ Erro ao remover integração ${provider}:`, error.message);
    throw error;
  }
}

export async function updateTokens(
  telegramId: number,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  tokenExpiry?: number
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    const updates: Record<string, any> = {
      [`integrations.${provider}.accessToken`]: accessToken,
      [`integrations.${provider}.updatedAt`]: Date.now(),
    };

    if (refreshToken) {
      updates[`integrations.${provider}.refreshToken`] = refreshToken;
    }
    if (tokenExpiry) {
      updates[`integrations.${provider}.tokenExpiry`] = tokenExpiry;
    }

    await userRef.update(updates);
  } catch (error: any) {
    console.error(`❌ Erro ao atualizar tokens ${provider}:`, error.message);
    throw error;
  }
}

export async function saveUserInfo(  telegramId: number,
  username?: string,
  firstName?: string
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      await userRef.update({
        username: username || admin.firestore.FieldValue.delete(),
        first_name: firstName || admin.firestore.FieldValue.delete(),
        updatedAt: Date.now(),
      });
    }
  } catch (error: any) {
    console.error(`❌ Erro ao salvar info do usuário ${telegramId}:`, error.message);
    throw error;
  }
}

export async function hasIntegration(
  telegramId: number,
  provider: string
): Promise<boolean> {
  try {
    if (!db) return false;
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return false;
    const userData = userDoc.data() as UserConnections;
    const integration = userData.integrations?.[provider];
    return integration !== undefined && !!integration.accessToken;
  } catch {
    return false;
  }
}

export { db, admin };