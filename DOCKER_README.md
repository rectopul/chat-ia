# Docker Setup

## Estrutura esperada dos arquivos

Coloque os arquivos na raiz do projeto assim:

```
/ (raiz — pasta do Next.js)
├── Dockerfile.next          ← copiado daqui
├── docker-compose.yml       ← copiado daqui
├── .dockerignore            ← copiado daqui
├── entrypoint.next.sh       ← copiado daqui
├── next.config.js
├── package.json
├── prisma/
└── telegram-user-service-nest/
    ├── Dockerfile           ← renomeie Dockerfile.nest para Dockerfile e coloque aqui
    ├── entrypoint.sh        ← renomeie entrypoint.nest.sh para entrypoint.sh e coloque aqui
    ├── package.json
    ├── prisma/
    └── src/
```

## Configuração obrigatória do Next.js

Para o build standalone funcionar, adicione em `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone", // ← OBRIGATÓRIO para Docker
    // ...resto da config
};
module.exports = nextConfig;
```

## Subir o ambiente

```bash
# Build e sobe tudo
docker compose up --build

# Apenas sobe (sem rebuild)
docker compose up

# Em background
docker compose up -d

# Ver logs
docker compose logs -f

# Ver logs de um serviço específico
docker compose logs -f nest
docker compose logs -f next

# Parar tudo
docker compose down

# Parar e apagar volumes (CUIDADO: apaga o banco)
docker compose down -v
```

## Serviços e portas

| Serviço  | Porta | URL                   |
| -------- | ----- | --------------------- |
| Next.js  | 3000  | http://localhost:3000 |
| NestJS   | 3001  | http://localhost:3001 |
| Postgres | 5432  | localhost:5432        |

## Comunicação entre serviços

Dentro do Docker os containers se comunicam pelo nome do serviço:

- Next.js → NestJS: `http://nest:3001` (variável `NEST_API_URL`)
- Ambos → Postgres: `postgresql://postgres:postgres@postgres:5432/teletram-bot`

A variável `NEXT_PUBLIC_NEST_API_URL=http://localhost:3001` é usada pelo
browser do cliente (fora do Docker), por isso mantém `localhost`.

## Migrations

As migrations rodam automaticamente no entrypoint de cada serviço antes
de iniciar a aplicação. Não é necessário rodar manualmente.

## Atualizando o código

```bash
# Rebuild apenas o serviço alterado
docker compose up --build nest
docker compose up --build next
```
