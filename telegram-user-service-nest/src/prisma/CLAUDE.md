# AGENTS.md

## Objetivo desta pasta

Centralizar o acesso ao banco de dados via Prisma.

## Arquivos

- `prisma.module.ts`: expõe o `PrismaService` de forma global
- `prisma.service.ts`: instancia o PrismaClient com adapter PostgreSQL (`@prisma/adapter-pg`)

## Responsabilidades

- inicializar conexão com PostgreSQL usando `DATABASE_URL`
- disponibilizar o Prisma para todo o sistema
- conectar ao banco no ciclo de vida do módulo

## Observações

- usa `Pool` do `pg`
- aplica configuração de conexão para compatibilidade e estabilidade
- este módulo é base para `schedule`, `syncpay`, `template` e `telegram`

## Regras

- novas operações de banco devem usar este serviço
- não criar conexões paralelas fora daqui
- qualquer ajuste global de conexão Prisma/Postgres deve ser feito nesta pasta
