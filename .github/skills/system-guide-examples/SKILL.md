---
name: system-guide-examples
description: "SystemGuider reference: example Orchestrator invocation payloads the user can paste directly, one per flow."
---

## Example Invocation Payloads

Paste any of these directly into the Orchestrator:

| Intent | Payload | Routes to |
|---|---|---|
| Run tests | `Run the tests for project my-spring-app` | Command Flow |
| Build | `Build project my-gradle-service` | Command Flow |
| Generate JavaParser AST report | `Generate the javaparser report for project my-spring-app` | Command Flow (short-circuit) |
| Apply OpenRewrite | `Apply openReWrite for project my-spring-app` | Command Flow |
| Package | `Package project my-service` | Command Flow |
| Migration report | `Generate a migration report for project Proyecto-java-8-legacy` | Report Flow |
| Apply plan | `Apply the migration plan for project Proyecto-java-8-legacy` | Refactoring Flow |
| Modernization score | `Generate the modernization report for project Proyecto-java-8-legacy` | Modernization Report Flow |
| Get help | `How does this multi-agent system work?` | Guide Flow |
