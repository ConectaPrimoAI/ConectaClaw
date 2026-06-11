# ConectaClaw v21.0 - Funcionalidades Completas

## ✅ Sistema Totalmente Funcional e Corrigido

### 🎯 Lógica de Intenção
- **Sistema de Roteamento Inteligente**: Usa LLM (Groq) para entender intenção do usuário
- **Memória de Conversa**: Mantém contexto das últimas 12 mensagens por usuário
- **Limpeza Automática**: Memórias antigas são limpas após 30 minutos de inatividade
- **Mensagens Humanizadas**: Respostas naturais e diretas, sem robotismos

### 🎤 Áudio (Transcrição + Resposta em Áudio)
- **Transcrição**: Whisper Large V3 via Groq (suporta português)
- **Síntese de Voz (TTS)**:
  - Primária: Replicate Kokoro-82M (alta qualidade)
  - Fallback: Google TTS (sempre disponível)
- **Fluxo Completo**: Usuário envia áudio → Transcreve → IA responde → Envia resposta em áudio
- **Compatibilidade**: Suporta OGG, MP3, M4A e voice messages do Telegram

### 🎨 Geração de Imagem
- **Primária**: Pollinations FLUX (grátis, sem token)
- **Secundária**: Replicate flux-schnell (se configurado)
- **Comando**: `/imagem <descrição>`
- **Qualidade**: 1024x1024, JPEG otimizado
- **Fallback Automático**: Tenta Replicate se Pollinations falhar

### 🎬 Geração de Vídeo
- **Modelo**: Replicate minimax/video-01
- **Comando**: `/video <descrição>`
- **Duração**: 5 segundos
- **Status em Tempo Real**: Mostra progresso (1-3 minutos)
- **Requer**: REPLICATE_API_TOKEN configurado
- **Custo**: ~US$ 0,05 por vídeo

### 🔊 Conversão de Texto em Áudio
- **Comando**: `/voz <texto>`
- **Qualidade**: Replicate Kokoro com fallback Google
- **Idioma**: Português brasileiro (pt-BR)
- **Velocidade**: Normal (1x)

### 👁️ Análise de Imagem (Vision)
- **Modelo**: Llama 3.2 90B Vision (Groq)
- **Ação**: Envie uma foto com `/foto` ou apenas a foto
- **Resposta**: Análise detalhada em português

### 🔢 Calculadora
- **Comando**: `/calcular <expressão>`
- **Exemplo**: `/calcular 2+2*5`
- **Modelo**: Llama 3.1 8B (otimizado para math)

### 📋 Comandos Disponíveis
```
/start     - Inicia o bot e mostra ajuda
/clear     - Limpa histórico de conversa
/model     - Mostra status do sistema
/imagem    - Gera imagem (Pollinations + Replicate)
/video     - Gera vídeo (Replicate)
/voz       - Converte texto em áudio
/calcular  - Resolve expressões matemáticas
```

### 🤖 Agentes Integrados
- **VoiceAgent**: Transcrição e TTS
- **VisionAgent**: Análise de imagens
- **ImageGenAgent**: Geração de imagens
- **VideoGenAgent**: Geração de vídeos
- **MathAgent**: Cálculos
- **E mais 20+ agentes especializados**

### 🛠️ Skills Disponíveis
- **VideoSkill**: Integração Replicate para vídeo
- **ImageSkill**: Integração Pollinations/Replicate
- **BrowserSkill**: Screenshots e scraping
- **WeatherSkill**: Informações de clima
- **ReminderSkill**: Lembretes
- **SlidesSkill**: Geração de apresentações
- **ExecSkill**: Execução de comandos

## 🔧 Configuração

### Variáveis de Ambiente Obrigatórias
```env
TELEGRAM_TOKEN=seu_token_do_botfather
GROQ_API_KEY=sua_chave_groq
```

### Variáveis Opcionais
```env
REPLICATE_API_TOKEN=r8_seu_token_replicate
```

## 🚀 Como Executar

```bash
# Instalar dependências
npm install

# Compilar TypeScript
npm run build

# Executar
npm start

# Desenvolvimento (com reload automático)
npm run dev
```

## 📊 Arquitetura

```
ConectaClaw v21.0
├── Telegram Bot (Telegraf)
├── LLM Roteador (Groq)
├── Sistema de Intenção (handleIntent)
├── Memória de Conversa (ConversationMemory)
├── Agentes (AgentRegistry)
│   ├── VoiceAgent
│   ├── VisionAgent
│   ├── ImageGenAgent
│   ├── VideoGenAgent
│   └── 20+ especializados
├── Skills (SkillRegistry)
│   ├── VideoSkill (Replicate)
│   ├── ImageSkill (Pollinations/Replicate)
│   ├── BrowserSkill
│   └── Outros
└── APIs Externas
    ├── Groq (LLM + Whisper)
    ├── Replicate (Vídeo + TTS + Imagem)
    └── Pollinations (Imagem FLUX)
```

## ✨ Melhorias v21.0

1. **Sistema Corrigido**: Removido código duplicado e erros de compilação
2. **Lógica de Intenção**: Implementada com LLM para melhor compreensão
3. **Áudio Completo**: Transcrição + resposta em áudio integradas
4. **Replicate Integrado**: Vídeo, TTS e imagem via Replicate
5. **Mensagens Humanizadas**: Respostas naturais e diretas
6. **Fallbacks Automáticos**: Sempre tenta alternativas se principal falhar
7. **Status em Tempo Real**: Mostra progresso de operações longas
8. **Memória Inteligente**: Contexto mantido e limpeza automática

## 🎯 Próximos Passos

1. Configure seus tokens em `.env`
2. Execute `npm start`
3. Abra o Telegram e procure seu bot
4. Envie `/start` para iniciar
5. Teste cada funcionalidade!

---

**ConectaClaw v21.0** - Bot IA completo, funcional e pronto para produção 🦞
