---
name: open-re-write-gradle
description: "Use when the command is `apply openReWrite` and file_type is `gradle`. Contains the OpenRewrite Gradle command template, recipe selection conditions, and collection rules for building automated Gradle migration commands."
user-invocable: false
---

# OpenRewrite Command Rules — Gradle

## Scope

Valid only for `file_type: "gradle"`. Otherwise: `terminal_command: null`, `confirmation_message: "ERROR: This skill is only for Gradle projects."`. If no recipe matches: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`.

Resolve `<gradle>` and `<prefix>` from [general-command-rules](.github/skills/general-command-rules.md).

## Namespace Aliases

| Alias | Expands to |
|---|---|
| `j.migrate` | `org.openrewrite.java.migrate` |
| `j.spring` | `org.openrewrite.java.spring` |
| `j.test` | `org.openrewrite.java.testing` |
| `j.log` | `org.openrewrite.java.logging` |
| `a.commons` | `org.openrewrite.apache.commons` |
| `gradleR` | `org.openrewrite.gradle.tooling` |

Expand aliases to full FQCNs. Artifact coordinate prefix: `org.openrewrite.recipe:`. Deduplicate across rows.

## Recipe Selection

| # | Condition | `<artifacts>` (dedup) | `<activeRecipes>` |
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
| 9 | Any recipe active | *(none)* | Append `gradleR.UpgradeDependencyVersion` last with three `option(...)` calls in `rewrite { }`: `groupId=*`, `artifactId=*`, `newVersion=LATEST` |

**Row constraints:**
- **Rows 4 & 5:** Only when `springBootVersion` absent. Emit row 4 recipe before row 5. If `springBootVersion` present, skip rows 4–5 (row 3 manages the upgrade internally).
- **Rows 6 & 7:** Mutually exclusive — deduplicate `JavaxMigrationToJakarta` if both match.
- **Row 9:** All three options are required; omitting any silently skips the recipe. Never narrow `groupId` to a specific value. Pass inside `rewrite { }` as: `option('org.openrewrite.gradle.tooling.UpgradeDependencyVersion.groupId', '*')`, `option('...artifactId', '*')`, `option('...newVersion', 'LATEST')`.
- **Row 10:** The `MigrateLegacyDependencies` YAML recipe (below) swaps Springfox → SpringDoc in `build.gradle`. Row 10 must accompany it — without row 10, `io.swagger.annotations.*` source references remain and cause compilation failure.

Collect all matching artifacts (comma-separated, deduplicated) into `<artifacts>` and all recipes into `<activeRecipes>`. Append `com.custom.openrewrite.MigrateLegacyDependencies` last.

## YAML Config Block

Label this block `<YAML_BLOCK>`. Write it to `<project_location>/rewrite.yml` (Gradle reads from project root by default). `ChangeDependency` and `RemoveDependency` are built-in core recipes — no extra `rewriteDeps` entry needed. All entries are no-ops when the targeted dependency is absent.

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

## Gradle Init Script Template

Groovy init script body (interpolate `<rewriteDeps>` and `<activeRecipes>`):

```groovy
initscript {
  repositories { gradlePluginPortal(); mavenCentral() }
  dependencies { classpath 'org.openrewrite:plugin:+' }
}
def pluginClass = initscript.classLoader.loadClass('org.openrewrite.gradle.RewritePlugin')
def runningJava = org.gradle.api.JavaVersion.current().majorVersion.toInteger()
allprojects {
  afterEvaluate { proj ->
    if (proj.extensions.findByName('java')) {
      proj.java.toolchain.languageVersion = org.gradle.jvm.toolchain.JavaLanguageVersion.of(runningJava)
    }
    if (proj.tasks.findByName('rewriteRun')) { proj.tasks.named('rewriteRun').configure { it.dependsOn = [] } }
  }
  apply plugin: pluginClass
  dependencies { <rewriteDeps> }
  rewrite { <activeRecipes> }
}
```

- `<rewriteDeps>`: one `rewrite 'org.openrewrite.recipe:ARTIFACT:+'` per artifact, space-separated.
- `<activeRecipes>`: one `activeRecipe('RECIPE')` per recipe, then `activeRecipe('org.openrewrite.gradle.tooling.UpgradeDependencyVersion')` with its three `option(...)` calls, then `activeRecipe('com.custom.openrewrite.MigrateLegacyDependencies')` last.

**Linux/macOS** — inline `<YAML_BLOCK>` literally inside the heredoc:
```
cd <project_location> && \
cat > rewrite.yml << 'EOF'
<YAML_BLOCK>
EOF
echo "Ensure Java 21 is set as the active JDK before running this command" && \
cat > /tmp/orewrite-init.gradle << 'EOF'
<groovy_body_with_interpolated_rewriteDeps_and_activeRecipes>
EOF
<gradle> rewriteRun --quiet --init-script /tmp/orewrite-init.gradle
```

**Windows** — serialize `<YAML_BLOCK>` as `$yml` using **single quotes** (prevents PowerShell variable interpolation). Replace each newline with `` `n ``, each `'` with `''` (PowerShell single-quote escape), and wrap in single quotes. Serialize the Groovy init script body (`<groovy_body>`) the same way as `$f_content`. Use `[System.IO.File]::WriteAllText()` — NOT `Set-Content`. Target shell is `powershell.exe` or `pwsh.exe` — do NOT generate these commands if the VS Code terminal is `cmd.exe`.
```
$yml = '<YAML_BLOCK_PS_SINGLE_QUOTED>'; [System.IO.File]::WriteAllText("$env:TEMP\rewrite.yml", $yml); $f="$env:TEMP\orewrite-init.gradle"; $f_content = '<GROOVY_BODY_PS_SINGLE_QUOTED>'; [System.IO.File]::WriteAllText($f, $f_content); echo 'Ensure Java 21 is set as the active JDK before running this command' ; & '<project_location>\gradlew.bat' rewriteRun --quiet --init-script $f
```

**Windows serialization rules for `<YAML_BLOCK_PS_SINGLE_QUOTED>` and `<GROOVY_BODY_PS_SINGLE_QUOTED>`:**
- Replace every newline with `` `n ``
- Replace every `'` with `''` (PowerShell single-quote escaping)
- Wrap the entire result in single quotes: `'...'`
- Do NOT use double quotes — they cause `$`-prefixed tokens to be interpreted as PowerShell variables

