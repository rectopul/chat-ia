# AGENTS.md

## Objetivo desta pasta

Definir tipos compartilhados usados entre services, providers e processors do módulo Telegram.

## Arquivos

- `index.ts`

## Tipos principais

- `MediaMeta`
- `ReadyItem`
- `MediaItem`
- `BusinessCtx`
- `BotStatusItem`
- `BotStatusResponse`
- payloads de job (`SendComboJobData`, `SendSingleMediaJobData`)

## Responsabilidades

- padronizar contratos internos
- facilitar manutenção e legibilidade
- reduzir uso de tipos inline repetidos

## Regras

- novos payloads de fila e tipos compartilhados devem ser adicionados aqui
- manter esses tipos alinhados com o que processors e services realmente consomem
