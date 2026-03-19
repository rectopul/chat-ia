# AGENTS.md

## Objetivo desta pasta

Integrar o backend com a API da SyncPay para autenticação, geração de PIX e leitura de webhook.

## Arquivos

- `syncpay.module.ts`: registra e exporta `SyncPayService`
- `syncpay.service.ts`: autenticação, criação de cobrança PIX e interpretação de webhook

## Responsabilidades

- obter e cachear bearer token da SyncPay
- gerar cobrança PIX (`cash-in`)
- usar dados padrão de cliente quando necessário
- interpretar payload de webhook e identificar pagamento confirmado

## Variáveis esperadas

- `SYNCPAY_CLIENT_ID`
- `SYNCPAY_CLIENT_SECRET`
- `SYNCPAY_DEFAULT_CPF`
- `SYNCPAY_DEFAULT_EMAIL`
- `SYNCPAY_DEFAULT_PHONE`
- `SYNCPAY_WEBHOOK_URL`

## Regras

- não espalhar chamadas diretas da SyncPay fora deste serviço
- manter tratamento de erros e logs centralizados aqui
- preservar cache de token em memória para reduzir autenticações repetidas

## Observações

- usado principalmente pelo fluxo de compra no módulo Telegram
- retorno principal da cobrança inclui `identifier` e `pix_code`
