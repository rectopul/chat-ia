# Telegram User Service (NestJS) - Documentação de Estrutura e Backend

Este documento descreve a arquitetura, estrutura de pastas e funcionalidades do serviço de backend construído em NestJS dentro da pasta `telegram-user-service-nest`. O sistema é um motor híbrido de automação para Telegram, combinando o protocolo **MTProto (User Account)** e a **Bot API (Business Bot)**.

---

## 🏗️ Arquitetura Geral

O projeto utiliza uma arquitetura de microserviço baseada em NestJS, focada em alta disponibilidade e processamento assíncrono.

- **Dual Protocol**: Utiliza `gramjs` para conexões MTProto (contas de usuário) e `node-telegram-bot-api` para funcionalidades de Telegram Business.
- **Processamento de Filas**: Utiliza **BullMQ (Redis)** para gerenciar o envio de mídias pesadas (vídeos, áudios) e álbuns (COMBO), garantindo retentativas automáticas e evitando bloqueios de polling.
- **Persistência**: Integração com PostgreSQL via **Prisma ORM**.
- **Pagamentos**: Integração nativa com **SyncPay** para geração de cobranças via PIX.

---

## 📁 Estrutura de Pastas (`src/`)

```text
src/
├── prisma/             # Configuração e serviço do Prisma ORM
├── schedule/           # Gestão de agendamentos e Cron Jobs (Vercel/Railway)
├── syncpay/            # Integração com o gateway de pagamentos SyncPay
├── template/           # Gestão de MessageTemplates e réguas de envio
├── telegram/           # Módulo CORE (Lógica de Telegram)
│   ├── constants/      # Strings globais, nomes de filas e textos fixos
│   ├── interfaces/     # Definições de tipos (DTOs, ReadyItems, Contextos)
│   ├── processors/     # Workers do BullMQ (Processamento de mensagens em fila)
│   ├── providers/      # Camada de Infraestrutura (MtprotoProvider e BotApiProvider)
│   ├── services/       # Lógica de Negócio (BusinessBot, Media, Session, Scheduler)
│   ├── telegram.controller.ts # Endpoints da API (send, auth, status, etc)
│   └── telegram.module.ts     # Injeção de dependências do módulo
├── app.module.ts       # Módulo raiz (configuração de Redis, BullBoard e Env)
└── main.ts             # Ponto de entrada da aplicação
```

---

## 🔧 Módulos e Funcionalidades

### 1. Módulo Telegram (Core)

O coração do sistema, dividido para separar responsabilidades técnicas de regras de negócio.

#### **Providers (Infraestrutura)**

- **`MtprotoProvider`**: Gerencia instâncias de `TelegramClient` (GramJS). Responsável pela conexão, eventos de mensagens recebidas via conta de usuário e autenticação (OTP/2FA).
- **`BotApiProvider`**: Gerencia instâncias de bots do Telegram. Mantém mapas de `business_connection` para resolver qual conexão usar ao responder clientes.

#### **Services (Negócio)**

- **`TelegramService`**: Fachada principal (Facade). Centraliza a API pública para consumo externo.
- **`BusinessBotService`**: Gerencia o ciclo de vida do bot Business, processa mensagens de boas-vindas (`handleGreeting`), menus de produtos e callbacks de compra.
- **`TemplateService`**: Decide se uma mensagem deve ser enviada imediatamente (Texto) ou enfileirada (Mídias/Combo) via BullMQ.
- **`MediaService`**: O motor de mídias. Faz download de URLs, conversão de áudio para OGG Opus (via FFmpeg), redimensionamento de imagens (via Sharp) e gerencia o **MediaCache** (reuso de `file_id` para envios instantâneos).
- **`SessionService`**: Orquestra o fluxo de login em contas Telegram (Envio de código, Verificação e Senha 2FA).
- **`SchedulerService`**: Gerencia o agendamento de mensagens de "recuperação" (`DONT_SELL`) no banco de dados.

#### **Processors (Assíncrono)**

- **`MessageProcessor`**: Worker do BullMQ que consome a fila `send-message`. Ele executa o upload real de arquivos para os servidores do Telegram e gerencia o progresso dos envios de combos.

### 2. Módulo SyncPay

- **`SyncPayService`**: Realiza a autenticação via OAuth2 com a SyncPay, gera cobranças PIX "Copia e Cola" e processa webhooks de confirmação de pagamento.

### 3. Módulo Schedule

- **`ScheduleService`**: Serviço disparado por triggers externos (Cron).
    - `processJobs()`: Envia mensagens agendadas (Drip Campaigns).
    - `processRecurringSchedules()`: Envia transmissões baseadas em horário fixo e dia da semana.

### 4. Módulo Template

- **`TemplateService`**: Provê métodos para buscar regras de mensagens e associá-las a segmentos de usuários (Novos usuários, Compradores, etc).

---

## 📊 Modelagem de Dados (Prisma)

Principais entidades do sistema:

- **`BotAccount`**: Armazena tokens de bots, credenciais MTProto (API ID/Hash) e a string de sessão criptografada.
- **`TelegramUser`**: Registro de clientes que interagiram com os bots, incluindo status de assinatura e segmento.
- **`MessageTemplate`**: Definição da mensagem (Texto, Imagem, Vídeo ou COMBO).
- **`ScheduledMessageJob`**: Fila de mensagens agendadas no banco de dados para envio futuro.
- **`BusinessConnection`**: Mapeamento ativo entre uma conta de usuário e um bot auxiliar Business.
- **`MediaCache`**: Armazena `telegramDocId` e `accessHash` para evitar re-upload de arquivos pesados.

---

## 🔄 Fluxos Principais

1. **Boas-vindas (Greeting)**:
   Mensagem Recebida → `BusinessBotService` identifica novo usuário → Dispara `handleGreeting` → Envia Template `WELCOME` → Agenda `DONT_SELL` via `SchedulerService`.

2. **Envio de Mídia (Combo/Vídeo)**:
   Pedido de envio → `TemplateService` adiciona job ao `BullMQ` → `MessageProcessor` baixa mídia → Converte (se necessário) → Sobe para o Telegram → Salva `file_id` no `MediaCache`.

3. **Fluxo de Venda**:
   Botão "Comprar" clicado → `BusinessBotService` chama `SyncPayService` → Cria Venda no banco → Envia PIX Copia e Cola + Áudio de instrução via `MediaService`.

4. **Confirmação de Pagamento**:
   Webhook recebido → `SyncPayService` valida → `TelegramService.confirmPayment` envia link de acesso ao cliente via Bot Business API.

---

## 🚀 Tecnologias Utilizadas

- **NestJS** (Framework)
- **Prisma** (ORM)
- **GramJS** (MTProto)
- **BullMQ** (Filas/Redis)
- **FFmpeg** (Processamento de Áudio)
- **Sharp** (Processamento de Imagem)
- **Axios** (Integração HTTP)

---

## 🧭 Convenções de Implementação

- Em Next.js/App Router, **nunca** colocar `server actions` no mesmo arquivo de componentes React.
- Sempre separar ações de servidor em arquivos dedicados, como `actions.ts`, `mutations.ts` ou outro arquivo server-only ao lado do componente.
- Componentes de UI devem importar essas ações separadas, mantendo o arquivo do componente focado apenas em renderização, estado local e interação.
