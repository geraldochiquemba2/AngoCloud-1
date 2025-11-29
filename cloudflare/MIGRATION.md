# Guia de Migração - Render/Replit para Cloudflare Workers

Este guia detalha os passos para migrar o AngoCloud para Cloudflare Workers com Assets integrados (abordagem 2025).

## Resumo da Migração

| Componente | Antes (Render/Replit) | Depois (Cloudflare) |
|------------|----------------------|---------------------|
| Frontend | Servido pelo Express | Cloudflare Workers (Assets) |
| Backend | Express.js | Cloudflare Workers + Hono |
| Deploy | Separado (frontend + backend) | Unificado (único Worker) |
| Autenticação | Passport.js + Sessões | JWT |
| Hash de Passwords | bcrypt | PBKDF2 (Web Crypto) |
| Base de Dados | PostgreSQL | Neon PostgreSQL (serverless) |
| Armazenamento | Telegram | Telegram (sem alteração) |

## Nova Arquitetura (2025)

A Cloudflare consolidou Pages e Workers num único produto. Agora, um único Worker pode servir:
- **Static Assets**: Frontend React automaticamente servido
- **API Routes**: Backend com Hono framework

```
wrangler.toml
├── [assets]
│   └── directory = "../dist/public"  ← Frontend React
└── main = "worker/index.ts"          ← Backend API
```

## Migração de Passwords (Importante!)

### O Problema

O sistema original usa **bcrypt** para hash de passwords. O Cloudflare Workers não suporta nativamente o bcrypt (requer módulos nativos Node.js). Por isso, o novo sistema usa **PBKDF2** via Web Crypto API.

### Estratégias de Migração

#### Opção 1: Migração Gradual (Recomendado)

1. **Durante o login no sistema antigo**, adicione lógica para re-hash com PBKDF2:

```typescript
// No routes.ts durante o login bem-sucedido:
if (user.passwordHash.startsWith('$2')) {  // É bcrypt
  const pbkdf2Hash = await hashWithPBKDF2(password);
  await storage.updatePasswordHash(user.id, pbkdf2Hash);
}
```

2. **Manter ambos os sistemas ativos** por 1-2 semanas
3. **Usuários que fizerem login** terão o hash migrado automaticamente
4. **Usuários inativos** receberão email para reset de password

#### Opção 2: Reset Forçado de Passwords

1. Marcar todas as contas com hash bcrypt como "requer reset"
2. Na próxima tentativa de login, forçar reset de password
3. Mais simples, mas pode frustrar usuários

### Formato dos Hashes

| Tipo | Formato | Exemplo |
|------|---------|---------|
| bcrypt | `$2a$12$...` | `$2a$12$LQv3c1yqBWVHxk...` |
| PBKDF2 | `pbkdf2:salt:hash` | `pbkdf2:YWJjZGVmZ2g=:a1b2c3d4...` |

## Passos de Migração

### 1. Preparar Base de Dados Neon

```bash
# 1. Criar conta em neon.tech (gratuito)
# 2. Criar projeto "angocloud"
# 3. Copiar connection string

# 4. Exportar dados da base atual
pg_dump $DATABASE_URL > backup.sql

# 5. Importar para Neon
psql $NEON_DATABASE_URL < backup.sql
```

### 2. Instalar Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### 3. Configurar Cloudflare

```bash
cd cloudflare
npm install

# Configurar secrets (valores sensíveis)
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put TELEGRAM_BOT_1_TOKEN
wrangler secret put TELEGRAM_STORAGE_CHAT_ID
```

### 4. Build e Deploy

```bash
cd cloudflare

# Build do frontend + deploy do worker (tudo num comando)
npm run deploy
```

Isso irá:
1. Buildar o frontend React para `dist/public/`
2. Fazer deploy do Worker com os assets

### 5. Configurar Domínio

1. Vá ao **Cloudflare Dashboard** → **Workers & Pages**
2. Selecione o worker `angocloud`
3. **Settings** → **Triggers** → **Add Custom Domain**
4. Adicione seu domínio (ex: `angocloud.ao`)

### 6. Migração de Passwords (script SQL)

```sql
-- Adicionar coluna para tracking de migração
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_migrated BOOLEAN DEFAULT FALSE;

-- Identificar usuários que precisam migrar
SELECT COUNT(*) FROM users WHERE password_hash LIKE '$2%' AND password_migrated = FALSE;
```

### 7. Período de Transição

Mantenha ambos os sistemas ativos:

1. **Semana 1-2**: Sistema antigo ativo, Cloudflare em teste
2. **Semana 3**: Redirecionar 10% do tráfego para Cloudflare
3. **Semana 4**: 50% do tráfego
4. **Semana 5**: 100% do tráfego, desligar sistema antigo

## Comandos Úteis

```bash
# Desenvolvimento local
npm run dev

# Ver logs em tempo real
npm run tail

# Deploy de preview (não afeta produção)
npm run deploy:preview

# Deploy para produção
npm run deploy
```

## Rollback

Se precisar reverter:

1. Altere DNS de volta para o sistema antigo
2. Passwords já migrados para PBKDF2 funcionarão em ambos se implementar verificação dual

## Checklist Final

- [ ] Base de dados Neon configurada
- [ ] Dados migrados do sistema antigo
- [ ] Secrets configurados no Cloudflare
- [ ] Worker deployado e testado
- [ ] Domínio personalizado configurado
- [ ] SSL funcionando
- [ ] Telegram bots funcionando
- [ ] Migração de passwords iniciada
- [ ] Sistema antigo desligado

## Suporte

Em caso de problemas:
1. Verifique logs: `wrangler tail`
2. Verifique métricas no Cloudflare Dashboard
3. Teste endpoints: `curl https://seu-dominio/api/health`
