---
name: open-re-write
description: "Use when the command is `apply openReWrite` and file_type is `maven`. Contains the OpenRewrite Maven command template, recipe selection conditions, and collection rules for building automated Maven migration commands."
user-invocable: false
---

# OpenRewrite Command Rules — Maven

## Scope

Valid only for `file_type: "maven"`. Otherwise: `terminal_command: null`, `confirmation_message: "ERROR: This skill is only for Maven projects."`. If no recipe matches: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`.

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

Expand aliases to full FQCNs when building the final command. All artifact coordinates use the prefix `org.openrewrite.recipe:`. Deduplicate across rows.

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

Label this block `<YAML_BLOCK>`. Write it to `/tmp/rewrite-custom.yml` (Linux) or `$env:TEMP\rewrite-custom.yml` (Windows) and pass via `-Drewrite.configLocation`. `ChangeDependency` and `RemoveDependency` are built-in core recipes — no extra `recipeArtifactCoordinates` needed. All entries are no-ops when the targeted dependency is absent.

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

Prepend the JDK warning. Linux/macOS: multi-line with `\`. Windows: single-line PowerShell.

**Linux/macOS** — inline `<YAML_BLOCK>` literally inside the heredoc:
```
<prefix> cat > /tmp/rewrite-custom.yml << 'EOF'
<YAML_BLOCK>
EOF
echo "Ensure Java 21 is set as the active JDK before running this command" && \
<mvn> org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress \
  -Drewrite.configLocation=/tmp/rewrite-custom.yml \
  -Drewrite.recipeArtifactCoordinates=<artifacts> \
  -Drewrite.activeRecipes=<recipes>,org.openrewrite.maven.UpgradeDependencyVersion,com.custom.openrewrite.MigrateLegacyDependencies \
  -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=* \
  -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=* \
  -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST \
  -Dmaven.compiler.failOnError=false
```

**Windows** — serialize `<YAML_BLOCK>` as `$yml` using **single quotes** (prevents PowerShell variable interpolation). Replace each newline with `` `n ``, each `'` with `''` (PowerShell single-quote escape), and wrap in single quotes. Use `[System.IO.File]::WriteAllText()` — NOT `Set-Content`. Target shell is `powershell.exe` or `pwsh.exe` — do NOT generate these commands if the VS Code terminal is `cmd.exe` (PowerShell syntax is incompatible with cmd.exe).

*With wrapper:*
```
$yml = '<YAML_BLOCK_PS_SINGLE_QUOTED>'; [System.IO.File]::WriteAllText("$env:TEMP\rewrite-custom.yml", $yml); Write-Host 'Ensure Java 21 is set as the active JDK before running this command' ; & '<project_location>\mvnw.cmd' org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress "-Drewrite.configLocation=$env:TEMP\rewrite-custom.yml" "-Drewrite.recipeArtifactCoordinates=<artifacts>" "-Drewrite.activeRecipes=<recipes>,org.openrewrite.maven.UpgradeDependencyVersion,com.custom.openrewrite.MigrateLegacyDependencies" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=*" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=*" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST"
```

*Without wrapper:*
```
$yml = '<YAML_BLOCK_PS_SINGLE_QUOTED>'; [System.IO.File]::WriteAllText("$env:TEMP\rewrite-custom.yml", $yml); Set-Location '<project_location>' ; Write-Host 'Ensure Java 21 is set as the active JDK before running this command' ; mvn org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress "-Drewrite.configLocation=$env:TEMP\rewrite-custom.yml" "-Drewrite.recipeArtifactCoordinates=<artifacts>" "-Drewrite.activeRecipes=<recipes>,org.openrewrite.maven.UpgradeDependencyVersion,com.custom.openrewrite.MigrateLegacyDependencies" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=*" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=*" "-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST"
```

**Windows serialization rules for `<YAML_BLOCK_PS_SINGLE_QUOTED>`:**
- Replace every newline with `` `n ``
- Replace every `'` with `''` (PowerShell single-quote escaping)
- Replace every non-breaking space (`\u00A0`, Unicode 160) with a regular ASCII space before serializing
- Strip any leading/trailing whitespace from each logical line before joining with `` `n ``
- Wrap the entire result in single quotes: `'...'`
- Do NOT use double quotes — they cause `$`-prefixed tokens (e.g. `$env`, `$var`) inside the YAML to be interpreted as PowerShell variables
- Parameters containing commas (`-Drewrite.recipeArtifactCoordinates=`, `-Drewrite.activeRecipes=`) and wildcard parameters (`-Drewrite.options...groupId=*`, `...artifactId=*`) MUST be wrapped in double quotes to prevent PowerShell from splitting them into separate arguments
- Use `Write-Host` instead of `echo` — `echo` is an alias for `Write-Output` in PowerShell and may produce unexpected object output in some terminal contexts
- Target shell is `powershell.exe` or `pwsh.exe` — do NOT generate these commands if the VS Code terminal is `cmd.exe` (PowerShell syntax is incompatible with cmd.exe)


