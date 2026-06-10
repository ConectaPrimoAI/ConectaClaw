// src/joelbot-agent.ts
// JoelBot agent principal para o ConectaClaw
// Versão corrigida: bind de porta em 0.0.0.0 + modelo Groq atualizado (mixtral foi descontinuado)

import { Telegraf } from 'telegraf';
import Groq from 'groq-sdk';
import { startWebTerminal, addLog } from './web-terminal.js';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// CORREÇÃO CRÍTICA: mixtral-8x7b-32768 foi descontinuado pela Groq.
// Modelos válidos em jun/2026:
//   - llama-3.3-70b-versatile  (recomendado, inteligente)
//   - llama-3.1-8b-instant     (rápido, barato)
//   - openai/gpt-oss-120b      (alternativa)
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN não definido. Configure no Render → Environment.');
  process.exit(1);
}

if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY não definida. Configure no Render → Environment.');
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_TOKEN);
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Memória simples por usuário (em produção use Redis/Postgres)
const userMemory = new Map<number, Array<{ role: 'user' | 'assistant'; content: string }>>();
const MAX_HISTORY = 10;

function getHistory(userId: number) {
  if (!userMemory.has(userId)) userMemory.set(userId, []);
  return userMemory.get(userId)!;
}

async function callGroq(userId: number, userMessage: string): Promise<string> {
  const history = getHistory(userId);
  history.push({ role: 'user', content: userMessage });

  // Mantém só as últimas MAX_HISTORY mensagens
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Você é o ConectaClaw, um assistente de IA útil, direto e amigável. ' +
          'Responda em português do Brasil a menos que o usuário peça outro idioma. ' +
          'Seja conciso e prático.',
      },
      ...history,
    ],
    temperature: 0.7,
    max_tokens: 1024,
  });

  const reply = completion.choices[0]?.message?.content ?? 'Desculpe, não consegui gerar uma resposta.';
  history.push({ role: 'assistant', content: reply });
  return reply;
}

// Handler principal: responde mensagens de texto
bot.on('text', async (ctx) => {
  const userId = ctx.from?.id;
  const userMessage = (ctx.message as any).text ?? '';

  if (!userId || !userMessage) return;

  addLog(`📩 ${ctx.from?.username ?? userId}: ${userMessage}`);

  try {
    // Mostra "digitando..." enquanto processa
    await ctx.sendChatAction('typing');

    const reply = await callGroq(userId, userMessage);
    await ctx.reply(reply);
    addLog(`✅ Resposta enviada para ${ctx.from?.username ?? userId}`);
  } catch (err: any) {
    addLog(`❌ Erro ao processar mensagem: ${err?.message ?? err}`);
    await ctx.reply('⚠️ Tive um problema ao processar sua mensagem. Tenta de novo em alguns segundos.');
  }
});

// Comando /start
bot.start((ctx) => {
  addLog(`🚀 Novo usuário: ${ctx.from?.username ?? ctx.from?.id}`);
  ctx.reply(
    '👋 Fala! Eu sou o ConectaClaw, seu assistente de IA.\n\n' +
      'Manda qualquer pergunta ou comando que eu te ajudo. 🤖'
  );
});

// Comando /model para ver o modelo em uso
bot.command('model', (ctx) => {
  ctx.reply(
    `🧠 Modelo atual: \`${GROQ_MODEL}\`\n\n` +
      `Modelos disponíveis: llama-3.3-70b-versatile, llama-3.1-8b-instant, openai/gpt-oss-120b`,
    { parse_mode: 'Markdown' }
  );
});

// Inicialização
async function main() {
  addLog('🚀 ConectaClaw iniciado com sucesso!');
  addLog('Bot aguardando mensagens...');

  // Sobe o web terminal em paralelo
  startWebTerminal();

  // Inicia o polling do Telegram
  await bot.launch();
  addLog(`✅ Telegram conectado. Modelo em uso: ${GROQ_MODEL}`);
}

main().catch((err) => {
  addLog(`❌ Erro fatal: ${err?.message ?? err}`);
  process.exit(1);
});

// Encerramento gracioso (importante pro Render não derrubar sujo)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));