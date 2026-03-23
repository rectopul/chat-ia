# 🤖 Sistema de Scraping e Transferência de Usuários - Telegram

Sistema completo para extrair membros de grupos públicos do Telegram e transferi-los para seu próprio grupo, com proteção anti-banimento.

---

## 📋 Índice

1. [Características](#características)
2. [Limites do Telegram](#limites-do-telegram)
3. [Como Usar](#como-usar)
4. [Endpoints da API](#endpoints-da-api)
5. [Monitoramento](#monitoramento)
6. [Solução de Problemas](#solução-de-problemas)
7. [Arquitetura](#arquitetura)

---

## ✨ Características

- ✅ **Scraping de grupos públicos** via MTProto
- ✅ **Fila inteligente** com BullMQ para processamento assíncrono
- ✅ **Rate limiting agressivo** para evitar banimentos
- ✅ **Retry automático** com backoff exponencial
- ✅ **Tracking completo** de transferências no banco de dados
- ✅ **Status granular**: pendente, transferido, falha, flood wait, privacidade, etc.
- ✅ **Limite diário configurável** (padrão: 50 convites/dia)
- ✅ **Delay randomizado** entre 60-120s entre cada convite
- ✅ **Detecção de FloodWait** com pausa automática da fila
- ✅ **Dashboard de progresso** em tempo real

---

## ⚠️ Limites do Telegram

### Limites de Convite

O Telegram impõe limites rigorosos para prevenir spam:

| Tipo de Conta            | Convites/Dia | Observações       |
| ------------------------ | ------------ | ----------------- |
| Conta nova (< 1 mês)     | 20-30        | Alto risco de ban |
| Conta média (1-6 meses)  | 50-80        | Risco moderado    |
| Conta antiga (> 6 meses) | 100-200      | Risco baixo       |
| Conta Premium            | 200-300      | Menor risco       |

### Tipos de Erro e Significado

| Erro                       | Significado                | Ação do Sistema               |
| -------------------------- | -------------------------- | ----------------------------- |
| `FLOOD_WAIT_X`             | Limite temporário atingido | Pausa por X segundos + buffer |
| `PEER_FLOOD`               | Ban temporário (24-48h)    | Pausa job por 24h             |
| `USER_PRIVACY_RESTRICTED`  | Usuário bloqueou convites  | Marca como falha, não retenta |
| `USER_CHANNELS_TOO_MUCH`   | Usuário em muitos grupos   | Marca como falha, não retenta |
| `USER_ALREADY_PARTICIPANT` | Usuário já está no grupo   | Marca como sucesso            |

---

## 🚀 Como Usar

### 1. Migração do Banco de Dados

Primeiro, adicione os modelos ao seu `schema.prisma` e rode a migração:

```bash
npx prisma migrate dev --name add_scraping_models
npx prisma generate
```

### 2. Configuração Inicial

O sistema já vem configurado com valores seguros:

```typescript
// src/telegram/constants/index.ts
export const TRANSFER_DELAYS = {
    MIN_SECONDS: 60, // Mínimo 60s entre convites
    MAX_SECONDS: 120, // Máximo 120s entre convites
    DAILY_LIMIT: 50, // Limite diário conservador
    FLOOD_WAIT_BUFFER: 60, // Buffer após flood wait
};
```

Para ajustar os limites de acordo com a idade da sua conta:

```typescript
// Para conta antiga/premium
DAILY_LIMIT: 100;

// Para conta nova
DAILY_LIMIT: 20;
```

### 3. Iniciar Scraping

**Via API:**

```bash
curl -X POST http://localhost:3000/telegram/scraper/start \
  -H "Content-Type: application/json" \
  -d '{
    "botId": "seu-bot-id",
    "sourceGroupId": "@grupopublico",
    "targetGroupId": "-1001234567890"
  }'
```

**Resposta:**

```json
{
    "jobId": "clx123abc...",
    "message": "Scraping iniciado. Job ID: clx123abc..."
}
```

### 4. Monitorar Progresso

```bash
# Status de um job específico
curl http://localhost:3000/telegram/scraper/progress/clx123abc

# Listar todos os jobs
curl http://localhost:3000/telegram/scraper/jobs

# Filtrar por bot
curl http://localhost:3000/telegram/scraper/jobs?botId=seu-bot-id
```

**Resposta:**

```json
{
    "jobId": "clx123abc",
    "status": "IN_PROGRESS",
    "totalUsers": 1000,
    "scrapedUsers": 1000,
    "transferredUsers": 45,
    "failedUsers": 5,
    "pendingUsers": 950,
    "errors": []
}
```

---

## 📡 Endpoints da API

### `POST /telegram/scraper/start`

Inicia scraping de um grupo público.

**Body:**

```json
{
    "botId": "string", // ID da conta bot no banco
    "sourceGroupId": "string", // @username ou ID do grupo público
    "targetGroupId": "string" // ID do seu grupo (ex: "-1001234567890")
}
```

**Resposta:**

```json
{
    "jobId": "string",
    "message": "Scraping iniciado. Job ID: xxx"
}
```

---

### `GET /telegram/scraper/jobs?botId=xxx`

Lista todos os jobs de scraping (últimos 50).

**Query Params:**

- `botId` (opcional): filtra jobs por bot

**Resposta:**

```json
[
  {
    "jobId": "string",
    "status": "IN_PROGRESS" | "COMPLETED" | "FAILED",
    "totalUsers": 1000,
    "scrapedUsers": 1000,
    "transferredUsers": 45,
    "failedUsers": 5,
    "pendingUsers": 950,
    "errors": []
  }
]
```

---

### `GET /telegram/scraper/progress/:jobId`

Consulta progresso detalhado de um job.

**Resposta:**

```json
{
    "jobId": "clx123abc",
    "status": "IN_PROGRESS",
    "totalUsers": 1000,
    "scrapedUsers": 1000,
    "transferredUsers": 45,
    "failedUsers": 5,
    "pendingUsers": 950,
    "errors": []
}
```

---

### `POST /telegram/scraper/retry/:jobId`

Retenta transferências falhadas de um job específico.

**Resposta:**

```json
{
    "retried": 5,
    "message": "5 transferências reenfileiradas"
}
```

---

## 📊 Monitoramento

### Bull Board (Dashboard de Filas)

O sistema já integra com Bull Board para visualização em tempo real:

```
http://localhost:3000/bull-board
```

Você verá duas filas:

- `send-message`: Envio de templates (já existente)
- `user-transfer`: Transferências de usuários (nova)

### Logs

O sistema loga todas as operações importantes:

```typescript
[GroupScraperService] Job clx123abc criado para @source → -1001234
[TransferProcessor] ✅ Usuário 123456789 adicionado ao grupo
[TransferProcessor] ⏸️ FloodWait: aguardar até 2024-03-20T15:30:00Z
[TransferProcessor] 🚨 PEER_FLOOD detectado! Pausando por 24h
```

### Consulta ao Banco de Dados

```sql
-- Status geral de um job
SELECT status, COUNT(*) as count
FROM "UserTransfer"
WHERE "jobId" = 'clx123abc'
GROUP BY status;

-- Transferências com flood wait
SELECT userId, floodWaitUntil
FROM "UserTransfer"
WHERE status = 'FLOOD_WAIT'
  AND floodWaitUntil > NOW();
```

---

## 🔧 Solução de Problemas

### Problema: FloodWait constante

**Causa:** Limite de convites atingido muito rápido.

**Solução:**

1. Reduza o `DAILY_LIMIT`
2. Aumente o `MIN_SECONDS` para 180 ou mais
3. Aguarde 24h antes de retomar

```typescript
DAILY_LIMIT: 20,      // Reduzido
MIN_SECONDS: 180,     // 3 minutos entre convites
```

---

### Problema: PEER_FLOOD (ban temporário)

**Causa:** Muitos convites em curto período ou comportamento de spam.

**Solução:**

1. Sistema já pausa automaticamente por 24h
2. Não tente forçar — espere o período passar
3. Use conta mais antiga ou Premium
4. Reduza limites drasticamente após o ban:

```typescript
DAILY_LIMIT: 10,
MIN_SECONDS: 300      // 5 minutos entre convites
```

---

### Problema: Muitos "USER_PRIVACY_RESTRICTED"

**Causa:** Usuários configuraram privacidade para não receber convites.

**Solução:**

- Normal — 30-50% dos usuários podem ter isso ativado
- Sistema marca como falha e não retenta
- Foque em grupos com usuários mais ativos

---

### Problema: Job travado em "PENDING"

**Causa:** Fila pausada ou worker não rodando.

**Solução:**

```bash
# Verificar se o worker está ativo
curl http://localhost:3000/bull-board

# Reiniciar serviço
npm run start:dev

# Retry manual
curl -X POST http://localhost:3000/telegram/scraper/retry/JOB_ID
```

---

## 🏗️ Arquitetura

### Fluxo de Processamento

```
1. POST /scraper/start
   ↓
2. GroupScraperService cria job no banco
   ↓
3. Job SCRAPE_GROUP enfileirado
   ↓
4. TransferProcessor extrai membros do grupo
   ↓
5. Para cada membro:
   - Salva em ScrapedUser
   - Cria UserTransfer (status: PENDING)
   - Enfileira TRANSFER_USER_JOB com delay calculado
   ↓
6. TransferProcessor processa transferências
   - Delay: 60-120s randomizado
   - Limite: 50/dia
   - Retry automático com backoff
   ↓
7. Status atualizado em tempo real no banco
```

### Componentes

| Componente                 | Responsabilidade                    |
| -------------------------- | ----------------------------------- |
| `GroupScraperService`      | Orquestra scraping e transferências |
| `TransferProcessor`        | Worker da fila com rate limiting    |
| `ScraperController`        | Endpoints HTTP de gerenciamento     |
| `GroupScrapingJob` (model) | Job principal de scraping           |
| `ScrapedUser` (model)      | Usuários extraídos                  |
| `UserTransfer` (model)     | Status de transferência             |

### Segurança Anti-Ban

1. **Concurrency: 1** — Apenas 1 worker processa por vez
2. **Delay randomizado** — 60-120s entre convites
3. **Limite diário** — 50 convites/dia (configurável)
4. **Backoff exponencial** — Aumenta delay após erros
5. **FloodWait detection** — Pausa automática da fila
6. **PEER_FLOOD handling** — Pausa de 24h automática

---

## 🎯 Melhores Práticas

### ✅ Fazer

- ✅ Começar com limites conservadores (20-30/dia)
- ✅ Usar contas antigas (> 6 meses)
- ✅ Testar com grupos pequenos primeiro
- ✅ Monitorar logs constantemente
- ✅ Respeitar FloodWait rigorosamente
- ✅ Usar Telegram Premium se possível

### ❌ Não Fazer

- ❌ Usar contas novas para scraping pesado
- ❌ Forçar retry em PEER_FLOOD
- ❌ Aumentar limites drasticamente
- ❌ Ignorar erros de FloodWait
- ❌ Processar múltiplos jobs simultaneamente
- ❌ Usar contas pessoais importantes

---

## 📈 Expectations Realistas

| Cenário       | Usuários/Dia | Tempo para 1000 |
| ------------- | ------------ | --------------- |
| Conta nova    | 20-30        | 33-50 dias      |
| Conta média   | 50-80        | 12-20 dias      |
| Conta antiga  | 100-150      | 7-10 dias       |
| Conta Premium | 200-300      | 3-5 dias        |

**Lembre-se:** O Telegram detecta padrões. Melhor lento e constante que rápido e banido.

---

## 🆘 Suporte

Para problemas ou dúvidas:

1. Consulte logs detalhados em `/bull-board`
2. Verifique status no banco de dados
3. Revise configurações de rate limiting
4. Consulte documentação oficial do Telegram

---

## 📝 Changelog

### v1.0.0 (2024-03-20)

- ✨ Sistema completo de scraping e transferência
- ✨ Rate limiting anti-ban integrado
- ✨ Dashboard Bull Board
- ✨ Tracking granular de status
- ✨ Retry automático inteligente
