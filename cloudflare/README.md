# AngoCloud - Cloudflare Deployment Guide

Este guia explica como fazer deploy do AngoCloud no Cloudflare Pages + Workers.

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUDFLARE                           │
│                                                         │
│  ┌─────────────────┐      ┌─────────────────────────┐  │
│  │ Cloudflare Pages│      │   Cloudflare Workers    │  │
│  │                 │      │                         │  │
│  │  • React App    │ ───► │  • API Routes           │  │
│  │  • UI/UX        │      │  • Telegram Integration │  │
│  │  • Estáticos    │      │  • Auth (JWT)           │  │
│  └─────────────────┘      └───────────┬─────────────┘  │
│                                       │                 │
└───────────────────────────────────────│─────────────────┘
                                        │
                    ┌───────────────────▼───────────────┐
                    │    Neon PostgreSQL (externo)      │
                    └───────────────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────┐
                    │         Telegram API              │
                    └───────────────────────────────────┘
```

## Pré-requisitos

1. Conta Cloudflare (gratuita)
2. Conta Neon PostgreSQL (gratuita) - https://neon.tech
3. Bot(s) Telegram criados com @BotFather

## Passo 1: Configurar Base de Dados

1. Crie uma conta em https://neon.tech
2. Crie um novo projeto
3. Copie a connection string (DATABASE_URL)
4. Execute as migrações:

```bash
# Na pasta raiz do projeto
npx drizzle-kit push
```

## Passo 2: Configurar Cloudflare

### 2.1 Instalar Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 2.2 Configurar Secrets

```bash
cd cloudflare

# Configure os secrets (serão solicitados interativamente)
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put TELEGRAM_BOT_1_TOKEN
wrangler secret put TELEGRAM_STORAGE_CHAT_ID
```

### 2.3 Deploy do Worker (API)

```bash
cd cloudflare
npm install
npm run deploy
```

### 2.4 Deploy do Frontend (Pages)

```bash
# Na pasta raiz do projeto
npm run build

# Deploy para Cloudflare Pages
cd cloudflare
npm run deploy:pages
```

## Passo 3: Configurar Domínio Personalizado (Opcional)

1. Vá ao Cloudflare Dashboard
2. Em Workers & Pages, selecione o projeto
3. Em Custom Domains, adicione seu domínio
4. Configure os registros DNS

## Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| DATABASE_URL | Connection string PostgreSQL (Neon) | Sim |
| JWT_SECRET | Chave secreta para tokens JWT | Sim |
| TELEGRAM_BOT_1_TOKEN | Token do primeiro bot | Sim |
| TELEGRAM_BOT_2_TOKEN | Token do segundo bot | Não |
| TELEGRAM_BOT_3_TOKEN | Token do terceiro bot | Não |
| TELEGRAM_STORAGE_CHAT_ID | ID do chat para armazenamento | Sim |

## Desenvolvimento Local

```bash
cd cloudflare

# Copie o template de variáveis
cp .env.example .dev.vars

# Edite .dev.vars com suas credenciais

# Inicie o servidor de desenvolvimento
npm run dev
```

## Comandos Úteis

```bash
# Ver logs do Worker em tempo real
wrangler tail

# Testar localmente
wrangler dev

# Deploy apenas do Worker
wrangler deploy

# Deploy apenas do Frontend
wrangler pages deploy ../dist/public --project-name=angocloud
```

## Limites do Plano Gratuito

### Cloudflare Workers
- 100.000 requests/dia
- 10ms CPU time/request
- 128MB memória

### Cloudflare Pages
- Bandwidth ilimitado
- Builds ilimitados
- Sites ilimitados

### Neon PostgreSQL (Free Tier)
- 500MB storage
- 3GB bandwidth/mês
- 1 projeto

## Suporte

Para problemas ou dúvidas, consulte:
- Documentação Cloudflare Workers: https://developers.cloudflare.com/workers/
- Documentação Neon: https://neon.tech/docs
- Telegram Bot API: https://core.telegram.org/bots/api
