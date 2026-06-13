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
  
  console.log('🔍 Chave privada bruta (primeiros 50 chars):', key.substring(0, 50));
  console.log('🔍 Chave privada contém \\n literal?', key.includes('\\n'));
  console.log('🔍 Chave privada contém quebra de linha real?', key.includes('\n'));
  
  let normalized = key.trim();
  
  // Remove aspas duplas se existirem
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  
  // Tenta diferentes formatações
  // 1. Se tem \n literais, converte para quebras reais
  if (normalized.includes('\\n')) {
    console.log('🔧 Convertendo \\n literal para quebras de linha');
    normalized = normalized.replace(/\\n/g, '\n');
  }
    // 2. Se não tem quebras de linha, adiciona onde necessário
  if (!normalized.includes('\n') && normalized.includes('BEGIN PRIVATE KEY')) {
    console.log('🔧 Adicionando quebras de linha manualmente');
    normalized = normalized
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    
    // Extrai apenas a parte da chave (entre BEGIN e END)
    const match = normalized.match(/-----BEGIN PRIVATE KEY-----\n([\s\S]+)\n-----END PRIVATE KEY-----/);
    if (match) {
      const keyContent = match[1].replace(/\s+/g, ''); // Remove todos os espaços
      // Adiciona quebras a cada 64 caracteres
      const formattedKey = keyContent.match(/.{1,64}/g)?.join('\n') || keyContent;
      normalized = `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----\n`;
    }
  }
  
  console.log('🔍 Chave normalizada (primeiros 50 chars):', normalized.substring(0, 50));
  console.log('🔍 Chave normalizada (últimos 50 chars):', normalized.substring(normalized.length - 50));
  
  return normalized;
}

// ── Inicialização ──────────────────────────────────────────
let db: any = null;

try {
  if (!admin.apps.length) {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 FIREBASE CONFIGURATION DEBUG');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Presente' : '❌ Ausente');
    console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Presente' : '❌ Ausente');
    console.log('FIREBASE_PRIVATE_KEY:', rawKey ? `✅ Presente (length: ${rawKey.length})` : '❌ Ausente');
    
    const privateKey = normalizePrivateKey(rawKey);
    
    if (!privateKey || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
      console.warn('⚠️ Variáveis do Firebase incompletas. Integrações não funcionarão.');
    } else {
      console.log('🔧 Tentando inicializar Firebase...');
      
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,          }),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
        console.log('✅ Firebase inicializado com sucesso!');
      } catch (certError: any) {
        console.error('❌ Erro ao criar credencial:', certError.message);
        console.error('💡 Possíveis causas:');
        console.error('   - Chave privada mal formatada');
        console.error('   - Client email incorreto');
        console.error('   - Project ID incorreto');
        throw certError;
      }
    }
  }
  db = admin.firestore();
} catch (error: any) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('❌ ERRO CRÍTICO AO INICIALIZAR FIREBASE');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('Erro:', error.message);
  console.error('💡 SOLUÇÃO:');
  console.error('   1. Vá no Firebase Console → Project Settings → Service Accounts');
  console.error('   2. Clique em "Generate new private key"');
  console.error('   3. Abra o arquivo JSON baixado');
  console.error('   4. Copie o valor de "private_key" EXATAMENTE como está');
  console.error('   5. No Render, cole o valor na variável FIREBASE_PRIVATE_KEY');
  console.error('   6. IMPORTANTE: Mantenha as quebras de linha ou use \\n literal');
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
        telegram_id: telegramId,        integrations: { [provider]: data },
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
    return {};
  }
}

export async function removeIntegration(
  telegramId: number,
  provider: string
): Promise<void> {
  try {
    if (!db) throw new Error('Firebase não inicializado');    const userRef = db.collection('users').doc(String(telegramId));
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

export async function saveUserInfo(
  telegramId: number,
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