---
name: open-re-write-mvn-win
description: "Use when the command is `apply openReWrite`, file_type is `maven`, and os is Windows. Contains the OpenRewrite Maven command template (Windows PowerShell base64-encoded), recipe selection conditions, and collection rules for building automated Maven migration commands."
user-invocable: false
---

# OpenRewrite Command Rules — Maven (Windows PowerShell)

## Scope

Valid only for `file_type: "maven"` and `os: "windows"`. Otherwise: `terminal_command: null`, `confirmation_message: "ERROR: This skill is only for Maven projects on Windows."`. If no recipe matches: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`.

## Recipe Selection

Aliases: `j.migrate`=`org.openrewrite.java.migrate` | `j.spring`=`org.openrewrite.java.spring` | `j.test`=`org.openrewrite.java.testing` | `j.log`=`org.openrewrite.java.logging` | `a.commons`=`org.openrewrite.apache.commons` | `mvnR`=`org.openrewrite.maven`. Expand recipe aliases to full FQCNs. **Artifact coordinate format:** prepend `org.openrewrite.recipe:` to every raw artifact ID in the table (e.g. `rewrite-migrate-java:RELEASE` → `org.openrewrite.recipe:rewrite-migrate-java:RELEASE`). This prefix applies ONLY to rows 1–10; `com.custom.openrewrite.MigrateLegacyDependencies` is a recipe-only entry with NO artifact coordinate — never add an artifact for it. Deduplicate artifacts (first-occurrence order).

| # | Condition | `<artifacts>` (dedup) | `<recipes>` |
|---|---|---|---|
| 1 | `javaVersion` < 21 | `rewrite-migrate-java:RELEASE` | `j.migrate.UpgradeToJava21` |
| 2 | `junitVersion` starts with `"4"` | `rewrite-testing-frameworks:RELEASE` | `j.test.junit5.JUnit4to5Migration` |
| 3 | `springBootVersion` < 3.4 | `rewrite-spring:RELEASE` | `j.spring.boot3.UpgradeSpringBoot_3_4` |
| 4 | `springFrameworkVersion` >= 4 AND < 5 AND `springBootVersion` absent | `rewrite-spring:RELEASE` | `j.spring.framework.UpgradeSpringFramework_5_3` |
| 5 | `springFrameworkVersion` >= 5 AND < 6 AND `springBootVersion` absent | `rewrite-spring:RELEASE` | `j.spring.framework.UpgradeSpringFramework_6_0` |
| 6 | `javaxServletVersion` present OR `springBootVersion` major < 3 OR (`springBootVersion` absent AND `javaVersion` >= 11) | `rewrite-migrate-java:RELEASE` | `j.migrate.jakarta.JavaxMigrationToJakarta` |
| 7 | `springBootVersion` absent AND `javaVersion` < 11 AND `javaxServletVersion` absent | `rewrite-migrate-java:RELEASE` | `j.migrate.jakarta.JavaxMigrationToJakarta` |
| 8 | `javaVersion` < 21 | `rewrite-logging-frameworks:RELEASE`, `rewrite-apache:RELEASE` | `j.log.slf4j.Log4jToSlf4j`, `a.commons.lang.ApacheCommonsStringUtilsRecipes`, `a.commons.collections.UpgradeApacheCommonsCollections_3_4` |
| 10 | Row 5 active OR `springBootVersion` major >= 3 OR (`springBootVersion` absent AND (`springFrameworkVersion` >= 5 OR `spring-framework-bom` present in `<dependencyManagement>`)) | `rewrite-spring:RELEASE` | `j.spring.boot3.SpringFoxToSpringDoc` |
| 9 | Any recipe active | `rewrite-openapi:RELEASE` | Append `mvnR.UpgradeDependencyVersion` second-to-last — it MUST come after all other recipes and immediately before `com.custom.openrewrite.MigrateLegacyDependencies` |

**Constraints:** Rows 4/5 mutually exclusive — emit only one; skip both if `springBootVersion` present. Rows 6/7 emit `JavaxMigrationToJakarta` exactly once. Row 10 must accompany `MigrateLegacyDependencies`.

**Final recipe order (strictly enforced):** `[rows 1–10 recipes in evaluation order]` → `org.openrewrite.maven.UpgradeDependencyVersion` (Row 9, second-to-last) → `com.custom.openrewrite.MigrateLegacyDependencies` (absolute last, recipe-only — NO artifact coordinate).

Deduplicate recipes and artifacts (first-occurrence order). Collect prefixed artifact coordinates into `<artifacts>` and fully-qualified recipe names into `<recipes>`.

> **M2:** If Row 4 fired, append to `confirmation_message`: "Re-run `apply openReWrite` to finish the Spring Framework 5.3→6.0 upgrade (Row 5). Do NOT skip."

## Maven Command Template

Substitute `<project_location>`, `<skill_dir>`, `<mvn_exe>`, `<artifacts>`, `<recipes>`. Do NOT read or encode any external files.

- Without wrapper: `<mvn_exe>` = `mvn`
- With wrapper: `<mvn_exe>` = `<project_location>\mvnw.cmd`
- `<skill_dir>` = the directory portion of the absolute path used to read THIS file (i.e., remove `\SKILL.md` from the end of that path). Example: if this file was read from `C:\Users\...\multi_system_agent_mode\.github\skills\open-re-write-mvn-win\SKILL.md`, then `<skill_dir>` = `C:\Users\...\multi_system_agent_mode\.github\skills\open-re-write-mvn-win`.

**Emit the final terminal command (Rule 4):** Substitute all placeholders and output this plain string as `terminal_command`. Do NOT compute Base64. Do NOT use `-EncodedCommand`.
```
pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "<skill_dir>\run-rewrite.ps1" -ProjectLocation "<project_location>" -MvnExe "<mvn_exe>" -Artifacts "<artifacts>" -ActiveRecipes "<recipes>"
```
Use `pwsh.exe` (PowerShell Core). Substitute with `powershell.exe` ONLY when `pwsh_available: false` is present in the input.