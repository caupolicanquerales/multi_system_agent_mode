---
name: system-guide-flow-routing
description: "SystemGuider reference: Orchestrator Decision Routing rules — the 6-priority evaluation order and disambiguation notes. Load system-guide-decision-routing separately (its own turn) only if the user also wants the visual Mermaid diagram."
---

## Orchestrator Decision Routing — Rules

Rows are evaluated top-to-bottom; the first matching row wins. Ambiguous/combined intents route to the first matching row.

```
1: Apply an existing migration plan — any 'plan' phrasing, any language        → Refactoring Flow → TechExecuter
2: Generate/score the modernization report                                     → Modernization Report Flow → MetricsAnalyzer
3: Analyze/inspect/generate a migration report                                  → Report Flow → TechReporter
4: Learn about the system / help / guide                                        → Guide Flow → SystemGuider
5: Execute build/test/run/deploy/javaparser on a named project                  → Command Flow → CmdExtractor → CmdGenerator
6: None of the above                                                            → Answer directly, no sub-agent
```

For the visual graph version of this table, load [system-guide-decision-routing](.github/skills/system-guide-decision-routing/SKILL.md) instead — on its own turn, never together with this file (one skill file per turn).

**Priority 1 vs 2 vs 3 — the most common confusion:**
- "apply/run/execute **the plan**" → Refactoring Flow (Priority 1) — implements changes from an already-generated plan.
- "generate the **modernization** report / score" → Modernization Report Flow (Priority 2) — post-migration numeric score from `business-ast-report.json` + `dependency-tree.txt`.
- "generate **a** migration report / what needs to change" → Report Flow (Priority 3) — pre-migration findings scan.

**Priority 5 exclusion:** any request referencing a migration/refactoring plan is always Priority 1, never Command Flow — even if it also names a project and an action.

**Default rule:** only fires when rows 1–5 produce no clear match. Project name + unrecognized generic action → Command Flow. No project referenced → answer directly.
