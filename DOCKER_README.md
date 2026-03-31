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

Com certeza! Adicionar um guia de instalação do Docker no próprio README é excelente para quando você (ou outra pessoa) precisar configurar uma VPS do zero sem ter que buscar tutoriais externos.

Aqui está a seção que você pode copiar e colar no seu arquivo `.md`:

---

## 🚀 Instalação do Docker no Ubuntu (VPS)

Para rodar este projeto em uma VPS Ubuntu limpa, execute os passos abaixo.

### 1. Atualizar o sistema e instalar dependências

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release
```

### 2. Adicionar a chave GPG oficial do Docker

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

### 3. Configurar o repositório

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

### 4. Instalar Docker e Docker Compose V2

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### 5. Configurar permissões (Opcional, mas recomendado)

Para rodar comandos `docker` sem precisar usar `sudo` toda vez:

```bash
sudo usermod -aG docker $USER
# AGORA: Deslogue e logue novamente na VPS para aplicar a mudança
```

### 6. Verificar instalação

```bash
docker --version
docker compose version
```

---

### 💡 Dica de "Cidadão Digital"

Como você está usando o Ubuntu, o **Docker Compose V2** (instalado via `docker-compose-plugin`) agora é chamado como `docker compose` (sem o hífen), que é exatamente o que você já está usando nos seus comandos acima.

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
docker compose up -d --build nest
docker compose up -d --build next
```
