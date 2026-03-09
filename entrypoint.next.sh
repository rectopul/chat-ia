#!/bin/sh
set -e

echo "🚀 Iniciando Next.js standalone..."
# Remova o prisma generate daqui se ele já foi feito no estágio 'builder'
# Se precisar rodar migrações no front (raro), use o npx prisma db push ou deploy
# mas lembre-se que o usuário precisa ter permissão de escrita.

exec node server.js