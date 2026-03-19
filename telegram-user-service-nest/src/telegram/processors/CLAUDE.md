# AGENTS.md

## Objetivo desta pasta

Executar jobs assíncronos da fila BullMQ relacionados a envio de mídia e combos do Telegram.

## Arquivos

- `message.processor.ts`

## Responsabilidades

- consumir a fila principal do módulo Telegram
- processar jobs `send-combo`
- processar jobs `send-single-media`
- rotear entre envio via Bot API e via MTProto
- reportar progresso de processamento
- respeitar retry/backoff configurados na fila

## Dependências principais

- `MediaService`
- `MtprotoProvider`
- `BotApiProvider`

## Regras

- processors devem ser focados em execução assíncrona
- não duplicar regra de negócio de alto nível que já exista nos services
- usar tipos de payload definidos em `interfaces`
- manter compatibilidade com nomes de jobs definidos em `constants`

## Observações

- esta pasta existe para evitar timeout e melhorar resiliência no envio de mídia pesada
