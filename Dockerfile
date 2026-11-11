# Imagem da app (loja + backoffice + API) em modo de produção.
# Usada pelo docker-compose.yml: docker compose up -d --build
FROM node:24

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependências primeiro: esta camada só se refaz quando o package-lock.json muda
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# A imagem não leva segredos (o .env fica de fora, ver .dockerignore). O Prisma e o
# build só precisam de um DATABASE_URL com formato válido: nenhuma página vai à BD,
# ao SAP ou ao Moloni durante o build (os dados por pedido ficam depois de connection()).
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# As credenciais chegam ao arrancar, pelo env_file do docker-compose.yml
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
