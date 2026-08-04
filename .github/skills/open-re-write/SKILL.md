---
name: open-re-write
description: "Use when the command is `apply openReWrite`. Contains the OpenRewrite Maven and Gradle command templates, recipe selection conditions, and collection rules for building automated migration commands."
user-invocable: false
---

# OpenRewrite Command Rules

## Scope and Error Conditions

Valid only for `file_type: "maven"` and `file_type: "gradle"`.

- For any other file type: `terminal_command: null`, `confirmation_message: "ERROR: apply openReWrite is only supported for Maven and Gradle projects."`
- If no recipe conditions match: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`

Resolve `<mvn>`, `<prefix>`, and `<gradle>` from the **Path Resolution** rules in [general-command-rules](.github/skills/general-command-rules.md).

## Recipe Selection

All artifact coordinates use the prefix `org.openrewrite.recipe:`. Deduplicate artifacts across rows.

| # | Condition | `<artifacts>` addition | `<recipes>` addition |
|---|---|---|---|
| 1 | `javaVersion` present AND < 21 | `rewrite-migrate-java:RELEASE` | `org.openrewrite.java.migrate.UpgradeToJava21` |
| 2 | `junitVersion` present AND starts with `"4"` | `rewrite-testing-frameworks:RELEASE` | `org.openrewrite.java.testing.junit5.JUnit4to5Migration` |
| 3 | `springBootVersion` present AND < 3.4.x (major < 3, or major = 3 and minor < 4) | `rewrite-spring:RELEASE` | `org.openrewrite.java.spring.boot3.UpgradeSpringBoot_3_4` |
| 4 | `springFrameworkVersion` present AND >= 4 AND < 5 AND `springBootVersion` **absent** | `rewrite-spring:RELEASE` *(dedup)* | `org.openrewrite.java.spring.framework.UpgradeSpringFramework_5_3` |
| 5 | `springFrameworkVersion` present AND < 6 AND `springBootVersion` **absent** | `rewrite-spring:RELEASE` *(dedup)* | `org.openrewrite.java.spring.framework.UpgradeSpringFramework_6_0` |
| 6 | `javaxServletVersion` present (any value) OR `springBootVersion` major < 3 OR (`springBootVersion` absent AND `javaVersion` present AND >= 11) | `rewrite-migrate-java:RELEASE` *(dedup)* | `org.openrewrite.java.migrate.jakarta.JavaxMigrationToJakarta` |
| 7 | `springBootVersion` absent AND `javaVersion` present AND < 11 AND `javaxServletVersion` absent | `rewrite-migrate-java:RELEASE` *(dedup)* | `org.openrewrite.java.migrate.jakarta.JavaxMigrationToJakarta` |
| 8 | `javaVersion` present AND < 21 | `rewrite-logging-frameworks:RELEASE`, `rewrite-apache:RELEASE` | `org.openrewrite.java.logging.slf4j.Log4jToSlf4j`, `org.openrewrite.apache.commons.lang.ApacheCommonsStringUtilsRecipes`, `org.openrewrite.apache.commons.collections.UpgradeApacheCommonsCollections_3_4` |
| 10 | Row 5 active OR `springBootVersion` major >= 3 OR (`springBootVersion` absent AND (`springFrameworkVersion` present AND >= 5)) | `rewrite-spring:RELEASE` *(dedup)* | `org.openrewrite.java.spring.boot3.SpringFoxToSpringDoc` |
| 9 | Any recipe active | *(none)* | Append `org.openrewrite.maven.UpgradeDependencyVersion` (Maven) or `org.openrewrite.gradle.tooling.UpgradeDependencyVersion` (Gradle) last. **Always pass wildcard options** `groupId=*`, `artifactId=*`, `newVersion=LATEST` — omitting `groupId`/`artifactId` causes recipe validation failure and the recipe is silently skipped. Wildcards cover all dependencies including Tomcat, Jackson, H2, SLF4J, etc. |

> **Rows 4 & 5 — Spring Framework 4.x legacy project (no Spring Boot):**
> When `springBootVersion` is **absent** and `springFrameworkVersion` is present (e.g. `4.3.29.RELEASE`), the project is a plain Spring Framework app. Row 4 applies first (`5_3` intermediate upgrade), then row 5 applies (`6_0` final upgrade). Both recipes are emitted in that order in `<recipes>`. `springBootVersion` being absent is the critical gate — if it were present, Spring Boot's own upgrade recipe (row 3) manages the framework version internally and rows 4–5 must be skipped.

> **Row 10 — Springfox → SpringDoc annotation migration:**
> Apply `SpringFoxToSpringDoc` whenever Spring Framework 6 migration is happening (Row 5 is active) or the project already targets Spring 5+/Boot 3+. This recipe migrates `@Api`, `@ApiOperation`, `@ApiParam`, `@ApiResponse`, `@ApiResponses` and all other `io.swagger.annotations.*` usages to their `io.swagger.v3.oas.annotations.*` equivalents. It also updates the `SwaggerConfig` class: removes `@EnableSwagger2` and replaces `Docket` beans with SpringDoc `OpenAPI` beans.
> **Critical:** the YAML config recipes in the `MigrateLegacyDependencies` recipe swap the Springfox `pom.xml` dependency to `springdoc-openapi-starter-webmvc-ui`. Without Row 10, Springfox is removed from `pom.xml` but all `io.swagger.annotations.*` source references remain, causing a compilation failure that blocks OpenRewrite from completing. Both the YAML config (pom.xml swap) and Row 10 (source migration) **must** always be applied together.

> **Row 6 — Jakarta migration trigger (dedup-safe):**
> Apply `JavaxMigrationToJakarta` (row 6) when **any** of the following is true — do not require all conditions simultaneously:
> - `javaxServletVersion` is present (explicit `javax.servlet` / `servlet-api` dependency, regardless of Java version)
> - `springBootVersion` major < 3
> - `springBootVersion` **absent** AND `javaVersion` >= 11
>
> Row 7 is the narrow fallback for old Java 8 projects with no explicit servlet dependency and no Boot. Rows 6 and 7 are mutually exclusive — deduplicate `JavaxMigrationToJakarta` if both match.

> **Row 9 — `UpgradeDependencyVersion` options (always wildcards):**
> `UpgradeDependencyVersion` requires `groupId`, `artifactId`, and `newVersion` as options — omitting any of them causes a recipe validation error and the recipe is silently skipped.
> Always pass `-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=*`, `-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=*`, `-Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST`.
> Wildcards apply the recipe to **all** dependencies in the project (Jackson, H2, Log4j, SLF4J, Tomcat Embed, etc.). Because `org.apache.tomcat.embed:tomcat-embed-core` retains the same `groupId:artifactId` across the 8.5 → 9 → 10.1 line, wildcards will naturally bump it to the latest `10.1.x` release alongside all other eligible dependencies. Never narrow the options to a single `groupId` — doing so silently skips every other library in the project.

Collect all matching artifact coordinates (comma-separated, deduplicated) into `<artifacts>` and all matching recipes (comma-separated) into `<recipes>`.

Always include `UpgradeDependencyVersion` wildcard options in Maven commands (`groupId=*`, `artifactId=*`, `newVersion=LATEST`). Never narrow to a specific `groupId` — see Row 9 blockquote above.

## YAML Config Recipes (always include)

Every generated command must write a `rewrite-custom.yml` file before running the OpenRewrite plugin and pass it via `-Drewrite.configLocation` (Maven) or write it to `<project_location>/rewrite.yml` (Gradle, read by default). The YAML declares parameterized `ChangeDependency` and `RemoveDependency` recipe instances that handle GAV coordinate swaps not expressible as CLI `-Drewrite.activeRecipes` entries. These recipes are **no-ops** when the targeted dependency is absent — safe to always include. No additional `recipeArtifactCoordinates` entry is needed — `ChangeDependency` and `RemoveDependency` are built-in OpenRewrite core recipes bundled with the Maven/Gradle plugin.

**Fixed YAML content (same for every project):**

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
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-swagger-ui
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-core
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-bean-validators
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: com.google.guava
      artifactId: guava
```

Always append `com.custom.openrewrite.MigrateLegacyDependencies` to `-Drewrite.activeRecipes` (Maven) or `activeRecipe()` list (Gradle).

## Post-OpenRewrite Manual Fixes

> ⛔ **CommandGenerator has `tools: []` and cannot read project files.** All conditions below must be evaluated using only the metadata fields received from CommandExtractor — never by inspecting `pom.xml` or `build.gradle`.

Always append a "Manual Steps Required" section to `confirmation_message` when any applicable condition below is met.

| # | Condition (metadata-based) | Required action |
|---|---|---|
| M1 | Row 5 (`UpgradeSpringFramework_6_0`) is active **OR** `javaxServletVersion` is present | Springfox (if present) was swapped to SpringDoc in `pom.xml` by the YAML config recipes. **Java config class migration is not automated:** remove `@EnableSwagger2` annotation and replace any `Docket` bean with a Springdoc `OpenAPI` bean if Springfox was in use. |
| M4 | Always omit. Row 9 wildcards (`UpgradeDependencyVersion groupId=*`) automatically upgrade `tomcat-embed-core` to 10.1.x alongside all other dependencies. No manual step required. |

## Maven Command Template

Always prepend the JDK warning. Emit multi-line on Linux/macOS (using `\` continuation) and single-line on Windows.

**Linux/macOS:**
```
<prefix> cat > /tmp/rewrite-custom.yml << 'EOF'
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
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-swagger-ui
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-core
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-bean-validators
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: com.google.guava
      artifactId: guava
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

**Windows with wrapper:** Two-step PowerShell single line. Generate `$yml` by taking the YAML content from the **YAML Config Recipes** section above and serializing it as a PowerShell double-quoted string: replace each newline with `` `n ``, each `"` with `` `" ``, and wrap the result in double quotes:
```
$yml = "<YAML_CONTENT_PS_SERIALIZED>"; [System.IO.File]::WriteAllText("$env:TEMP\rewrite-custom.yml", $yml); echo "Ensure Java 21 is set as the active JDK before running this command" ; & "<project_location>\mvnw.cmd" org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress "-Drewrite.configLocation=$env:TEMP\rewrite-custom.yml" -Drewrite.recipeArtifactCoordinates=<artifacts> "-Drewrite.activeRecipes=<recipes>,org.openrewrite.maven.UpgradeDependencyVersion,com.custom.openrewrite.MigrateLegacyDependencies" -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=* -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=* -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST
```

**Windows without wrapper:** Same `$yml` serialization rule; substitute `mvn` for the wrapper:
```
$yml = "<YAML_CONTENT_PS_SERIALIZED>"; [System.IO.File]::WriteAllText("$env:TEMP\rewrite-custom.yml", $yml); cd <project_location> ; echo "Ensure Java 21 is set as the active JDK before running this command" ; mvn org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress "-Drewrite.configLocation=$env:TEMP\rewrite-custom.yml" -Drewrite.recipeArtifactCoordinates=<artifacts> "-Drewrite.activeRecipes=<recipes>,org.openrewrite.maven.UpgradeDependencyVersion,com.custom.openrewrite.MigrateLegacyDependencies" -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=* -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=* -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST
```

## Gradle Init Script Template

Define the Groovy init script body (interpolate `<rewriteDeps>` and `<activeRecipes>`):

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

- `<rewriteDeps>`: one `rewrite 'org.openrewrite.recipe:ARTIFACT:+'` per matching artifact, space-separated.
- `<activeRecipes>`: one `activeRecipe('RECIPE')` per matching recipe, appending `activeRecipe('org.openrewrite.gradle.tooling.UpgradeDependencyVersion')` then `activeRecipe('com.custom.openrewrite.MigrateLegacyDependencies')` last.

**Linux/macOS:** Write the YAML config to the project root (default config location), then the init script:
```
cd <project_location> && \
cat > rewrite.yml << 'EOF'
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
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-swagger-ui
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-core
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: io.springfox
      artifactId: springfox-bean-validators
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: com.google.guava
      artifactId: guava
EOF
cat > /tmp/orewrite-init.gradle << 'EOF'
<groovy_body_with_interpolated_rewriteDeps_and_activeRecipes>
EOF
./gradlew rewriteRun --quiet --init-script /tmp/orewrite-init.gradle
```

**Windows (PowerShell):** Write YAML config to project root first, then the init script. Serialize bodies as single-quoted strings with `` `n `` line separators. Use `[System.IO.File]::WriteAllText()` — NOT `Set-Content`. Full absolute `gradlew.bat` path with `&`:
```
$yml = "---`ntype: specs.openrewrite.org/v1beta/recipe`nname: com.custom.openrewrite.MigrateLegacyDependencies`nrecipeList:`n  - org.openrewrite.java.dependencies.ChangeDependency:`n      oldGroupId: commons-lang`n      oldArtifactId: commons-lang`n      newGroupId: org.apache.commons`n      newArtifactId: commons-lang3`n      newVersion: 3.14.0`n  - org.openrewrite.java.dependencies.ChangeDependency:`n      oldGroupId: io.springfox`n      oldArtifactId: springfox-swagger2`n      newGroupId: org.springdoc`n      newArtifactId: springdoc-openapi-starter-webmvc-ui`n      newVersion: 2.6.0`n  - org.openrewrite.java.dependencies.RemoveDependency:`n      groupId: io.springfox`n      artifactId: springfox-swagger-ui`n  - org.openrewrite.java.dependencies.RemoveDependency:`n      groupId: io.springfox`n      artifactId: springfox-core`n  - org.openrewrite.java.dependencies.RemoveDependency:`n      groupId: io.springfox`n      artifactId: springfox-bean-validators`n  - org.openrewrite.java.dependencies.RemoveDependency:`n      groupId: com.google.guava`n      artifactId: guava"; [System.IO.File]::WriteAllText("<project_location>\rewrite.yml", $yml); $f="$env:TEMP\orewrite-init.gradle"; [System.IO.File]::WriteAllText($f, "<groovy_body_with_`n_newlines>"); & "<project_location>\gradlew.bat" rewriteRun --quiet --init-script $f
```
