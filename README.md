# ConectaClaw - Bot Telegram com IA

Bot Telegram limpo e minimalista com memória de conversa integrada. Perfeito para criar agentes de IA personalizados.

## 🚀 Características

- **Memória de Conversa**: Mantém contexto das últimas 10 mensagens (5 pares de interação)
- **Limpeza Automática**: Limpa memórias antigas após 30 minutos de inatividade
- **Sem Integrações Externas**: Zerado, sem GitHub, Drive, Gmail ou outras dependências
- **Groq AI**: Usa o modelo Mixtral-8x7b para respostas inteligentes
- **Simples e Extensível**: Código limpo e fácil de customizar

## 📋 Pré-requisitos

- Node.js 18+
- npm ou pnpm
- Token do Telegram Bot (do @BotFather)
- API Key do Groq (https://console.groq.com)

## ⚙️ Instalação

1. Clone o repositório:
```bash
git clone https://github.com/ConectaPrimoAI/ConectaClaw.git
cd ConectaClaw
```

2. Instale as dependências:
```bash
pnpm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Edite `.env` com seus tokens:
```env
TELEGRAM_TOKEN=seu_token_aqui
GROQ_API_KEY=sua_chave_aqui
```

## 🤖 Criando um Bot no Telegram

### Passo 1: Criar o Bot no BotFather

1. Abra o Telegram e procure por **@BotFather**
2. Envie o comando: `/newbot`
3. BotFather pedirá um nome para o bot (ex: "Meu Bot IA")
4. Depois pedirá um username (ex: "meu_bot_ia_bot") - **deve terminar com "_bot"**
5. BotFather retornará seu **token** no formato: `123456789:ABCDefgh...`
6. Copie este token e cole em `TELEGRAM_TOKEN` no arquivo `.env`

### Passo 2: Configurar Groq API

1. Acesse https://console.groq.com
2. Crie uma conta ou faça login
3. Gere uma API Key
4. Cole em `GROQ_API_KEY` no arquivo `.env`

## 🏃 Executando o Bot

```bash
pnpm start
```

Você verá:
```
🚀 ConectaClaw iniciado com sucesso!
Bot aguardando mensagens...
```

## 💬 Usando o Bot

1. Abra o Telegram
2. Procure pelo seu bot (username que criou no BotFather)
3. Envie `/start` para iniciar
4. Envie mensagens normalmente
5. Use `/clear` para limpar o histórico de conversa

## 📁 Estrutura do Projeto

```
ConectaClaw/
├── src/
│   └── conectaclaw-agent.ts    # Código principal do bot
├── dist/                    # Código compilado
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🔧 Personalizando o Bot

### Alterar Modelo de IA

No arquivo `src/conectaclaw-agent.ts`, linha com `model: 'mixtral-8x7b-32768'`, mude para:
- `'gemma-7b-it'`
- `'llama2-70b-4096'`
- Outro modelo disponível no Groq

### Alterar Tamanho da Memória

Linha `if (memory.messages.length > 10)` controla quantas mensagens são mantidas:
- `> 10` = últimas 5 pares de conversa
- `> 20` = últimas 10 pares
- `> 4` = últimas 2 pares

### Alterar Timeout de Memória

Linha `const MEMORY_TIMEOUT = 30 * 60 * 1000` controla quando a memória é limpa:
- `30 * 60 * 1000` = 30 minutos
- `60 * 60 * 1000` = 1 hora
- `5 * 60 * 1000` = 5 minutos

## 🚀 Deploy

### Render

1. Faça push para GitHub
2. Conecte seu repositório no Render
3. Configure variáveis de ambiente
4. Deploy automático

### Heroku

```bash
heroku create seu-bot-name
heroku config:set TELEGRAM_TOKEN=seu_token
heroku config:set GROQ_API_KEY=sua_chave
git push heroku main
```

## 📝 Licença

MIT - Livre para usar e modificar

## 🤝 Suporte

Para dúvidas ou issues, abra uma issue no GitHub.

---

**ConectaClaw** - Bot IA simples, poderoso e extensível 🦀
