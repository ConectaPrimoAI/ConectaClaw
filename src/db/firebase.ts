/**
 * Busca uma integração específica de um usuário
 */
export async function getIntegration(
  telegramId: number,
  provider: string
): Promise<IntegrationData | null> {
  try {
    if (!db) return null;
    const userRef = db.collection('users').doc(String(telegramId));
    const userDoc = await userRef.get();
    if (!userDoc.exists) return null;
    const userData = userDoc.data() as any;
    return userData.integrations?.[provider] || null;
  } catch (error: any) {
    console.error(`⚠️ Erro ao buscar integração ${provider} de ${telegramId}:`, error.message);
    return null;
  }
}
