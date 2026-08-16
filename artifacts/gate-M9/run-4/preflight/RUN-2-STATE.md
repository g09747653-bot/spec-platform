# Состояние run-2, прогнанное через упаковщик (задача 130, AC-3)

Модель `qwen3:14b`, окно 16384,
объявленная ёмкость промпта 11059 токенов,
резерв генерации 4096.
Контекст при бюджете по умолчанию — 114389 символов, то есть тот самый.

| прогон | символов в промпте | наша оценка, ток. | прочитано моделью, ток. | обрезок | секунд | структура |
|---|---|---|---|---|---|---|
| unpacked (pre-А-8) | 118126 | — | 8194 | **1** | 23.7 | `missing section "## Core Principles"; missing section "## Governance"` |
| packed (А-8) | 37349 | 11006 | 7433 | **0** | 116.4 | **верна** |

## Заголовки, которые написала модель

**unpacked (pre-А-8)**


**packed (А-8)**

- `# GrantTracker Constitution`
- `## Core Principles`
- `### I. User-Centric Design`
- `### II. Data Reliability`
- `### III. Automation with Control`
- `### IV. Integration Capabilities`
- `### V. Simplicity in Features`
- `## Additional Constraints`

## Запись упаковки

```
context packing constitution provider=ollama tokens=11006/11059 fixed=1112 budget=33549ch rounds=3 prompt=whole answers=whole attachments=whole approved-specs=whole research=23744(-80842)
```

Документы: `run-2-state-unpacked.md`, `run-2-state-packed.md`.