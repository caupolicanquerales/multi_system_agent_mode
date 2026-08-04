---
name: command-extractor-gradle
description: "Use when file_type is gradle. Contains rules for detecting Gradle projects (build.gradle / build.gradle.kts) and targeted grep_search patterns to extract Java, Spring Boot, and JUnit version metadata."
user-invocable: false
---

# Gradle Extraction Rules

## File Type Detection

If a `build.gradle` or `build.gradle.kts` file is found in the project directory → `file_type: "gradle"`.

## Metadata Extraction

**Single-pass rule:** Issue exactly **one** `grep_search` call targeting the Gradle build file. Combine all patterns with `|`. **Never call `read_file` on a full Gradle file.**

> ⛔ Do NOT make separate `grep_search` calls per metadata field. All patterns must be merged into the single call below.

```
pattern: sourceCompatibility|targetCompatibility|languageVersion|javaVersion|spring-boot|springBootVersion|id.*spring-boot|junit|spring-webmvc|spring-context|spring-core|spring-beans|spring-orm|spring-jdbc|springFrameworkVersion|spring\.version|javax\.servlet|servlet-api|jakarta\.servlet
isRegexp: true
includePattern: <path to build.gradle or build.gradle.kts>
```

From the returned lines, extract each value according to these rules:

### Java Version
- Match lines containing `sourceCompatibility`, `targetCompatibility`, `languageVersion`, or `javaVersion`.
- Extract the version string from the value. Set `metadata.language.javaVersion`.

### Spring Boot Version
- Match lines containing `spring-boot`, `springBootVersion`, or `id.*spring-boot`.
- Extract the version from the line. Set `metadata.frameworks.springBootVersion`.

### JUnit Version
- Match lines containing `junit`.
- If any returned line contains a version inline (e.g., `'junit:junit:4.13.2'`), extract it directly.
- Set `metadata.frameworks.junitVersion`.

### Spring Framework Version (non-Boot)
- Match lines containing `spring-webmvc`, `spring-context`, `spring-core`, `spring-beans`, `spring-orm`, `spring-jdbc`, `springFrameworkVersion`, or `spring.version`.
- Only populate this field when `springBootVersion` is **absent**.
- Set `metadata.frameworks.springFrameworkVersion`.

### Javax Servlet Version
- Match lines containing `javax.servlet`, `servlet-api`, or `jakarta.servlet`.
- Set `metadata.frameworks.javaxServletVersion` to the version found or `"present"` if no inline version is visible.

## Normalization

- If a version cannot be determined, omit that key.
- Return plain version strings exactly as found (do not transform ranges).
- Include only values confidently found in files.
