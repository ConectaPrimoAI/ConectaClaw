// ── Verifica token JWT ─────────────────────────────────────
app.get('/api/verify', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = req.query.token as string;

  const tokenToVerify = authHeader?.replace('Bearer ', '') || token;

  if (!tokenToVerify) {
    console.log('⚠️ /api/verify: Token não fornecido');
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  console.log(`🔍 /api/verify: Verificando token (length: ${tokenToVerify.length})`);

  const decoded = verifyUserToken(tokenToVerify);
  if (!decoded) {
    console.log('❌ /api/verify: Token inválido ou expirado');
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return;
  }

  console.log(`✅ /api/verify: Token válido para telegram_id ${decoded.telegram_id}`);
  res.json({ valid: true, telegram_id: decoded.telegram_id });
});
