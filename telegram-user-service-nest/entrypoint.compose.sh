#!/bin/sh
set -e

echo "Applying Prisma migrations..."
npx prisma migrate deploy --config prisma.config.ts

echo "Starting NestJS..."
exec node dist/main.js
