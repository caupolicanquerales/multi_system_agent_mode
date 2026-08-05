---
name: open-re-write-mvn-win
description: "Use when the command is `apply openReWrite`, file_type is `maven`, and os is Windows. Contains the OpenRewrite Maven command template (Windows PowerShell single-line), recipe selection conditions, and collection rules for building automated Maven migration commands."
user-invocable: false
---

# OpenRewrite Command Rules — Maven (Windows PowerShell)

## Scope

Valid only for `file_type: "maven"` and `os: "windows"`. Otherwise: `terminal_command: null`, `confirmation_message: "ERROR: This skill is only for Maven projects on Windows."`. If no recipe matches: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`.

Resolve `<mvn>` and `<prefix>` from [general-command-rules](.github/skills/general-command-rules.md).

## Namespace Aliases

| Alias | Expands to |
|---|---|
| `j.migrate` | `org.openrewrite.java.migrate` |
| `j.spring` | `org.openrewrite.java.spring` |
| `j.test` | `org.openrewrite.java.testing` |
| `j.log` | `org.openrewrite.java.logging` |
| `a.commons` | `org.openrewrite.apache.commons` |
| `mvnR` | `org.openrewrite.maven` |

Expand to full FQCNs. Artifact coord prefix: `org.openrewrite.recipe:`. Deduplicate.

## Recipe Selection

| # | Condition | `<artifacts>` (dedup) | `<recipes>` |
|---|---|---|---|
| 1 | `javaVersion` < 21 | `rewrite-migrate-java:RELEASE` | `j.migrate.UpgradeToJava21` |
| 2 | `junitVersion` starts with `"4"` | `rewrite-testing-frameworks:RELEASE` | `j.test.junit5.JUnit4to5Migration` |
| 3 | `springBootVersion` < 3.4 | `rewrite-spring:RELEASE` | `j.spring.boot3.UpgradeSpringBoot_3_4` |
| 4 | `springFrameworkVersion` >= 4 AND < 5 AND `springBootVersion` absent | `rewrite-spring:RELEASE` | `j.spring.framework.UpgradeSpringFramework_5_3` |
| 5 | `springFrameworkVersion` < 6 AND `springBootVersion` absent | `rewrite-spring:RELEASE` | `j.spring.framework.UpgradeSpringFramework_6_0` |
| 6 | `javaxServletVersion` present OR `springBootVersion` major < 3 OR (`springBootVersion` absent AND `javaVersion` >= 11) | `rewrite-migrate-java:RELEASE` | `j.migrate.jakarta.JavaxMigrationToJakarta` |
| 7 | `springBootVersion` absent AND `javaVersion` < 11 AND `javaxServletVersion` absent | `rewrite-migrate-java:RELEASE` | `j.migrate.jakarta.JavaxMigrationToJakarta` |
| 8 | `javaVersion` < 21 | `rewrite-logging-frameworks:RELEASE`, `rewrite-apache:RELEASE` | `j.log.slf4j.Log4jToSlf4j`, `a.commons.lang.ApacheCommonsStringUtilsRecipes`, `a.commons.collections.UpgradeApacheCommonsCollections_3_4` |
| 10 | Row 5 active OR `springBootVersion` major >= 3 OR (`springBootVersion` absent AND `springFrameworkVersion` >= 5) | `rewrite-spring:RELEASE` | `j.spring.boot3.SpringFoxToSpringDoc` |
| 9 | Any recipe active | *(none)* | Append `mvnR.UpgradeDependencyVersion` last with `-Drewrite.options` wildcards: `groupId=*`, `artifactId=*`, `newVersion=LATEST` |

**Row constraints:**
- **Rows 4 & 5:** Only when `springBootVersion` absent. Emit row 4 recipe before row 5. If `springBootVersion` present, skip rows 4–5 (row 3 manages the upgrade internally).
- **Rows 6 & 7:** Mutually exclusive — deduplicate `JavaxMigrationToJakarta` if both match.
- **Row 9:** All three options are required; omitting any silently skips the recipe. Never narrow `groupId` to a specific value.
- **Row 10:** The `MigrateLegacyDependencies` YAML recipe (below) swaps Springfox → SpringDoc in `pom.xml`. Row 10 must accompany it — without row 10, `io.swagger.annotations.*` source references remain and cause compilation failure.

Collect all matching artifacts (comma-separated, deduplicated) into `<artifacts>` and all recipes (comma-separated) into `<recipes>`. Append `com.custom.openrewrite.MigrateLegacyDependencies` last.

## YAML Config Block

`ChangeDependency` and `RemoveDependency` are built-in core recipes — no extra `recipeArtifactCoordinates` needed. All entries are no-ops when the targeted dependency is absent.

```yaml
---
type: specs.openrewrite.org/v1beta/recipe
name: com.custom.openrewrite.MigrateLegacyDependencies
recipeList:
  - org.openrewrite.java.dependencies.ChangeDependency:
      oldGroupId: commons-lang
      oldArtifactId: commons-lang
      newGroupId: org.apache.commons
      newArtifactId: commons-lang3
      newVersion: 3.14.0
  - org.openrewrite.java.dependencies.ChangeDependency:
      oldGroupId: io.springfox
      oldArtifactId: springfox-swagger2
      newGroupId: org.springdoc
      newArtifactId: springdoc-openapi-starter-webmvc-ui
      newVersion: 2.6.0
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-swagger-ui}
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-core}
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-bean-validators}
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: com.google.guava, artifactId: guava}
```

## Post-Run Manual Fixes

Evaluate using metadata only — no file inspection.

| # | Condition | Required action |
|---|---|---|
| M1 | Row 5 active OR `javaxServletVersion` present | Remove `@EnableSwagger2`; replace `Docket` bean with Springdoc `OpenAPI` bean if Springfox was in use. |

Append a "Manual Steps Required" section to `confirmation_message` for each matching row.

## Maven Command Template

Single-line PowerShell; all `-D` flags in double quotes. Do NOT use if terminal is `cmd.exe`.

- With wrapper: `<mvn_exe>` = `& '<project_location>\mvnw.cmd'`
- Without wrapper: prefix with `Set-Location '<project_location>' ;`, then `<mvn_exe>` = `mvn`

```powershell
$yml = "---`ntype: specs.openrewrite.org/v1beta/recipe`nname: com.custom.openrewrite.MigrateLegacyDependencies`nrecipeList:`n  - org.openrewrite.java.dependencies.ChangeDependency:`n      oldGroupId: commons-lang`n      oldArtifactId: commons-lang`n      newGroupId: org.apache.commons`n      newArtifactId: commons-lang3`n      newVersion: 3.14.0`n  - org.openrewrite.java.dependencies.ChangeDependency:`n      oldGroupId: io.springfox`n      oldArtifactId: springfox-swagger2`n      newGroupId: org.springdoc`n      newArtifactId: springdoc-openapi-starter-webmvc-ui`n      newVersion: 2.6.0`n  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-swagger-ui}`n  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-core}`n  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-bean-validators}`n  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: com.google.guava, artifactId: guava}"; [System.IO.File]::WriteAllText("$env:TEMP\rewrite-custom.yml", $yml.Replace([char]0x00A0, ' ')); Write-Host 'Ensure Java 21 is set as the active JDK before running this command' ; <mvn_exe> org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress "-Drewrite.configLocation=$env:TEMP\rewrite-custom.yml" "-Drewrite.recipeArtifactCoordinates=<artifacts>" "-Drewrite.activeRecipes=<recipes>" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=*" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=*" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST" "-Dmaven.compiler.failOnError=false"
```
