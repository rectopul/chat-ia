# Guia de instalação e execução do projeto

Este guia mostra o passo a passo para preparar o ambiente na **WSL Ubuntu**, instalar **Node.js**, instalar **Docker**, subir o **PostgreSQL no Docker com restart always**, configurar os arquivos **.env**, instalar dependências, executar o **Prisma**, buildar e rodar o **Next.js** e o **NestJS**, e por fim manter tudo rodando com **PM2**.

---

# Estrutura do projeto

/meu-projeto
├── .env
├── package.json
├── telegram-user-service-nest
│ ├── .env
│ └── package.json

- Raiz do projeto → Front-end (Next.js)
- telegram-user-service-nest → Back-end (NestJS)

---

# 1. Atualizar sistema

sudo apt update && sudo apt upgrade -y

---

# 2. Instalar Node.js

## Instalar NVM

curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

Recarregar terminal:

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

Instalar Node LTS:

nvm install --lts
nvm use --lts

Verificar:

node -v
npm -v

---

# 3. Instalar Docker

sudo apt remove docker docker-engine docker.io containerd runc -y
sudo apt install -y ca-certificates curl gnupg lsb-release

sudo mkdir -p /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo service docker start

sudo usermod -aG docker $USER

Testar:

docker --version
docker ps

---

# 4. Rodar PostgreSQL no Docker

docker rm -f postgres-dev 2>/dev/null || true

docker run -d \
--name postgres-dev \
--restart always \
-e POSTGRES_USER=postgres \
-e POSTGRES_PASSWORD=postgres \
-e POSTGRES_DB=app \
-p 5432:5432 \
-v postgres_data:/var/lib/postgresql/data \
postgres:16

Testar:

docker ps

docker exec -it postgres-dev psql -U postgres -d app

---

# 5. Instalar dependências

Front-end:

npm install

Back-end:

cd telegram-user-service-nest
npm install
cd ..

---

# 6. Criar .env do front

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/teletram-bot?schema=public"
NEXTAUTH_SECRET=efde69757d24768319e945157dc0f298181ed884f9af551013939f5352e79847
TELEGRAM_BOT_TOKEN=8571873164:AAFRXaolzTRGxZRQ9icrZB5bFIcyfIrhhOk
TELEGRAM_WEBHOOK_SECRET=efde69757d24768319e945157dc0f298181ed884f9af551013939f5352e79847
SYNCPAY_API_URL=
CRON_SECRET=efde69757d24768319e945157dc0f298181ed884f9af551013939f5352e79847
APP_BASE_URL=https://migration-springer-klein-perl.trycloudflare.com
BLOB_READ_WRITE_TOKEN="vercel_blob_rw_24EOt89DvmKbxT6P_3GZ44f7MD5p2rj11ZHA6L4zZcSI93S"
NEXT_PUBLIC_NEST_API_URL=http://localhost:3001

---

# 7. Criar .env do back

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app?schema=public"
CRON_SECRET="efde69757d24768319e945157dc0f298181ed884f9af551013939f5352e79847"
SYNCPAY_CLIENT_ID="120555ca-053a-4cbb-bda5-fb27e372716f"
SYNCPAY_CLIENT_SECRET="9e0885ac-c04d-4cdb-8002-d37d189d49b8"
SYNCPAY_DEFAULT_CPF="27688457874"
SYNCPAY_DEFAULT_EMAIL="clientes@botelecontents.com"
SYNCPAY_DEFAULT_PHONE="21995812705"
SYNCPAY_WEBHOOK_URL="https://ambient-laser-independent-scsi.trycloudflare.com"

---

# 8. Criar banco do front

docker exec -it postgres-dev psql -U postgres -d app -c 'CREATE DATABASE "teletram-bot";'

---

# 9. Prisma

cd telegram-user-service-nest

npx prisma generate
npx prisma migrate deploy

cd ..

---

# 10. Build

Front:

npm run build

Back:

cd telegram-user-service-nest
npm run build
cd ..

---

# 11. Instalar PM2

npm install -g pm2

---

# 12. Rodar aplicações

Front:

pm2 start npm --name telegram-front -- start

Back:

pm2 start npm --name telegram-back --cwd ./telegram-user-service-nest -- run start:prod

Salvar:

pm2 save

---

# 13. Habilitar no boot

pm2 startup
pm2 save

---

# 14. Comandos úteis

pm2 list
pm2 logs telegram-front
pm2 logs telegram-back
pm2 restart all

Docker:

docker ps
docker logs -f postgres-dev
docker restart postgres-dev
