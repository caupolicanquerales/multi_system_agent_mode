---
name: system-guide-agent-catalog
description: "SystemGuider reference: full agent catalog — role, invoker, and key behavior for every agent in the pipeline."
---

## Agent Catalog

| Agent | Role | Invoked by |
|---|---|---|
| **Orchestrator** | Sole user-facing entry point. Routes every request, coordinates all flows, never handles specialized logic itself. | User (directly) |
| **CommandExtractor** | Reads the project build file; extracts `file_type`, `os`, `hasMavenWrapper`, and version metadata (only when `command == "apply openReWrite"`). Returns structured JSON. | Orchestrator — Command Flow, Modernization Flow (cache miss) |
| **CommandGenerator** | Receives CommandExtractor's JSON (+ Orchestrator-preloaded `skill_content`), loads/uses the matching skill, returns the exact terminal command + confirmation metadata. Zero-tool-call fast path when `skill_content` is supplied. | Orchestrator — Command Flow |
| **LogAnalyzer** | Receives filtered error logs. Returns a structured JSON defect list (severity, category, coordinates). Never proposes fixes. | Orchestrator — Command Flow (on failure) |
| **LogResolver** | Receives LogAnalyzer's defect list. Groups defects by file, applies minimal fixes in parallel non-overlapping batches, prompts the user with a multi-select Keep/Undo review. | Orchestrator — after user confirms *Fix all defects* |
| **TechnicalReporter** | Read-only migration analyst. Indexes a Java project off-thread (`index-project.js`), inspects `complex: true` hits, and generates `MIGRATION_PLAN.md` (or the legacy per-skill filename) via `build-report.js`. | Orchestrator — Report Flow |
| **TechnicalExecuter** | Execution wrapper only. Receives a migration plan path and runs `apply-plan.js`. No analysis, no file reads beyond that. | Orchestrator — Refactoring Flow |
| **MetricsAnalyzer** | Hybrid, low-token agent. Runs `metrics-calculater.js` (scores the project from `business-ast-report.json` + `dependency-tree.txt`) then `render-metrics-report.js` to deterministically render `MODERNIZATION_REPORT.md`. Owns its own run confirmation. | Orchestrator — Modernization Report Flow |
| **SystemGuider** *(this agent)* | Explains the system, renders diagrams, and generates example payloads. Read-only. | Orchestrator — Guide Flow |

## Orchestrator-Internal Flows (not agents)

These are skill-driven procedures the Orchestrator follows itself — they never appear as a separate callable agent:

| Flow | Purpose |
|---|---|
| JavaParser Flow | Runs `generate-javaparser-report.bat` to (re)produce `business-ast-report.json` + `dependency-tree.txt`. Windows-only. Short-circuits Command Flow when `command` is `javaparser`; also invoked from Refactoring Flow (post-apply) and Main Class Generation Flow (AST refresh). |
| Failure Resolution Flow | Post-failure pipeline: `log_analyzer.js` compaction → LogAnalyzer → defect presentation → LogResolver. |
| Main Class Generation Flow | Runs `main-class-generator.js` to scaffold a missing `@SpringBootApplication` entry point; triggered from Modernization Report Flow when `hasSpringBootMainClass == false`. |
