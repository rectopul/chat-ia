# 🚀 Sistema de Scraping e Transferência de Usuários - Telegram

Sistema completo para extrair membros de grupos públicos do Telegram e transferi-los automaticamente para seu grupo, com proteção anti-banimento integrada.

---

## 📦 Arquivos Incluídos

### 📄 Documentação

- **SCRAPING_GUIDE.md** - Guia completo de uso, limites do Telegram, troubleshooting
- **EXAMPLES.ts** - Exemplos práticos de código e automações
- **README_INSTALACAO.md** - Este arquivo

### 🔧 Código-Fonte

- **group-scraper.service.ts** - Service principal de scraping e orquestração
- **transfer.processor.ts** - Worker BullMQ com rate limiting anti-ban
- **scraper.controller.ts** - Endpoints HTTP de gerenciamento
- **telegram-scraping-interfaces.ts** - Interfaces TypeScript
- **telegram.module.updated.ts** - Módulo atualizado com dependências

### 🗄️ Banco de Dados

- **migrations.sql** - Migrations SQL e queries úteis

---

## 🎯 O Que Este Sistema Faz

✅ Extrai automaticamente membros de grupos públicos do Telegram  
✅ Adiciona usuários ao seu grupo com rate limiting inteligente  
✅ Evita banimentos com delays randomizados (60-120s entre convites)  
✅ Limite diário configurável (padrão: 50 convites/dia)  
✅ Retry automático com backoff exponencial  
✅ Tracking completo de status no banco de dados  
✅ Dashboard Bull Board para monitoramento em tempo real  
✅ Tratamento de FloodWait, PEER_FLOOD e erros de privacidade

---

## 📋 Pré-Requisitos

- ✅ NestJS rodando
- ✅ PostgreSQL configurado
- ✅ Prisma ORM configurado
- ✅ BullMQ configurado
- ✅ Redis rodando (para BullMQ)
- ✅ Conta Telegram **autenticada via MTProto** (já funcionando no seu sistema)
- ✅ Permissões de administrador no grupo destino

---

## 🔧 Instalação

### 1. Adicionar Modelos ao Prisma

Abra seu `prisma/schema.prisma` e adicione os seguintes modelos:

```prisma
enum ScrapingJobStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
}

enum TransferStatus {
  PENDING
  TRANSFERRED
  FAILED
  FLOOD_WAIT
  USER_PRIVACY
  NOT_MUTUAL
  ALREADY_PARTICIPANT
}

model GroupScrapingJob {
  id                String            @id @default(cuid())
  botId             String
  sourceGroupId     String
  sourceGroupTitle  String?
  targetGroupId     String
  targetGroupTitle  String?
  status            ScrapingJobStatus @default(PENDING)
  totalUsers        Int               @default(0)
  scrapedUsers      Int               @default(0)
  transferredUsers  Int               @default(0)
  failedUsers       Int               @default(0)
  startedAt         DateTime?
  completedAt       DateTime?
  error             String?

  scrapedMembers    ScrapedUser[]
  transfers         UserTransfer[]

  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([botId])
  @@index([status])
}

model ScrapedUser {
  id                String   @id @default(cuid())
  jobId             String
  userId            String
  username          String?
  firstName         String?
  lastName          String?
  phone             String?
  isBot             Boolean  @default(false)
  isPremium         Boolean  @default(false)

  job               GroupScrapingJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  transfers         UserTransfer[]

  createdAt         DateTime @default(now())

  @@unique([jobId, userId])
  @@index([jobId])
  @@index([userId])
}

model UserTransfer {
  id                String         @id @default(cuid())
  jobId             String
  scrapedUserId     String
  userId            String
  status            TransferStatus @default(PENDING)
  attempts          Int            @default(0)
  lastAttemptAt     DateTime?
  transferredAt     DateTime?
  error             String?
  floodWaitUntil    DateTime?

  job               GroupScrapingJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  scrapedUser       ScrapedUser      @relation(fields: [scrapedUserId], references: [id], onDelete: Cascade)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([jobId])
  @@index([status])
  @@index([floodWaitUntil])
}
```

### 2. Rodar Migration

```bash
npx prisma migrate dev --name add_scraping_system
npx prisma generate
```

### 3. Atualizar Constants

Adicione ao arquivo `src/telegram/constants/index.ts`:

```typescript
// ── Group Scraping & Transfer ────────────────────────────────────────────
export const TRANSFER_QUEUE_NAME = "user-transfer";
export const SCRAPE_GROUP_JOB = "scrape-group";
export const TRANSFER_USER_JOB = "transfer-user";

export const TRANSFER_DELAYS = {
    MIN_SECONDS: 60,
    MAX_SECONDS: 120,
    DAILY_LIMIT: 50,
    FLOOD_WAIT_BUFFER: 60,
} as const;
```

### 4. Copiar Arquivos de Código

Organize os arquivos na seguinte estrutura:

```
src/telegram/
├── constants/
│   └── index.ts (adicionar constantes acima)
├── interfaces/
│   └── scraping.interfaces.ts (copiar telegram-scraping-interfaces.ts)
├── services/
│   └── group-scraper.service.ts (copiar)
├── processors/
│   └── transfer.processor.ts (copiar)
├── controllers/
│   └── scraper.controller.ts (copiar)
└── telegram.module.ts (substituir pelo telegram.module.updated.ts)
```

### 5. Instalar Dependências (se necessário)

```bash
npm install @nestjs/bullmq bullmq
```

### 6. Reiniciar Aplicação

```bash
npm run start:dev
```

---

## 🚀 Uso Básico

### Via API

```bash
# Iniciar scraping
curl -X POST http://localhost:3000/telegram/scraper/start \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "seu-bot-id",
    "sourceGroupId": "@grupopublico",
    "targetGroupId": "-1001234567890"
  }'

# Monitorar progresso
curl http://localhost:3000/telegram/scraper/progress/JOB_ID

# Listar jobs
curl http://localhost:3000/telegram/scraper/jobs
```

### Via Código

```typescript
import { GroupScraperService } from './services/group-scraper.service';

// Injetar no construtor
constructor(private scraper: GroupScraperService) {}

// Iniciar scraping
const { jobId } = await this.scraper.startScraping(
  'bot-id',
  '@grupopublico',
  '-1001234567890'
);

// Consultar progresso
const progress = await this.scraper.getProgress(jobId);
```

---

## 📊 Monitoramento

### Bull Board Dashboard

Acesse: `http://localhost:3000/bull-board`

Você verá:

- Fila `send-message` (envio de templates)
- Fila `user-transfer` (transferências de usuários - NOVA)

### Logs

```bash
# Via console
npm run start:dev

# Buscar erros específicos
grep "FLOOD_WAIT" logs.txt
grep "PEER_FLOOD" logs.txt
```

### Queries SQL Úteis

Veja o arquivo `migrations.sql` para queries prontas de análise.

---

## ⚙️ Configuração Avançada

### Ajustar Rate Limits

Edite `src/telegram/constants/index.ts`:

```typescript
export const TRANSFER_DELAYS = {
    MIN_SECONDS: 180, // 3 min entre convites (mais conservador)
    MAX_SECONDS: 300, // 5 min máximo
    DAILY_LIMIT: 20, // 20 convites/dia (conta nova)
    FLOOD_WAIT_BUFFER: 120, // 2 min de buffer após flood
};
```

### Conta Premium

Para contas Premium do Telegram, você pode ser mais agressivo:

```typescript
DAILY_LIMIT: 100,
MIN_SECONDS: 30,
MAX_SECONDS: 60,
```

---

## 🔒 Segurança e Boas Práticas

### ✅ Fazer

- Começar com limites conservadores (20-30/dia)
- Usar contas antigas (> 6 meses)
- Testar com grupos pequenos primeiro
- Monitorar logs constantemente
- Respeitar FloodWait rigorosamente

### ❌ Não Fazer

- Usar contas novas para scraping pesado
- Forçar retry em PEER_FLOOD
- Ignorar erros de FloodWait
- Processar múltiplos jobs simultâneos
- Usar contas pessoais importantes

---

## 🆘 Problemas Comuns

### FloodWait Constante

**Solução:** Reduza `DAILY_LIMIT` para 20 e aumente `MIN_SECONDS` para 180.

### PEER_FLOOD (Ban Temporário)

**Solução:** O sistema já pausa automaticamente por 24h. Aguarde.

### Muitos "USER_PRIVACY_RESTRICTED"

**Normal:** 30-50% dos usuários podem ter privacidade ativada.

### Job Travado

```bash
# Retry manual
curl -X POST http://localhost:3000/telegram/scraper/retry/JOB_ID
```

---

## 📚 Documentação Adicional

- **SCRAPING_GUIDE.md** - Guia completo com limites do Telegram e troubleshooting
- **EXAMPLES.ts** - Exemplos de código e automações
- **migrations.sql** - Queries SQL prontas para análise

---

## 🎯 Próximos Passos

1. ✅ Instalar dependências
2. ✅ Adicionar modelos ao Prisma
3. ✅ Rodar migrations
4. ✅ Copiar arquivos de código
5. ✅ Atualizar constants
6. ✅ Reiniciar aplicação
7. ✅ Testar com grupo pequeno
8. ✅ Monitorar Bull Board
9. ✅ Ajustar rate limits conforme necessário

---

## ✨ Features Futuras (Sugestões)

- [ ] Webhook para notificações de conclusão
- [ ] Interface web de gerenciamento
- [ ] Filtros avançados (por atividade, premium, etc.)
- [ ] Exportar lista de usuários extraídos
- [ ] Agendamento de scraping recorrente

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Consulte `SCRAPING_GUIDE.md`
2. Verifique logs no Bull Board
3. Revise queries SQL em `migrations.sql`
4. Consulte exemplos em `EXAMPLES.ts`

---

**Desenvolvido com ❤️ para automação segura do Telegram**
