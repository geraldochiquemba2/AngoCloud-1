# Guia de Migração - Render para Cloudflare

Este guia detalha os passos para migrar o AngoCloud do Render para Cloudflare Pages + Workers.

## Resumo da Migração

| Componente | Antes (Render) | Depois (Cloudflare) |
|------------|----------------|---------------------|
| Frontend | Servido pelo Express | Cloudflare Pages |
| Backend | Express.js | Cloudflare Workers + Hono |
| Autenticação | Passport.js + Sessões | JWT |
| Hash de Passwords | bcrypt | PBKDF2 (Web Crypto) |
| Base de Dados | PostgreSQL (Render) | Neon PostgreSQL |
| Armazenamento | Telegram | Telegram (sem alteração) |

## Migração de Passwords (Importante!)

### O Problema

O sistema original usa **bcrypt** para hash de passwords. O Cloudflare Workers não suporta nativamente o bcrypt (requer módulos nativos Node.js). Por isso, o novo sistema usa **PBKDF2** via Web Crypto API.

### Estratégias de Migração

#### Opção 1: Migração Gradual (Recomendado)

1. **Durante o login no sistema antigo (Render)**, adicione lógica para re-hash com PBKDF2:

```typescript
// No routes.ts do Render, durante o login bem-sucedido:
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

#### Opção 3: Servidor Proxy (Mais Complexo)

1. Criar um Worker simples que apenas verifica bcrypt
2. Chamar esse Worker durante o login para hashes antigos
3. Migrar hash após verificação bem-sucedida

### Formato dos Hashes

| Tipo | Formato | Exemplo |
|------|---------|---------|
| bcrypt | `$2a$12$...` | `$2a$12$LQv3c1yqBWVHxk...` |
| PBKDF2 | `pbkdf2:salt:hash` | `pbkdf2:YWJjZGVmZ2g=:a1b2c3d4...` |

## Passos de Migração

### 1. Preparar Base de Dados Neon

```bash
# 1. Criar conta em neon.tech
# 2. Criar projeto "angocloud"
# 3. Copiar connection string

# 4. Exportar dados do Render PostgreSQL
pg_dump $RENDER_DATABASE_URL > backup.sql

# 5. Importar para Neon
psql $NEON_DATABASE_URL < backup.sql
```

### 2. Configurar Cloudflare

```bash
cd cloudflare
npm install

# Configurar secrets
wrangler secret put DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put TELEGRAM_BOT_1_TOKEN
wrangler secret put TELEGRAM_STORAGE_CHAT_ID

# Deploy Worker
npm run deploy
```

### 3. Atualizar Frontend

Modifique o frontend conforme `FRONTEND_CHANGES.md`:
- Adicionar armazenamento de token JWT
- Adicionar header Authorization às requisições

### 4. Deploy Frontend

```bash
# Na pasta raiz
npm run build

# Deploy para Pages
cd cloudflare
npm run deploy:pages
```

### 5. Configurar DNS

1. Adicione domínio personalizado no Cloudflare Pages
2. Configure registros DNS:
   - `angocloud.ao` → Cloudflare Pages
   - `api.angocloud.ao` → Cloudflare Workers (opcional)

### 6. Migração de Passwords (script)

Execute este script para preparar a migração:

```sql
-- Adicionar coluna para tracking de migração
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_migrated BOOLEAN DEFAULT FALSE;

-- Identificar usuários que precisam migrar
SELECT COUNT(*) FROM users WHERE password_hash LIKE '$2%' AND password_migrated = FALSE;
```

### 7. Período de Transição

Mantenha ambos os sistemas ativos:

1. **Semana 1-2**: Render ativo, Cloudflare em teste
2. **Semana 3**: Redirecionar 10% do tráfego para Cloudflare
3. **Semana 4**: 50% do tráfego
4. **Semana 5**: 100% do tráfego, desligar Render

## Rollback

Se precisar reverter:

1. Altere DNS de volta para Render
2. Passwords já migrados para PBKDF2 funcionarão em ambos se implementar verificação dual

## Checklist Final

- [ ] Base de dados Neon configurada
- [ ] Dados migrados do Render
- [ ] Worker deployado e testado
- [ ] Frontend deployado no Pages
- [ ] DNS configurado
- [ ] SSL funcionando
- [ ] Telegram bots funcionando
- [ ] Migração de passwords iniciada
- [ ] Monitoramento configurado
- [ ] Render desligado

## Suporte

Em caso de problemas:
1. Verifique logs: `wrangler tail`
2. Verifique métricas no Cloudflare Dashboard
3. Teste endpoints manualmente: `curl https://api.angocloud.ao/api/health`
