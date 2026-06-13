/**
 * firebase.ts
 * Conexão com Firebase Admin SDK (Firestore) + CRUD de integrações
 */

import admin from 'firebase-admin';

let db: any = null;

try {
  if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.warn('⚠️ Variáveis do Firebase incompletas. As integrações não funcionarão até serem configuradas.');
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
}

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

export async function getAllIntegrations(telegramId: number): Promise<Record<string, IntegrationData>> {
  try {
    if (!db) return {};
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return {};
    const userData = userDoc.data() as any;
    return userData.integrations || {};
  } catch (error: any) {
    console.error(`⚠️ Erro ao buscar integrações de ${telegramId}:`, error.message);
    return {}; // Retorna vazio em vez de quebrar o bot
  }
}

export async function saveIntegration(telegramId: number, provider: string, data: IntegrationData): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    const now = Date.now();

    if (userDoc.exists) {
      await userRef.update({ [`integrations.${provider}`]: data, updatedAt: now });
    } else {
      await userRef.set({ telegram_id: telegramId, integrations: { [provider]: data }, createdAt: now, updatedAt: now });
    }
  } catch (error: any) {
    console.error(`❌ Erro ao salvar integração ${provider}:`, error.message);
    throw error;
    }
}

export async function removeIntegration(telegramId: number, provider: string): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    await userRef.update({ [`integrations.${provider}`]: admin.firestore.FieldValue.delete(), updatedAt: Date.now() });
  } catch (error: any) {
    console.error(`❌ Erro ao remover integração ${provider}:`, error.message);
    throw error;
  }
}

export async function updateTokens(telegramId: number, provider: string, accessToken: string, refreshToken?: string, tokenExpiry?: number): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    const updates: Record<string, any> = { [`integrations.${provider}.accessToken`]: accessToken, [`integrations.${provider}.updatedAt`]: Date.now() };
    if (refreshToken) updates[`integrations.${provider}.refreshToken`] = refreshToken;
    if (tokenExpiry) updates[`integrations.${provider}.tokenExpiry`] = tokenExpiry;
    await userRef.update(updates);
  } catch (error: any) {
    console.error(`❌ Erro ao atualizar tokens ${provider}:`, error.message);
    throw error;
  }
}

export async function hasIntegration(telegramId: number, provider: string): Promise<boolean> {
  try {
    if (!db) return false;
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return false;
    const userData = userDoc.data() as any;
    const integration = userData.integrations?.[provider];
    return integration !== undefined && !!integration.accessToken;
  } catch {
    return false;
  }
}

export { db, admin };
