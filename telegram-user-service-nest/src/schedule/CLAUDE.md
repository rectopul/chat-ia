# AGENTS.md

## Objetivo desta pasta

Executar rotinas agendadas e processamento periódico de mensagens e campanhas.

## Arquivos

- `schedule.module.ts`: integra `PrismaModule` e `TelegramModule`
- `schedule.controller.ts`: endpoint HTTP para disparo do processamento via cron externo
- `schedule.service.ts`: processa jobs pendentes e schedules recorrentes

## Responsabilidades

- expor `POST /schedules/process`
- validar `x-cron-secret`
- processar `scheduledMessageJob`
- disparar `recurringSchedule`
- cancelar envios quando o usuário já comprou
- enviar templates e menu DONT_SELL quando aplicável

## Dependências principais

- `PrismaService`
- `TelegramService`

## Regras

- toda execução periódica deve ser idempotente o máximo possível
- evitar reprocessamento duplicado
- respeitar status de job (`PENDING`, `SENT`, `FAILED`, `CANCELED`)
- manter logs claros para troubleshooting

## Observações

- esta pasta trabalha como orquestradora temporal
- parte da lógica se sobrepõe conceitualmente a jobs do módulo `template`, então mudanças devem considerar os dois fluxos
