# AGENTS.md

## Objetivo desta pasta

Gerenciar envio imediato e agendamento de templates de mensagem.

## Arquivos

- `template.module.ts`: integra Prisma e Telegram
- `template.controller.ts`: endpoints para enviar, agendar e processar templates
- `template.service.ts`: regra de negócio de templates e jobs agendados

## Endpoints

- `POST /templates/send`
- `POST /templates/schedule`
- `POST /templates/process-jobs`

## Responsabilidades

- enviar template imediato para um chat
- criar `scheduledMessageJob` com base em regras de segmento
- processar jobs pendentes
- recriar jobs recorrentes quando houver `repeatIntervalSeconds`

## Dependências principais

- `PrismaService`
- `TelegramService`

## Regras

- validar existência e ativação do template antes do envio
- manter agendamento desacoplado do transporte real
- usar o TelegramService como fachada para entrega

## Observações

- esta pasta cuida de templates como conceito de negócio
- o envio técnico detalhado de mídia e filas fica no módulo `telegram`
