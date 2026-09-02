---
name: command-extractor-mvn
description: "Use when file_type is maven. Contains rules for detecting Maven projects (pom.xml), Maven wrapper detection (hasMavenWrapper), and targeted grep_search patterns to extract Java, Spring Boot, and JUnit version metadata."
user-invocable: false
---

# Maven Extraction Rules

## File Type Detection

If a `pom.xml` file is found in the project directory → `file_type: "maven"`.

## Wrapper Detection

Use `list_dir` on `project_location` only (shallow — do **not** recurse into subdirectories) to check whether `mvnw.cmd` (Windows) or `mvnw` (Linux/macOS) exists. Set `hasMavenWrapper` to `true` if found, `false` otherwise.

## Metadata Extraction

**Single-pass rule:** Issue exactly **one** `grep_search` call targeting the `pom.xml` file. Combine all patterns with `|`. **Never call `read_file` on a full `pom.xml`** — large enterprise files can be 1,000–5,000+ lines and cost 5,000–15,000 tokens to read entirely.

> ⛔ Do NOT make separate `grep_search` calls per metadata field. All patterns must be merged into the single call below.

```
pattern: java\.version|maven\.compiler\.(source|target|release)|spring-boot\.version|spring-boot-starter-parent|spring-boot[^-]|<artifactId>junit|junit\.version|junit-jupiter|<artifactId>spring-(webmvc|context|core|beans|orm|jdbc|tx|aop|web)</artifactId>|spring\.framework\.version|<spring\.version>|javax\.servlet|servlet-api|jakarta\.servlet
isRegexp: true
includePattern: <path to pom.xml>
```

From the returned lines, extract each value according to these rules:

### Java Version
- Match lines containing `java.version`, `maven.compiler.source`, `maven.compiler.target`, or `maven.compiler.release`.
- Extract the version string from the value (e.g., `<java.version>1.8</java.version>` → `"1.8"`).
- Set `metadata.language.javaVersion`.

### Spring Boot Version
- Match lines containing `spring-boot.version`, `spring-boot-starter-parent`, or `spring-boot`.
- Extract the version from the line. Set `metadata.frameworks.springBootVersion`.

### JUnit Version
- Match lines containing `junit`.
- If any returned line already contains a version inline (e.g., `<version>4.13.2</version>` adjacent to `junit` or `junit:junit:4.13.2`), extract it directly.
- If the returned lines contain only `<artifactId>junit</artifactId>` with no inline version, note the **line number** and call `read_file` with `startLine` = that line and `endLine` = that line + 4. This is the **only** permitted `read_file` fallback and must be a narrow range (≤ 5 lines).
- Set `metadata.frameworks.junitVersion`.

### Spring Framework Version (non-Boot)
- Match lines containing `spring-webmvc`, `spring-context`, `spring-core`, `spring-beans`, `spring-orm`, `spring-jdbc`, `spring.framework.version`, or `<spring.version>`.
- Only populate this field when `springBootVersion` is **absent** — Spring Boot manages the framework version internally.
- If only the `<artifactId>` line matched with no inline version, use the same adjacent-line `read_file` fallback (≤ 5 lines) as JUnit.
- Set `metadata.frameworks.springFrameworkVersion`.

### Javax Servlet Version
- Match lines containing `javax.servlet`, `servlet-api`, or `jakarta.servlet`.
- Set `metadata.frameworks.javaxServletVersion` to the version found, or `"present"` if only the groupId/artifactId is visible without an inline version. This field being set is sufficient to trigger the Jakarta migration recipe regardless of its value.

## Normalization

- If a version cannot be determined, omit that key.
- Return plain version strings exactly as found (do not transform ranges).
- Include only values confidently found in files.
