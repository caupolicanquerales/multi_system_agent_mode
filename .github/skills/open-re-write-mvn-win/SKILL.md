---
name: open-re-write-mvn-win
description: "Use when the command is `apply openReWrite`, file_type is `maven`, and os is Windows. Contains the OpenRewrite Maven command template (Windows PowerShell base64-encoded), recipe selection conditions, and collection rules for building automated Maven migration commands."
user-invocable: false
---

# OpenRewrite Command Rules — Maven (Windows PowerShell)

## Scope

Valid only for `file_type: "maven"` and `os: "windows"`. Otherwise: `terminal_command: null`, `confirmation_message: "ERROR: This skill is only for Maven projects on Windows."`. If no recipe matches: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`.

## Recipe Selection

Aliases: `j.migrate`=`org.openrewrite.java.migrate` | `j.spring`=`org.openrewrite.java.spring` | `j.test`=`org.openrewrite.java.testing` | `j.log`=`org.openrewrite.java.logging` | `a.commons`=`org.openrewrite.apache.commons` | `mvnR`=`org.openrewrite.maven`. Expand to full FQCNs. Artifact coord prefix: `org.openrewrite.recipe:`. Deduplicate.

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
| 10 | Row 5 active OR `springBootVersion` major >= 3 OR (`springBootVersion` absent AND `springFrameworkVersion` >= 5) | `rewrite-spring:RELEASE` | `j.spring.boot3.SpringFoxToSpringDoc` |
| 9 | Any recipe active | *(none)* | Append `mvnR.UpgradeDependencyVersion` last with `-Drewrite.options` wildcards: `groupId=*`, `artifactId=*`, `newVersion=LATEST` |

**Constraints:** Rows 4/5 mutually exclusive — emit only one; skip both if `springBootVersion` present. Rows 6/7 emit `JavaxMigrationToJakarta` exactly once. Row 9 requires all three wildcards; never narrow `groupId`. Row 10 must accompany `MigrateLegacyDependencies`.

Deduplicate FQCNs (first-occurrence order). Collect into `<artifacts>` and `<recipes>`. Append `com.custom.openrewrite.MigrateLegacyDependencies` last.

> **M2:** If Row 4 fired, append to `confirmation_message`: "Re-run `apply openReWrite` to finish the Spring Framework 5.3→6.0 upgrade (Row 5). Do NOT skip."

## Maven Command Template

Substitute ONLY `<project_location>`, `<mvn_exe>`, `<artifacts>`, `<recipes>` in the line below. Do NOT read or encode any external files.

- Without wrapper: `<mvn_exe>` = `mvn`
- With wrapper: `<mvn_exe>` = `<project_location>\mvnw.cmd`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File 'c:\Users\c.querales.salas\OneDrive - Accenture\Desktop\squad-ia\multi_system_agent_mode\.github\skills\open-re-write-mvn-win\run-rewrite.ps1' -ProjectLocation '<project_location>' -MvnExe '<mvn_exe>' -Artifacts '<artifacts>' -ActiveRecipes '<recipes>'
```