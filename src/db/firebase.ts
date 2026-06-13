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

try {
  if (!admin.apps.length) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 FIREBASE CONFIGURATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Tenta primeiro o JSON completo
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      console.log('✅ Usando FIREBASE_SERVICE_ACCOUNT (JSON completo)');
      
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        
        console.log('📋 Service Account:', {
          project_id: serviceAccount.project_id,
          client_email: serviceAccount.client_email ? '✅' : '❌',
          private_key_length: serviceAccount.private_key?.length || 0,        });
        
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
        
        console.log('✅ Firebase inicializado com sucesso!');
      } catch (parseError: any) {
        console.error('❌ Erro ao parsear JSON:', parseError.message);
        console.error('💡 Verifique se o JSON está formatado corretamente');
        throw parseError;
      }
    } else {
      // Fallback para variáveis separadas (método antigo)
      console.log('⚠️ FIREBASE_SERVICE_ACCOUNT não encontrado, tentando variáveis separadas...');
      
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
        console.error('❌ Variáveis do Firebase incompletas');
        throw new Error('Configure FIREBASE_SERVICE_ACCOUNT ou as variáveis FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL e FIREBASE_PROJECT_ID');
      }
      
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
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ ERRO CRÍTICO AO INICIALIZAR FIREBASE');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('Erro:', error.message);
  console.error('');
  console.error('💡 SOLUÇÃO RECOMENDADA:');
  console.error('   1. Firebase Console → Project Settings → Service Accounts');
  console.error('   2. Generate new private key (baixa um JSON)');
  console.error('   3. Abra o JSON e copie TODO o conteúdo');
  console.error('   4. No Render, crie a variável FIREBASE_SERVICE_ACCOUNT');
  console.error('   5. Cole o JSON inteiro em UMA LINHA (mantenha os \\n)');
  console.error('   6. Remova as variáveis FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL e FIREBASE_PROJECT_ID');}

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

    // ✅ Usamos set com merge: true para garantir que o documento exista e atualizar apenas o campo necessário.
    // Isso resolve erros de "Missing or insufficient permissions" quando as regras do Firestore
    // exigem que o documento exista ou quando há conflitos de escrita.
    await userRef.set({
      telegram_id: telegramId,
      integrations: {
        [provider]: data
      },
      updatedAt: now,
      // Se não existir, define createdAt. Se existir, mantém o valor atual.
      createdAt: userDoc.exists ? userDoc.data()?.createdAt || now : now
    }, { merge: true });
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
    return {};
  }
}

export async function removeIntegration(
  telegramId: number,
  provider: string
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    await userRef.set({
      integrations: {
        [provider]: admin.firestore.FieldValue.delete()
      },
      updatedAt: Date.now(),
    }, { merge: true });
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
    
    const integrationUpdate: any = {
      accessToken,
      updatedAt: Date.now()
    };

    if (refreshToken) integrationUpdate.refreshToken = refreshToken;
    if (tokenExpiry) integrationUpdate.tokenExpiry = tokenExpiry;

    await userRef.set({
      integrations: {
        [provider]: integrationUpdate
      },
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error: any) {
    console.error(`❌ Erro ao atualizar tokens ${provider}:`, error.message);
    throw error;
  }
}

export async function saveUserInfo(
  telegramId: number,
  username?: string,
  firstName?: string
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');
    const userRef = db.collection('users').doc(String(telegramId));
    
    await userRef.set({
      username: username || admin.firestore.FieldValue.delete(),
      first_name: firstName || admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    }, { merge: true });
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
    return false;  }
}

export { db, admin };