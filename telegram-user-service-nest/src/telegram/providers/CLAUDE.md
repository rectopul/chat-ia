# AGENTS.md

## Objetivo desta pasta

Concentrar a camada de infraestrutura e estado em memória da integração Telegram.

## Arquivos

- `mtproto.provider.ts`
- `bot-api.provider.ts`

## Responsabilidades por arquivo

### `mtproto.provider.ts`

- gerenciar clients GramJS autenticados por `botId`
- gerenciar clients temporários do fluxo OTP/2FA
- inicializar contas MTProto
- finalizar login e persistir sessão
- escutar mensagens MTProto para registrar usuários no banco

### `bot-api.provider.ts`

- gerenciar instâncias de business bot
- armazenar tokens em memória
- armazenar maps de business connections
- resolver `connectionId` por chat
- encapsular chamadas HTTP da Bot API

## Regras

- nenhum outro arquivo deve ser dono dos maps internos desses providers
- qualquer acesso a bot, token, client ou connection deve passar por esta camada
- mudanças em polling, connection maps ou lifecycle devem ser feitas aqui

## Observações

- esta pasta é crítica para estabilidade do sistema
- grande parte dos bugs de sessão, token e connection tende a nascer aqui
