# AngoCloud - Deploy no Cloudflare (2025)

Este guia explica como fazer deploy do AngoCloud usando Cloudflare Workers com Assets integrados.

## Arquitetura Unificada

```
┌───────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKERS                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                   Worker Unificado                        │  │
│  │                                                           │  │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐ │  │
│  │  │  Static Assets  │    │       API Routes            │ │  │
│  │  │                 │    │                             │ │  │
│  │  │  • React App    │    │  • /api/auth                │ │  │
│  │  │  • CSS/JS/IMG   │    │  • /api/files               │ │  │
│  │  │  • SPA Routing  │    │  • /api/folders             │ │  │
│  │  └─────────────────┘    │  • /api/shares              │ │  │
│  │                         │  • /api/invitations         │ │  │
│  │                         │  • /api/admin               │ │  │
│  │                         └─────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────┘  │
│                              │                                  │
└──────────────────────────────│──────────────────────────────────┘
                               │
          ┌────────────────────┴────────────────────┐
          │                                         │
          ▼                                         ▼
┌─────────────────────┐               ┌─────────────────────┐
│   Neon PostgreSQL   │               │    Telegram API     │
│   (Base de dados)   │               │   (Armazenamento)   │
└─────────────────────┘               └─────────────────────┘
```

## Vantagens desta Configuração

- **Um único deploy**: Frontend + Backend num só lugar
- **Edge performance**: Resposta rápida em todo o mundo
- **Zero servidores**: Sem gerenciamento de infraestrutura
- **Custo reduzido**: Plano gratuito generoso
- **SSL automático**: HTTPS em todos os domínios

## Pré-requisitos

1. **Conta Cloudflare** (gratuita) - https://cloudflare.com
2. **Conta Neon PostgreSQL** (gratuita) - https://neon.tech
3. **Bot(s) Telegram** criados com @BotFather
4. **Node.js 18+** instalado

## Passo 1: Configurar Base de Dados

```bash
# 1. Crie uma conta em https://neon.tech
# 2. Crie um novo projeto
# 3. Copie a connection string (DATABASE_URL)

# Na pasta raiz do projeto, execute as migrações:
npm run db:push
```

## Passo 2: Instalar Wrangler CLI

```bash
# Instalar globalmente
npm install -g wrangler

# Fazer login no Cloudflare
wrangler login
```

## Passo 3: Configurar o Projeto Cloudflare

```bash
# Entrar na pasta cloudflare
cd cloudflare

# Instalar dependências
npm install
```

## Passo 4: Configurar Secrets

Os secrets são variáveis sensíveis que são criptografadas no Cloudflare:

```bash
cd cloudflare

# Configurar cada secret (será solicitado o valor interativamente)
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put TELEGRAM_BOT_1_TOKEN
wrangler secret put TELEGRAM_STORAGE_CHAT_ID

# Secrets opcionais (bots adicionais)
wrangler secret put TELEGRAM_BOT_2_TOKEN
wrangler secret put TELEGRAM_BOT_3_TOKEN
wrangler secret put TELEGRAM_BOT_4_TOKEN
wrangler secret put TELEGRAM_BOT_5_TOKEN
```

## Passo 5: Deploy

```bash
# Na pasta cloudflare
cd cloudflare

# Build do frontend + deploy do worker
npm run deploy
```

Após o deploy, você receberá uma URL como:
`https://angocloud.seu-subdomain.workers.dev`

## Passo 6: Domínio Personalizado (Opcional)

1. Vá ao **Cloudflare Dashboard**
2. Em **Workers & Pages**, selecione o worker `angocloud`
3. Vá em **Settings** → **Triggers**
4. Clique em **Add Custom Domain**
5. Adicione seu domínio (ex: `angocloud.ao`)

## Desenvolvimento Local

```bash
cd cloudflare

# Copie o template de variáveis
cp .dev.vars.example .dev.vars

# Edite .dev.vars com suas credenciais
# (use um editor de texto)

# Primeiro, faça build do frontend
npm run build

# Depois, inicie o servidor de desenvolvimento
npm run dev
```

O servidor local estará disponível em: `http://localhost:8787`

## Comandos Úteis

```bash
# Ver logs do Worker em tempo real
npm run tail

# Fazer deploy de preview (sem afetar produção)
npm run deploy:preview

# Deploy para produção
npm run deploy

# Adicionar novo secret
npm run secret:set NOME_DO_SECRET
```

## Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `DATABASE_URL` | Connection string PostgreSQL (Neon) | ✅ Sim |
| `JWT_SECRET` | Chave secreta para tokens JWT (min. 32 caracteres) | ✅ Sim |
| `TELEGRAM_BOT_1_TOKEN` | Token do primeiro bot Telegram | ✅ Sim |
| `TELEGRAM_STORAGE_CHAT_ID` | ID do chat para armazenamento | ✅ Sim |
| `TELEGRAM_BOT_2_TOKEN` | Token do segundo bot | ❌ Não |
| `TELEGRAM_BOT_3_TOKEN` | Token do terceiro bot | ❌ Não |
| `TELEGRAM_BOT_4_TOKEN` | Token do quarto bot | ❌ Não |
| `TELEGRAM_BOT_5_TOKEN` | Token do quinto bot | ❌ Não |

## Estrutura de Arquivos

```
cloudflare/
├── worker/
│   ├── index.ts           # Entry point do Worker
│   ├── routes/            # Rotas da API
│   │   ├── auth.ts
│   │   ├── files.ts
│   │   ├── folders.ts
│   │   └── ...
│   ├── middleware/
│   │   └── auth.ts        # Middleware de autenticação
│   └── services/
│       └── telegram.ts    # Serviço Telegram
├── wrangler.toml          # Configuração do Worker
├── tsconfig.json          # Configuração TypeScript
├── package.json           # Dependências
├── .dev.vars.example      # Template de variáveis locais
└── README.md              # Esta documentação
```

## Limites do Plano Gratuito

### Cloudflare Workers
- **100.000 requests/dia**
- 10ms CPU time/request
- 128MB memória

### Neon PostgreSQL (Free Tier)
- 0.5 GB storage
- 1 projeto ativo
- Suspensão após 5 dias de inatividade

## Troubleshooting

### Erro: "Cannot find module 'hono'"
```bash
cd cloudflare && npm install
```

### Erro: "DATABASE_URL not found"
```bash
wrangler secret put DATABASE_URL
# Cole a connection string do Neon
```

### Erro: "Authentication failed"
Verifique se o JWT_SECRET está configurado:
```bash
wrangler secret put JWT_SECRET
```

### O site não carrega (404)
1. Verifique se o frontend foi buildado: `npm run build`
2. Verifique se o path em `wrangler.toml` está correto: `directory = "../dist/public"`

## Suporte

- **Documentação Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Documentação Neon**: https://neon.tech/docs
- **Telegram Bot API**: https://core.telegram.org/bots/api
