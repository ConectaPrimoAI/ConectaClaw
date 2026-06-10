import express, { Express, Request, Response } from 'express';

const app: Express = express();

// CORREÇÃO: prioriza PORT (que o Render injeta) e cai pro WEB_TERMINAL_PORT como fallback.
// Se nenhum estiver setado, usa 10000 (padrão do Render).
const PORT = parseInt(
  process.env.PORT ?? process.env.WEB_TERMINAL_PORT ?? '10000',
  10
);

// CRÍTICO pro Render: bindar em 0.0.0.0, não localhost.
const HOST = '0.0.0.0';

let botLogs: string[] = [];
const MAX_LOGS = 500;

export function addLog(message: string) {
  const timestamp = new Date().toISOString();
  const cleanMessage = message.replace(/[*_`\[\]()~>#+=|{}.!]/g, '');
  const logEntry = `[${timestamp}] ${cleanMessage}`;

  botLogs.push(logEntry);
  if (botLogs.length > MAX_LOGS) botLogs.shift();
  console.log(logEntry);
}

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conecta Claw🦞 V20.0 - Web Terminal</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; background: #0a0e27; color: #00ff00; overflow: hidden; height: 100vh; }
    .container { display: flex; height: 100vh; flex-direction: column; }
    .header { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 20px; border-bottom: 2px solid #00ff00; }
    .header h1 { font-size: 24px; margin-bottom: 5px; text-shadow: 0 0 10px #00ff00; }
    .status { display: flex; gap: 20px; font-size: 12px; margin-top: 10px; }
    .status-item { display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #00ff00; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .terminal { flex: 1; overflow-y: auto; padding: 20px; background: #0a0e27; border: 1px solid #00ff00; margin: 20px; border-radius: 5px; font-size: 12px; line-height: 1.6; }
    .log-entry { margin: 4px 0; padding: 4px 4px 4px 10px; border-left: 3px solid #00ff00; word-break: break-all; }
    .log-entry.error { color: #ff4444; border-left-color: #ff4444; }
    .log-entry.warning { color: #ffaa00; border-left-color: #ffaa00; }
    .log-entry.success { color: #00ff00; }
    .footer { background: #1a1f3a; padding: 15px 20px; border-top: 1px solid #00ff00; font-size: 11px; display: flex; justify-content: space-between; align-items: center; }
    button { background: #00ff00; color: #0a0e27; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer; font-weight: bold; font-family: 'Courier New', monospace; }
    button:hover { background: #00cc00; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Conecta Claw🦞 V20.0 - Web Terminal</h1>
      <div class="status">
        <div class="status-item"><div class="status-dot"></div><span>Status: <strong>ONLINE</strong></span></div>
        <div class="status-item"><span>Logs: <strong id="log-count">0</strong></span></div>
        <div class="status-item"><span>Uptime: <strong id="uptime">0s</strong></span></div>
      </div>
    </div>
    <div class="terminal" id="terminal">
      <div class="log-entry success">🚀 Conecta Claw🦞 Web Terminal iniciado...</div>
    </div>
    <div class="footer">
      <div>Conecta Claw🦞 V20.0 | Tempo real</div>
      <div style="display:flex;gap:10px">
        <button onclick="clearLogs()">Limpar</button>
        <button onclick="scrollToBottom()">↓ Final</button>
      </div>
    </div>
  </div>
  <script>
    const terminal = document.getElementById('terminal');
    const logCount = document.getElementById('log-count');
    const uptime = document.getElementById('uptime');
    let startTime = Date.now();
    let lastCount = 0;

    setInterval(() => {
      fetch('/api/logs').then(r => r.json()).then(data => {
        if (data.logs.length === lastCount) return;
        lastCount = data.logs.length;
        const wasAtBottom = terminal.scrollHeight - terminal.clientHeight <= terminal.scrollTop + 50;
        terminal.innerHTML = '';
        data.logs.forEach(log => {
          const div = document.createElement('div');
          div.className = 'log-entry';
          if (log.includes('❌')) div.classList.add('error');
          else if (log.includes('⚠️')) div.classList.add('warning');
          div.textContent = log;
          terminal.appendChild(div);
        });
        logCount.textContent = data.logs.length;
        if (wasAtBottom) terminal.scrollTop = terminal.scrollHeight;
      }).catch(() => {});
    }, 1000);

    setInterval(() => {
      uptime.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
    }, 1000);

    function clearLogs() { fetch('/api/logs/clear', { method: 'POST' }).catch(() => {}); }
    function scrollToBottom() { terminal.scrollTop = terminal.scrollHeight; }
  </script>
</body>
</html>`;
  res.send(html);
});

app.get('/api/logs', (req: Request, res: Response) => { res.json({ logs: botLogs }); });
app.post('/api/logs/clear', (req: Request, res: Response) => { botLogs = []; res.json({ success: true }); });

export function startWebTerminal() {
  const server = app.listen(PORT, HOST, () => {
    console.log(`🌐 Web Terminal rodando em http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`⚠️ Porta ${PORT} em uso. Tentando ${PORT + 1}...`);
      app.listen(PORT + 1, HOST, () => {
        console.log(`🌐 Web Terminal rodando em http://${HOST}:${PORT + 1}`);
      });
    } else {
      console.error(`❌ Erro crítico ao iniciar Web Terminal: ${err.message}`);
    }
  });

  return server;
}
