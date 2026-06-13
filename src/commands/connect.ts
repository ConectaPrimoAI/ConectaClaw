// ... (mantenha os imports e funções generateUserToken, verifyUserToken)

export async function handleConectar(ctx: Context): Promise<void> {
  try {
    const telegramId = ctx.from!.id;
    const firstName = ctx.from!.first_name || 'amigo';
    const token = generateUserToken(telegramId);
    
    // ✅ CORREÇÃO: Aponta diretamente para o Render
    const panelUrl = `https://conectaclaw.onrender.com/conectores.html?token=${token}`;

    console.log(`🔗 Token gerado para ${telegramId} (válido por 30m)`);

    let statusText = '';
    try {
      const integrations = await getAllIntegrations(telegramId);
      const connectedList = Object.keys(integrations);
      if (connectedList.length > 0) {
        const names = connectedList.filter((k: string) => k !== 'google').map((k: string) => `✅ ${capitalize(k)}`).join(', ');
        if (names) statusText = `\n\n📊 *Conectados:* ${names}`;
      }
    } catch (dbError: any) {
      console.warn('⚠️ Falha ao buscar integrações:', dbError.message);
    }

    const message = `🦞 E aí, ${firstName}! Vou te conectar às suas ferramentas favoritas.\n\n` +
      `Clica no botão abaixo pra abrir o painel de conectores. Lá você escolhe o que liberar e conecta em segundos.\n\n` +
      `🔒 *Seguro:* Seus tokens ficam criptografados e você pode desconectar quando quiser.\n` +
      `⏰ *Validade:* 30 minutos${statusText}`;

    await ctx.reply(message, Markup.inlineKeyboard([
      [Markup.button.webApp('🔌 Abrir Painel de Conectores', panelUrl)],
      [Markup.button.url('🔗 Abrir no navegador', panelUrl)]
    ]));
  } catch (error: any) {
    console.error('❌ Erro CRÍTICO no handleConectar:', error);
    throw error;
  }
}

// ... (mantenha handleIntegrationsStatus, handleDisconnect e capitalize)