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

// ── Inicialização ──────────────────────────────────────────
let db: any = null;
let memoryStorage: Map<string, UserConnections> = new Map();

export function isFirebaseAvailable(): boolean {
  return db !== null;
}

try {
  if (!admin.apps.length) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 FIREBASE CONFIGURATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      console.log('✅ Usando FIREBASE_SERVICE_ACCOUNT (JSON completo)');
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
        console.log('✅ Firebase inicializado com sucesso!');
      } catch (parseError: any) {
        console.error('❌ Erro ao parsear JSON:', parseError.message);
        throw parseError;
      }
    } else {
      console.log('⚠️ FIREBASE_SERVICE_ACCOUNT não encontrado, tentando variáveis separadas...');
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      if (privateKey && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
        console.log('✅ Firebase inicializado com sucesso!');
      } else {
        console.warn('⚠️ Variáveis do Firebase incompletas. Usando modo "sem persistência" (memória).');
      }
    }
  }
  if (admin.apps.length) {
    db = admin.firestore();
  }
} catch (error: any) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ ERRO AO INICIALIZAR FIREBASE');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('Erro:', error.message);
  db = null;
}

function handleFirestoreError(error: any) {
  if (error.message?.includes('PERMISSION_DENIED') || error.message?.includes('not been used in project')) {
    console.error('\n⚠️ Firestore não está configurado. O desenvolvedor precisa:');
    console.error('1. Acessar https://console.cloud.google.com/apis/api/firestore.googleapis.com/overview?project=conectaclaw-oauth');
    console.error('2. Clicar em "ENABLE"');
    console.error('3. Aguardar 2-3 minutos\n');
  } else {
    console.error('❌ Erro no Firestore:', error.message);
  }
}

// ── CRUD ───────────────────────────────────────────────────

export async function saveIntegration(
  telegramId: number,
  provider: string,
  data: IntegrationData
): Promise<void> {
  const now = Date.now();
  if (!db) {
    const user = memoryStorage.get(String(telegramId)) || {
      telegram_id: telegramId,
      integrations: {},
      createdAt: now,
      updatedAt: now
    };
    user.integrations[provider] = data;
    user.updatedAt = now;
    memoryStorage.set(String(telegramId), user);
    return;
  }

  try {
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    const current = userDoc.exists ? (userDoc.data() as UserConnections) : null;
    const currentIntegrations = current?.integrations || {};
    const mergedIntegrations = { ...currentIntegrations, [provider]: data };

    await userRef.set({
      telegram_id: telegramId,
      integrations: mergedIntegrations,
      updatedAt: now,
      createdAt: current?.createdAt || now
    }, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error);
    // Fallback para memória se falhar
    const user = memoryStorage.get(String(telegramId)) || {
      telegram_id: telegramId,
      integrations: {},
      createdAt: now,
      updatedAt: now
    };
    user.integrations[provider] = data;
    user.updatedAt = now;
    memoryStorage.set(String(telegramId), user);
  }
}

export async function getIntegration(
  telegramId: number,
  provider: string
): Promise<IntegrationData | null> {
  if (!db) {
    return memoryStorage.get(String(telegramId))?.integrations[provider] || null;
  }
  try {
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return memoryStorage.get(String(telegramId))?.integrations[provider] || null;
    const userData = userDoc.data() as UserConnections;
    return userData.integrations?.[provider] || null;
  } catch (error: any) {
    handleFirestoreError(error);
    return memoryStorage.get(String(telegramId))?.integrations[provider] || null;
  }
}

export async function getAllIntegrations(
  telegramId: number
): Promise<Record<string, IntegrationData>> {
  if (!db) {
    return memoryStorage.get(String(telegramId))?.integrations || {};
  }
  try {
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return memoryStorage.get(String(telegramId))?.integrations || {};
    const userData = userDoc.data() as UserConnections;
    return userData.integrations || {};
  } catch (error: any) {
    handleFirestoreError(error);
    return memoryStorage.get(String(telegramId))?.integrations || {};
  }
}

export async function removeIntegration(
  telegramId: number,
  provider: string
): Promise<void> {
  if (!db) {
    const user = memoryStorage.get(String(telegramId));
    if (user) {
      delete user.integrations[provider];
      user.updatedAt = Date.now();
    }
    return;
  }
  try {
    const userRef = db.collection('users').doc(String(telegramId));
    await userRef.set({
      integrations: {
        [provider]: admin.firestore.FieldValue.delete()
      },
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error);
    const user = memoryStorage.get(String(telegramId));
    if (user) {
      delete user.integrations[provider];
      user.updatedAt = Date.now();
    }
  }
}

export async function updateTokens(
  telegramId: number,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  tokenExpiry?: number
): Promise<void> {
  const now = Date.now();
  if (!db) {
    const user = memoryStorage.get(String(telegramId));
    if (user && user.integrations[provider]) {
      user.integrations[provider].accessToken = accessToken;
      if (refreshToken) user.integrations[provider].refreshToken = refreshToken;
      if (tokenExpiry) user.integrations[provider].tokenExpiry = tokenExpiry;
      user.integrations[provider].updatedAt = now;
      user.updatedAt = now;
    }
    return;
  }
  try {
    const userRef = db.collection('users').doc(String(telegramId));
    const integrationUpdate: any = { accessToken, updatedAt: now };
    if (refreshToken) integrationUpdate.refreshToken = refreshToken;
    if (tokenExpiry) integrationUpdate.tokenExpiry = tokenExpiry;

    await userRef.set({
      integrations: { [provider]: integrationUpdate },
      updatedAt: now
    }, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error);
  }
}

export async function saveUserInfo(
  telegramId: number,
  username?: string,
  firstName?: string
): Promise<void> {
  const now = Date.now();
  if (!db) {
    const user = memoryStorage.get(String(telegramId)) || {
      telegram_id: telegramId,
      integrations: {},
      createdAt: now,
      updatedAt: now
    };
    if (username) user.username = username;
    if (firstName) user.first_name = firstName;
    user.updatedAt = now;
    memoryStorage.set(String(telegramId), user);
    return;
  }
  try {
    const userRef = db.collection('users').doc(String(telegramId));
    await userRef.set({
      username: username || admin.firestore.FieldValue.delete(),
      first_name: firstName || admin.firestore.FieldValue.delete(),
      updatedAt: now,
    }, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error);
  }
}

export async function hasIntegration(
  telegramId: number,
  provider: string
): Promise<boolean> {
  const integrations = await getAllIntegrations(telegramId);
  const integration = integrations[provider];
  return integration !== undefined && !!integration.accessToken;
}

export { db, admin };
