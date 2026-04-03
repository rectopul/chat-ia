# SaaS Structure

Suggested folder tree for the multitenant SaaS flow:

```text
src/
  app/
    admin/
      dashboard/
      tenants/
      bots/
      users/
    billing/
    dashboard/
    api/
      auth/
      syncpay/
  components/
    auth/
    ui/
  lib/
    prisma.ts
    syncpay.ts
    saas/
      access.ts
      plans.ts
      server.ts
  proxy.ts
  auth.ts

telegram-user-service-nest/
  src/
    modules/
      admin/
        admin.module.ts
        admin.controller.ts
        admin.service.ts
      billing/
        billing.module.ts
        billing.controller.ts
        billing.service.ts
      subscription/
        subscription.module.ts
        subscription.service.ts
        subscription.guard.ts
        admin-role.guard.ts
        plan-catalog.ts
      ai-agent/
        ai-agent.module.ts
        ai-agent.service.ts
        ai-agent.processor.ts
        ai-agent.repository.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    syncpay/
      syncpay.module.ts
      syncpay.service.ts
    telegram/
      services/
      providers/
      processors/
```

Responsibility split:

- `app/`:
  Next.js routes, layouts, middleware/proxy, server actions, and UI.
- `lib/saas/`:
  Shared SaaS business helpers used by the frontend server layer.
- `modules/subscription/`:
  Access policy, plan limits, active subscription checks, and guards.
- `modules/billing/`:
  Checkout orchestration, transaction records, subscription webhook updates.
- `modules/admin/`:
  MRR, churn, balance, tenant list, and manual access control.
- `modules/ai-agent/`:
  Runtime AI behavior for Telegram, now aware of tenant plan limits.

Clean architecture guidance:

- Controllers should only orchestrate request and response.
- Services should hold business rules.
- Prisma access should stay close to a service or a repository layer.
- UI pages should render view models, not raw business logic.
- Webhooks should remain public and isolated from auth guards.
