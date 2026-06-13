# 🛠️ ConectaClaw — Correções aplicadas (2026-06-13)

Este documento descreve as correções aplicadas no código **e** as ações
manuais que você precisa fazer no Google Cloud / Firebase / Render para
que TUDO funcione.

---

## 1) Resumo do que foi corrigido no código

| # | Bug | Sintoma | Correção |
|---|-----|---------|----------|
| 1 | Notion OAuth enviava scopes granulares inválidos (`pages:read`, `databases:query`…) na URL | Handshake do Notion falhava silenciosamente | Removido `scopes` da URL; UI granular agora é só cosmética |
| 2 | Google OAuth: tela "Acesso bloqueado" | App em modo Testing + e-mail não estava em Test users | Log dos escopos sensíveis, `openid`/`userinfo.email` sempre enviados, erros do callback agora explicam o que fazer |
| 3 | `saveIntegration` do Firebase sobrescrevia outros providers | Integração salva às vezes sumia | Lê o doc antes, faz merge limpo |
| 4 | `/conectar` usava `Markup.inlineKeyboard` (depreciado no Telegraf v4) | Botão do painel podia não abrir o WebApp | Substituído por `inline_keyboard` cru + fallback |
| 5 | WebApp escutava `WEBAPP_PORT=3001` no Render | Render só roteia a porta `PORT` → callback 404/timeout | `server.ts` agora prioriza `PORT` |
| 6 | `getPermissionScopes` retornava scopes inválidos para Notion | URL `/oauth/notion/authorize` rejeitada | Provider "notion" retorna `[]` |
| 7 | `intent-detector` com LLM alucinava tool calls | Ações eram executadas em conversa normal | Prompt mais explícito + temperatura 0.1 |
| 8 | `render.yaml` fixava `FIREBASE_PROJECT_ID=conectaclaw` | Sobrescrevia o ID real do projeto | `sync: false` em todas as envs sensíveis |
| 9 | Erro de Firestore genérico | Usuário não sabia o que fazer | `/api/connections` traduz `PERMISSION_DENIED` em instrução |
| 10 | Banner de erro no painel mostravam "Falha na sincronização: " + mensagem gigante | UX ruim | Mostra a mensagem customizada direto |

---

## 2) Ações MANUAIS obrigatórias (fora do código)

### A. Google Cloud Console (resolver "Acesso bloqueado")

A mensagem **"Acesso bloqueado: o app conectaclaw.onrender.com não concluiu o processo de verificação do Google"** significa que o seu app Google OAuth está em modo **Testing** e o seu e-mail **não está na lista de test users**.

1. Abra https://console.cloud.google.com/
2. Selecione o projeto usado no OAuth (parece ser `conectaclaw-oauth`)
3. Menu **APIs & Services → OAuth consent screen**
4. Em **Test users**, clique em **+ ADD USERS**
5. Adicione `cistrahenjoel@gmail.com` (e qualquer outro e-mail que for testar)
6. Salve

> ⚠️ Se quiser que **qualquer pessoa** consiga conectar (sem precisar adicionar manualmente), você precisa:
> - Publicar o app (`PUBLISH APP` no consent screen) **E**
> - Passar pelo **OAuth verification** do Google (demora semanas e exige vídeo de demonstração, política de privacidade etc.)
>
> Para uso pessoal / beta, manter em Testing + adicionar test users é o caminho.

### B. Cloud Firestore API (resolver "PERMISSION_DENIED")

A mensagem **"Cloud Firestore API has not been used in project conectaclaw-oauth before or it is disabled"** significa que a Firestore API não está habilitada naquele projeto.

1. Abra https://console.cloud.google.com/apis/library
2. Selecione o projeto correto
3. Pesquise **"Cloud Firestore API"** e clique em **ENABLE**
4. (Opcional, mas recomendado) Habilite também **Firebase Admin SDK API**

> Se o Firestore já está habilitado mas o erro persiste, o problema é que o
> **Service Account** usado nas envs do Render não tem permissão. Garanta que
> a `FIREBASE_CLIENT_EMAIL` é do MESMO projeto que tem o Firestore.

### C. Firebase — variáveis de ambiente

Recomendado: usar `FIREBASE_SERVICE_ACCOUNT` (JSON completo) em vez de 3 variáveis separadas.

1. Firebase Console → **Project settings** (engrenagem) → **Service accounts**
2. **Generate new private key** → baixa um `.json`
3. Abra o JSON inteiro em UMA linha
4. No **Render Dashboard → seu serviço → Environment**:
   - Crie `FIREBASE_SERVICE_ACCOUNT` e cole o JSON inteiro
   - **Remova** `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PROJECT_ID` se existirem
5. (Opcional) `FIREBASE_DATABASE_URL` = `https://SEU-PROJETO-default-rtdb.firebaseio.com` ou `https://SEU-PROJETO.firebaseio.com`

### D. Redirect URIs no Google Cloud

Garanta que em **APIs & Services → Credentials → seu OAuth Client → Authorized redirect URIs** está:

```
https://conectaclaw.onrender.com/oauth/google/callback
```

E a env `GOOGLE_REDIRECT_URI` no Render deve ter **exatamente** o mesmo valor.

### E. Notion — Internal Integration

O Notion OAuth exige que você crie uma **Internal Integration** antes:
1. https://www.notion.so/profile/integrations → **+ New integration**
2. Tipo: **Public** (precisa ser Public para usar OAuth)
3. Capabilities: marque o que quiser (Read content, Update content etc.)
4. Salve → copie o **Client ID** e **Client Secret** → coloque em `NOTION_CLIENT_ID` e `NOTION_CLIENT_SECRET` no Render
5. Em **Redirect URIs**, adicione `https://conectaclaw.onrender.com/oauth/notion/callback`
6. **Importante:** depois de conectar, vá em cada página do Notion que o bot deve acessar → **… → Connections → conecte a sua integration**. Sem isso, a integration existe mas não vê nada.

### F. GitHub OAuth App

1. https://github.com/settings/developers → **New OAuth App**
2. Homepage URL: `https://conectaclaw.onrender.com`
3. Authorization callback URL: `https://conectaclaw.onrender.com/oauth/github/callback`
4. Copie Client ID / Secret para o Render

---

## 3) Variáveis de ambiente no Render (resumo)

```env
TELEGRAM_TOKEN=...              # @BotFather
GROQ_API_KEY=...                # console.groq.com
JWT_SECRET=...                  # gerado automaticamente pelo render.yaml

# Firebase (recomendado: JSON completo)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
# OU, em vez do JSON:
# FIREBASE_PROJECT_ID=conectaclaw-oauth
# FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@conectaclaw-oauth.iam.gserviceaccount.com
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://conectaclaw.onrender.com/oauth/google/callback

# Notion
NOTION_CLIENT_ID=...
NOTION_CLIENT_SECRET=secret_...
NOTION_REDIRECT_URI=https://conectaclaw.onrender.com/oauth/notion/callback

# GitHub
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://conectaclaw.onrender.com/oauth/github/callback

# App
WEBAPP_URL=https://conectaclaw.onrender.com
NODE_ENV=production
# NÃO fixe WEBAPP_PORT — o Render atribui PORT automaticamente
```

---

## 4) Checklist antes de testar

- [ ] Firestore API habilitada no Google Cloud (projeto correto)
- [ ] Service Account do Firebase é do MESMO projeto
- [ ] `FIREBASE_SERVICE_ACCOUNT` (JSON) configurado no Render
- [ ] E-mail `cistrahenjoel@gmail.com` adicionado em **Test users** do Google
- [ ] Redirect URI do Google **bate exatamente** com `GOOGLE_REDIRECT_URI`
- [ ] Internal Integration do Notion criada como **Public** com redirect URI cadastrado
- [ ] GitHub OAuth App com callback URL correto
- [ ] Redeploy no Render depois de salvar as envs

---

## 5) Como testar depois do deploy

1. Abra o bot no Telegram → `/conectar`
2. Clique em **🔌 Abrir Painel de Conectores**
3. Escolha **Notion** (comece por esse, é o que estava quebrado)
4. Autorize → deve voltar com banner verde ✅
5. Volte e tente o **Gmail** — se ainda der "Acesso bloqueado", é o passo A acima
6. Tente **GitHub** — se der erro 404 no callback, é redirect URI errado
