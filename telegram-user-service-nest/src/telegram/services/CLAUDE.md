# AGENTS.md

## Objetivo desta pasta

Concentrar a lógica de negócio do domínio Telegram, separada por responsabilidade.

## Arquivos e responsabilidades

### `telegram.service.ts`

Fachada principal do módulo.

- expõe API pública para controllers e outros módulos
- inicializa contas e business bots no startup
- delega para os subserviços
- expõe checklist/status do bot
- confirma pagamento e entrega acesso ao usuário

### `media.service.ts`

Serviço de mídia.

- download de arquivos
- conversão de áudio
- upload MTProto
- cache de mídia e `file_id`
- envio de fotos, vídeos e áudio
- uso de `ffmpeg`, `sharp`, buffer e arquivos temporários

### `session.service.ts`

Serviço de autenticação MTProto.

- envio de código OTP
- verificação de código
- suporte a 2FA
- finalização de sessão autenticada

### `template.service.ts`

Serviço técnico de envio de templates Telegram.

- envia texto diretamente
- enfileira combos e mídias pesadas
- envia menu DONT_SELL
- serializa template para payload de job

### `scheduler.service.ts`

Serviço de agendamento Telegram.

- agenda jobs automáticos DONT_SELL
- processa jobs pendentes
- cancela fluxo quando usuário já comprou

### `business-bot.service.ts`

Serviço de orquestração do business bot.

- inicializa bot e handlers
- trata `business_connection`
- trata `business_message`
- trata `callback_query`
- conduz fluxo de saudação
- gera PIX e cria venda
- dispara templates, menus e áudios

## Regras

- manter responsabilidade única por serviço
- usar `telegram.service.ts` como fachada externa
- evitar lógica de infraestrutura aqui quando ela pertencer aos providers
- toda alteração em fluxo de compra deve revisar `business-bot.service.ts`, `syncpay` e `media.service.ts`

## Observações

- esta é a pasta mais crítica do sistema
- qualquer refactor deve preservar claramente a separação entre autenticação, mídia, template, agendamento e callbacks
