/**
 * firebase.ts
 * Conexão com Firebase Admin SDK (Firestore) + CRUD de integrações
 */

import * as admin from 'firebase-admin';

// Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();

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

// ── CRUD ───────────────────────────────────────────────────

/**
 * Salva/atualiza uma integração para um usuário
 */
export async function saveIntegration(
  telegramId: number,
  provider: string,
  data: IntegrationData
): Promise<void> {
  const userRef = db.collection('users').doc(String(telegramId));
  const userDoc = await userRef.get();

  const now = Date.now();

  if (userDoc.exists) {
    const userData = userDoc.data() as UserConnections;
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
}

/**
 * Busca uma integração específica de um usuário
 */
export async function getIntegration(
  telegramId: number,
  provider: string
): Promise<IntegrationData | null> {
  const userRef = db.collection('users').doc(String(telegramId));
  const userDoc = await userRef.get();

  if (!userDoc.exists) return null;

  const userData = userDoc.data() as UserConnections;
  return userData.integrations?.[provider] || null;
}

/**
 * Busca todas as integrações de um usuário
 */
export async function getAllIntegrations(
  telegramId: number
): Promise<Record<string, IntegrationData>> {
  const userRef = db.collection('users').doc(String(telegramId));
  const userDoc = await userRef.get();

  if (!userDoc.exists) return {};

  const userData = userDoc.data() as UserConnections;
  return userData.integrations || {};
}

/**
 * Remove uma integração específica
 */
export async function removeIntegration(
  telegramId: number,
  provider: string
): Promise<void> {
  const userRef = db.collection('users').doc(String(telegramId));
  await userRef.update({
    [`integrations.${provider}`]: admin.firestore.FieldValue.delete(),
    updatedAt: Date.now(),
  });
}

/**
 * Atualiza tokens de uma integração (para refresh)
 */
export async function updateTokens(
  telegramId: number,
  provider: string,
  accessToken: string,
  refreshToken?: string,
  tokenExpiry?: number
): Promise<void> {
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
}

/**
 * Salva informações do usuário (username, nome)
 */
export async function saveUserInfo(
  telegramId: number,
  username?: string,
  firstName?: string
): Promise<void> {
  const userRef = db.collection('users').doc(String(telegramId));
  const userDoc = await userRef.get();

  if (userDoc.exists) {
    await userRef.update({
      username: username || admin.firestore.FieldValue.delete(),
      first_name: firstName || admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    });
  }
}

/**
 * Verifica se o usuário tem uma integração ativa
 */
export async function hasIntegration(
  telegramId: number,
  provider: string
): Promise<boolean> {
  const integration = await getIntegration(telegramId, provider);
  return integration !== null && !!integration.accessToken;
}

export { db, admin };
