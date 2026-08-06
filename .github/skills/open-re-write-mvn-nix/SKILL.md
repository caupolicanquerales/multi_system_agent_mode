---
name: open-re-write-mvn-nix
description: "Use when the command is `apply openReWrite`, file_type is `maven`, and os is Linux or macOS. Contains the OpenRewrite Maven command template (Linux/macOS heredoc), recipe selection conditions, and collection rules for building automated Maven migration commands."
user-invocable: false
---

# OpenRewrite Command Rules — Maven

## Scope

Valid only for `file_type: "maven"`. Otherwise: `terminal_command: null`, `confirmation_message: "ERROR: This skill is only for Maven projects."`. If no recipe matches: `terminal_command: null`, `confirmation_message: "ERROR: No applicable OpenRewrite recipes found for the given metadata."`.

Resolve `<mvn>` and `<prefix>` from [general-command-rules](.github/skills/general-command-rules.md).

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

```
<prefix> cat > /tmp/rewrite-custom.yml << 'EOF'
---
type: specs.openrewrite.org/v1beta/recipe
name: com.custom.openrewrite.MigrateLegacyDependencies
recipeList:
  - org.openrewrite.java.dependencies.RemoveDependency:
      groupId: junit
      artifactId: junit
  - org.openrewrite.java.dependencies.UpgradeDependencyVersion:
      groupId: com.fasterxml.jackson.core
      artifactId: jackson-databind
      newVersion: 2.17.2
      overrideManagedVersion: true
  - org.openrewrite.java.dependencies.UpgradeDependencyVersion:
      groupId: com.h2database
      artifactId: h2
      newVersion: 2.2.224
      overrideManagedVersion: true
  - org.openrewrite.java.dependencies.UpgradeDependencyVersion:
      groupId: org.apache.tomcat.embed
      artifactId: tomcat-embed-core
      newVersion: 10.1.25
      overrideManagedVersion: true
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
  - org.openrewrite.java.dependencies.ChangeDependency:
      oldGroupId: javax.servlet
      oldArtifactId: servlet-api
      newGroupId: jakarta.servlet
      newArtifactId: jakarta.servlet-api
      newVersion: 6.0.0
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-swagger-ui}
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-core}
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: io.springfox, artifactId: springfox-bean-validators}
  - org.openrewrite.java.dependencies.RemoveDependency: {groupId: com.google.guava, artifactId: guava}
  - org.openrewrite.maven.AddManagedDependency:
      groupId: org.springframework
      artifactId: spring-framework-bom
      version: 6.1.14
      type: pom
      scope: import
  - org.openrewrite.maven.AddManagedDependency:
      groupId: jakarta.platform
      artifactId: jakarta.jakartaee-bom
      version: 10.0.0
      type: pom
      scope: import
  - org.openrewrite.maven.RemoveRedundantDependencyVersions
  - org.openrewrite.maven.RemoveProperty:
      propertyName: spring.version
  - org.openrewrite.maven.RemoveProperty:
      propertyName: springframework.version
  - org.openrewrite.maven.RemoveProperty:
      propertyName: log4j.version
  - org.openrewrite.maven.RemoveProperty:
      propertyName: junit.version
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


