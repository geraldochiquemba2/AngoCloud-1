# Deploy OrbitalCloud no Cloudflare - Guia Rápido

## 🚀 Deploy Automático (Recomendado)

```bash
# Execute o script de deploy
./deploy-cloudflare.sh
```

O script fará automaticamente:
1. ✅ Build do frontend React
2. ✅ Instala dependências do Cloudflare
3. ✅ Faz deploy no Cloudflare Workers
4. ✅ Mostra a URL onde o site está disponível

---

## 🔧 Deploy Manual (Passo a Passo)

Se preferir fazer manualmente:

### 1. Build do Frontend
```bash
npm run build
```

### 2. Entrar na pasta Cloudflare
```bash
cd cloudflare
```

### 3. Instalar Dependências
```bash
npm install
```

### 4. Configurar Secrets (primeira vez apenas)
```bash
# Substitua pelos seus valores reais
wrangler secret put DATABASE_URL
# Cole: postgresql://user:password@host/db

wrangler secret put JWT_SECRET
# Cole: uma chave aleatória com 32+ caracteres

wrangler secret put TELEGRAM_BOT_1_TOKEN
# Cole: seu token do bot Telegram

wrangler secret put TELEGRAM_STORAGE_CHAT_ID
# Cole: o ID do chat onde armazenar arquivos
```

### 5. Deploy
```bash
npm run deploy
```

---

## 📊 Verificar Deploy

### Ver Logs em Tempo Real
```bash
cd cloudflare
wrangler tail
```

### Testar a API
```bash
# Substituir YOUR_SUBDOMAIN pelo seu
curl https://orbitalcloud.YOUR_SUBDOMAIN.workers.dev/api/health
```

### Ver Status do Worker
```bash
wrangler deployments list
```

---

## 🌐 Configurar Domínio Personalizado

1. Acesse **Cloudflare Dashboard**
2. Vá para **Workers & Pages**
3. Selecione `orbitalcloud`
4. **Settings** → **Triggers**
5. Clique em **Add Custom Domain**
6. Digite seu domínio (ex: `angocloud.ao`)

---

## 📝 Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `./deploy-cloudflare.sh` | Deploy automático completo |
| `cd cloudflare && npm run deploy` | Deploy apenas do worker |
| `cd cloudflare && npm run dev` | Executar localmente (port 8787) |
| `cd cloudflare && wrangler tail` | Ver logs em tempo real |
| `wrangler deployments list` | Histórico de deploys |
| `wrangler secret list` | Ver secrets configurados |

---

## ⚠️ Troubleshooting

### Erro: "Cannot find module"
```bash
cd cloudflare && npm install
```

### Erro: "DATABASE_URL not found"
```bash
wrangler secret put DATABASE_URL
```

### Erro: "Unauthorized"
```bash
# Faça login novamente
wrangler login
```

### Erro: "Worker script too large"
- Reduza o tamanho dos bundles
- Use `wrangler publish --minify`

---

## 🔐 Secrets Configurados

Verifique se todos estão configurados:

```bash
wrangler secret list
```

Devem aparecer:
- ✅ DATABASE_URL
- ✅ JWT_SECRET
- ✅ TELEGRAM_BOT_1_TOKEN
- ✅ TELEGRAM_STORAGE_CHAT_ID

---

## 🎯 Fluxo de Atualização

Sempre que atualizar o código:

```bash
# 1. Build
npm run build

# 2. Deploy
cd cloudflare
npm run deploy

# 3. Verificar logs
wrangler tail
```

Ou simplesmente execute:
```bash
./deploy-cloudflare.sh
```
