#!/bin/bash

# Script de Deploy OrbitalCloud para Cloudflare
# Uso: ./deploy-cloudflare.sh

set -e

echo "🚀 Deploy OrbitalCloud - Cloudflare Workers"
echo "=============================================="

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Build do frontend
echo -e "\n${YELLOW}📦 Construindo frontend...${NC}"
npm run build

# 2. Entrar na pasta cloudflare
echo -e "\n${YELLOW}📁 Entrando na pasta cloudflare...${NC}"
cd cloudflare

# 3. Instalar dependências cloudflare
echo -e "\n${YELLOW}📥 Instalando dependências do Cloudflare...${NC}"
npm install

# 4. Deploy
echo -e "\n${YELLOW}🚀 Fazendo deploy no Cloudflare...${NC}"
npm run deploy

# 5. Sucesso
echo -e "\n${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo -e "${GREEN}Seu site está disponível em: https://orbitalcloud.seu-subdomain.workers.dev${NC}"
echo -e "\n${YELLOW}Próximos passos:${NC}"
echo "1. Configure seu domínio personalizado no Cloudflare Dashboard"
echo "2. Verifique: wrangler tail (para ver logs em tempo real)"
