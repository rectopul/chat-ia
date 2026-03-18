# AGENTS.md

## Objetivo desta pasta

Contém o código-fonte principal do backend NestJS.

## Arquivos de entrada

- `main.ts`: inicializa o Nest, habilita CORS e sobe a API
- `app.module.ts`: registra módulos, Redis/BullMQ e Bull Board

## Organização

Cada subpasta representa um domínio técnico ou módulo funcional:

- `prisma`: banco de dados
- `schedule`: processamento periódico
- `syncpay`: pagamentos PIX
- `template`: regras de templates e jobs
- `telegram`: integração principal com Telegram
- `whatsapp`: scaffold inicial do WhatsApp

## Convenções

- controllers expõem endpoints HTTP
- services concentram regras de negócio
- providers concentram infraestrutura/estado de integração
- processors executam jobs de fila
- interfaces concentram tipos compartilhados

## Atenções

- a fila principal do Telegram é registrada no app
- os módulos são integrados entre si, especialmente `schedule`, `template`, `telegram` e `prisma`
