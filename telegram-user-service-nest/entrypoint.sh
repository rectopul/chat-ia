#!/bin/sh
set -e

# Aguarda o banco de dados estar realmente pronto (opcional mas recomendado)
# sleep 5 

echo "⏳ Rodando Prisma migrations..."

# 1. Resetar o banco (CUIDADO: isso apaga dados em cada reinicialização do container)
# Se você quer manter os dados, use apenas 'prisma migrate deploy'
npx prisma db push --accept-data-loss

echo "⚙️ Gerando Prisma Client..."
npx prisma generate

echo "⚙️ Rodando seed..."
npx prisma db seed

echo "🚀 Iniciando NestJS..."
exec node dist/main.js