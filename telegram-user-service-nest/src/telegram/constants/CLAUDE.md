# AGENTS.md

## Objetivo desta pasta

Centralizar constantes reutilizadas no módulo Telegram.

## Arquivos

- `index.ts`

## Conteúdo principal

- textos considerados saudação (`GREETING_TEXTS`)
- nome da regra automática de DONT_SELL
- nomes dos jobs de fila
- nome da fila principal (`send-message`)

## Responsabilidades

- evitar strings mágicas espalhadas pelo código
- padronizar nomes de fila e jobs
- manter coerência entre service, processor e controller

## Regras

- qualquer novo nome compartilhado de job/fila/chave deve nascer aqui
- evitar duplicação dessas constantes em outros arquivos
