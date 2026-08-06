---
name: open-re-write-mvn-nix
description: "Use when the command is `apply openReWrite`, file_type is `maven`, and os is Linux or macOS. Contains the OpenRewrite Maven command template (Linux/macOS heredoc), recipe selection conditions, and collection rules for building automated Maven migration commands."
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

Expand to full FQCNs. Artifact coord prefix: `org.openrewrite.recipe:`. Deduplicate.

## Recipe Selection

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

**Row constraints:**
- **Rows 4 & 5:** Mutually exclusive by version band — only one can fire per run. Row 4 fires for 4.x projects (upgrades to 5.3). Row 5 fires for 5.x projects (upgrades to 6.0). A 4.x project must be migrated in two separate runs: first apply row 4, then row 5. Never emit both in the same `<recipes>` list. If `springBootVersion` is present, skip rows 4–5 entirely (row 3 manages the upgrade internally).
- **Rows 6 & 7:** Mutually exclusive — deduplicate `JavaxMigrationToJakarta` if both match; include it exactly once.
- **Row 9:** All three options are required; omitting any silently skips the recipe. Never narrow `groupId` to a specific value.
- **Row 10:** The `MigrateLegacyDependencies` YAML recipe (below) swaps Springfox → SpringDoc in `pom.xml`. Row 10 must accompany it — without row 10, `io.swagger.annotations.*` source references remain and cause compilation failure.

**Final deduplication:** After collecting all matching recipes, remove any duplicate FQCNs from `<recipes>` (preserving first-occurrence order) before assembling the command.

Collect all matching artifacts (comma-separated, deduplicated) into `<artifacts>` and all recipes (comma-separated) into `<recipes>`. Append `com.custom.openrewrite.MigrateLegacyDependencies` last.

## YAML Config Block

`ChangeDependency` and `RemoveDependency` are built-in core recipes — no extra `recipeArtifactCoordinates` needed. All entries are no-ops when the targeted dependency is absent.

```yaml
---
type: specs.openrewrite.org/v1beta/recipe
name: com.custom.openrewrite.MigrateLegacyDependencies
recipeList:
  # Purge JUnit 4 POM declaration (JUnit4to5Migration handles source; this removes the dependency entry)
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: junit
      artifactId: junit
  # Force Jackson to Java 21 / Spring 6 compatible version
  - org.openrewrite.java.dependencies.UpgradeDependencyVersion:
      groupId: com.fasterxml.jackson.core
      artifactId: jackson-databind
      newVersion: 2.17.2
      overrideManagedVersion: true
  # Upgrade H2 1.x → 2.x (required on JDK 17+)
  - org.openrewrite.java.dependencies.UpgradeDependencyVersion:
      groupId: com.h2database
      artifactId: h2
      newVersion: 2.2.224
      overrideManagedVersion: true
  # Upgrade embedded Tomcat to 10.1.x (Servlet 6 / Jakarta EE 9 compatibility)
  - org.openrewrite.java.dependencies.UpgradeDependencyVersion:
      groupId: org.apache.tomcat.embed
      artifactId: tomcat-embed-core
      newVersion: 10.1.25
      overrideManagedVersion: true
  # Legacy Commons migration
  - org.openrewrite.java.dependencies.ChangeDependency:
      oldGroupId: commons-lang
      oldArtifactId: commons-lang
      newGroupId: org.apache.commons
      newArtifactId: commons-lang3
      newVersion: 3.14.0
  # Springfox → SpringDoc POM swap
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
| M1 | Row 5 active OR `javaxServletVersion` present OR Row 10 active | **Automated** — `JavaxMigrationToJakarta` (Rows 6/7) rewrites `javax.servlet.*` → `jakarta.servlet.*` in source files; `SpringFoxToSpringDoc` (Row 10) removes `@EnableSwagger2` and replaces `Docket` with the SpringDoc `OpenAPI` bean. Both run in the same execution as the POM changes. No manual source edits required. |
| M2 | Row 4 was active (`springFrameworkVersion` >= 4 AND < 5) | **Two-run gate:** after this run completes, re-run `apply openReWrite` — the second run will fire Row 5 to complete the Spring Framework 5.3 → 6.0 upgrade. Do NOT skip the second run; skipping leaves the project on Spring 5.x and prevents Jakarta/Spring 6 compatibility. |
| M3 | Any recipe active | **POM XML integrity:** the automated sanitization step at the end of the command runs `mvn validate` and strips injected plain-text nodes via `perl -i`. If validation still fails after the automated step, open `pom.xml` manually, remove remaining plain-text inside XML elements, and wrap any retained notes as valid XML comments `<!-- note -->`. |

Append a "Manual Steps Required" section to `confirmation_message` for M2 only. M1 and M3 are fully automated by the command.

## Maven Command Template

Inline `<YAML_BLOCK>` literally inside the heredoc:
```
<prefix> cat > /tmp/rewrite-custom.yml << 'EOF'
<YAML_BLOCK>
EOF
echo "Ensure Java 21 is set as the active JDK before running this command" && \
<mvn> org.openrewrite.maven:rewrite-maven-plugin:6.44.0:run -B --no-transfer-progress \
  -Drewrite.configLocation=/tmp/rewrite-custom.yml \
  -Drewrite.recipeArtifactCoordinates=<artifacts> \
  -Drewrite.activeRecipes=<recipes> \
  -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.groupId=* \
  -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.artifactId=* \
  -Drewrite.options.org.openrewrite.maven.UpgradeDependencyVersion.newVersion=LATEST \
  -Dmaven.compiler.failOnError=false && \
<mvn> tidy:pom -Dpom.inplace=true || true && \
<mvn> validate -q || ( \
  echo "POM validation failed — removing injected text nodes from pom.xml..." && \
  perl -i -ne 'print unless /Dependency already updated/' pom.xml && \
  <mvn> validate -q \
)
```


