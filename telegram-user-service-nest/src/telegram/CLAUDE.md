# AGENTS.md

## Objetivo desta pasta

Esta é a pasta central da integração com Telegram. Ela concentra:

- autenticação MTProto
- operação de Business Bot
- envio de templates e mídia
- filas BullMQ
- callbacks e mensagens business
- helpers de tipos e constantes

## Estrutura interna

- `telegram.module.ts`: composição do módulo
- `telegram.controller.ts`: endpoints HTTP de integração e manutenção
- `constants/`: constantes compartilhadas
- `interfaces/`: tipos compartilhados
- `providers/`: infraestrutura e estados em memória
- `services/`: regras de negócio Telegram
- `processors/`: workers BullMQ

## Responsabilidades do módulo

- inicializar contas MTProto e business bots
- expor fachada única via `TelegramService`
- enfileirar mídia pesada
- resolver business connections
- processar mensagens, callbacks e compras

## Regras

- controllers não devem conter lógica pesada
- `TelegramService` atua como fachada
- providers são donos do estado em memória
- processors executam o trabalho assíncrono de fila
- serviços devem permanecer coesos por responsabilidade

## Atenções

- há integração forte entre Telegram, Prisma, SyncPay e BullMQ
- alterações em fluxo de compra ou envio devem revisar `services`, `providers` e `processors` em conjunto
