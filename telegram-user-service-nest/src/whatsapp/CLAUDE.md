# AGENTS.md

## Objetivo desta pasta

Estrutura inicial do módulo WhatsApp.

## Arquivos

- `whatsapp.module.ts`: registra controller e service
- `whatsapp.controller.ts`: endpoints CRUD básicos
- `whatsapp.service.ts`: métodos placeholder de CRUD
- `dto/`: DTOs de criação e atualização

## Estado atual

Este módulo está em formato scaffold, ainda sem regra de negócio real.

## Responsabilidades atuais

- fornecer base para evolução futura da integração WhatsApp
- manter estrutura Nest padrão de controller, service e DTOs

## Regras

- antes de evoluir este módulo, definir claramente o objetivo:
    - integração com API externa
    - filas
    - webhook
    - persistência
- evitar misturar regras de Telegram aqui

## Observações

- hoje a implementação é apenas inicial e retornos são placeholders
