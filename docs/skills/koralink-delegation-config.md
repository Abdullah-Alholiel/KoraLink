---
name: koralink-delegation-config
description: "Sub-agent model config: avoid provider/base_url mismatch."
version: 1.0.0
---

# KoraLink Delegation Configuration

## The Problem

The profile config has TWO separate model configurations. Changing your main model does NOT change what sub-agents use.

```yaml
model:              # Foreground agent
  default: deepseek-v4-pro
delegation:         # Sub-agents (delegate_task)
  model: glm-5-turbo  # ← Overrides main model
  provider: zai
  base_url: https://api.z.ai/api/coding/paas/v4
```

**Symptom of mismatch**: `HTTP 400: modelCode does not exist` — the base_url points to a provider that doesn't serve the configured model.

## Fix

```bash
# Sub-agents → deepseek-v4-pro (default dev model)
hermes -p koralink config set delegation.model deepseek-v4-pro
hermes -p koralink config set delegation.provider deepseek
hermes -p koralink config set delegation.base_url ''

# Sub-agents → GLM 5.2 (only for post-cycle review)
hermes -p koralink config set delegation.model glm-5.2
hermes -p koralink config set delegation.provider zai
hermes -p koralink config set delegation.base_url https://api.z.ai/api/coding/paas/v4
```

## Post-Cycle Review Pattern

1. Dev agents finish (deepseek-v4-pro)
2. Switch delegation to GLM 5.2
3. Dispatch reviewer sub-agent
4. Switch delegation back to deepseek-v4-pro
5. Fix findings with deepseek sub-agents
6. Push + merge

See `koralink-post-cycle-review` skill for full workflow.
