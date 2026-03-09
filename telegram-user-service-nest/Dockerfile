# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20.19.0-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY telegram-user-service-nest/package*.json ./

# --include=dev garante @nestjs/cli e typescript disponíveis para o build
RUN npm ci --include=dev

# Copia código fonte (inclui prisma.config.ts)
COPY telegram-user-service-nest/ .

# Copia schema e migrations da raiz (compartilhados com o Next)
COPY prisma ./prisma

# prisma generate usa o prisma.config.ts que já aponta para o schema correto
RUN ./node_modules/.bin/prisma generate

# Compila TypeScript
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20.19.0-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
# prisma.config.ts é necessário em runtime para o migrate deploy
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

COPY telegram-user-service-nest/entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r//' ./entrypoint.sh && chmod +x ./entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]