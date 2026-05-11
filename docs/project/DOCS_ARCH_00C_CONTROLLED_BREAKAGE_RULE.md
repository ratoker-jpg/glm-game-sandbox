# DOCS-ARCH-00C — Controlled breakage rule

**Дата:** 2026-05-12  
**Тип:** docs / workflow clarification  
**Статус:** Active clarification  
**Назначение:** зафиксировать правило для architecture/migration PR: новый архитектурный путь может временно ломаться, старый путь при выключенном feature flag ломаться не должен.

---

## 1. Терминология

Для новых задач по Architecture Migration Mode предпочтительный термин:

```text
architecture PR / migration PR
```

В рабочем разговоре можно использовать короткое название:

```text
арч
```

Под `арчем` понимается не обычный patch, а архитектурная/миграционная задача, которая:

- создаёт или расширяет систему;
- переносит поведение из main.js в owner-модуль;
- вводит controlled breakage через feature flag;
- уменьшает patch-chain / guard-chain долг;
- сохраняет старый путь при выключенном feature flag.

Слово `patch` допустимо для small/emergency/thin bridge фиксов, но не должно быть основным названием для системных изменений.

---

## 2. Controlled breakage rule

Главное правило:

```text
Новый путь может ломаться.
Старый путь при выключенном feature flag ломаться не должен.
```

Это означает:

1. В feature branch / PR допустимо, что новый модуль или новая architecture path работает неидеально.
2. Если изменение закрыто feature flag, то при `false` игра должна вести себя как до PR.
3. Если при выключенном feature flag ломается старое поведение — это blocker.
4. Если при включенном feature flag новый путь ломается, но игра не падает критически — это acceptable migration risk, если есть telemetry и rollback.
5. В `sandbox/main` нельзя мержить изменения, которые ломают запуск игры, старый путь или базовый smoke при выключенном feature flag.

---

## 3. Как применять к ARCH-AI-01

Для `ARCH-AI-01 — Tank Decider MVP`:

```text
FE_TANK_DECIDER_ENABLED = false → старый bot behavior должен остаться как есть.
FE_TANK_DECIDER_ENABLED = true  → можно ловить и чинить проблемы нового tank_decider path.
```

Допустимый риск:

```text
при включенном decider enemy tank может вести себя хуже, если это не ломает запуск и не портит старый путь
```

Недопустимый риск:

```text
при выключенном decider ломается текущий бот, экономика, scout, combat, pathfinding или старт игры
```

---

## 4. Требования к migration PR

Каждый architecture/migration PR, который вводит новый путь рядом со старым, должен иметь:

1. feature flag или другой быстрый rollback;
2. safe default, обычно `false`;
3. telemetry для нового пути;
4. manual smoke для `flag=false` и `flag=true`;
5. список того, что старый путь не должен потерять;
6. явное описание, какие регрессии в новом пути считаются приемлемыми.

---

## 5. Merge rule

Перед merge architecture/migration PR проверить:

```text
flag=false: old path works / no syntax errors / no startup crash
flag=true: new path may be imperfect, but errors are visible and rollback exists
```

Если PR не имеет rollback и трогает gameplay/AI/refactor logic, он не должен мержиться как controlled breakage PR.

---

## 6. Короткая формула для GLM prompts

Добавлять в prompts для architecture/migration задач:

```text
Controlled breakage rule:
It is acceptable if the new feature-flagged architecture path has behavior regressions.
It is not acceptable if the legacy path breaks when the feature flag is disabled.
Default flag must preserve current behavior.
```
