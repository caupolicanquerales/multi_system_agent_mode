---
name: spring-boot-main-class
description: "Detects the presence of a Spring Boot main class in the project, and defines the rules to create one when it is missing, parameterized by the project's target Spring Boot/Java version."
user-invocable: false
---

# Spring Boot Main Class — Detection & Creation Rules

Resolve `<target.springBootMajor>` / `<target.javaVersion>` from `metadata`/`modernization-metrics.json` before Rule 4.

---

## 0 — Build file & source root

```
primary build file  = pom.xml | build.gradle(.kts)  (module root, if multi-module)
source-root default = <module-root>/src/main/java
source-root override = build file's custom dir (Maven <sourceDirectory>; Gradle sourceSets.main.java.srcDirs) if declared, else dir under <module-root> with most .java files
```
All rules use `<source-root>` — never hardcode `src/main/java`.

---

## 1 — Detection

```
entry-point-found = annotations includes SpringBootApplication
                     OR (Configuration + EnableAutoConfiguration + ComponentScan)
                     OR (className endsWith "Application" AND javadoc matches /main/i)
```
`false` for all classes → Rule 2.

---

## 2 — When to create

```
create = NOT entry-point-found (Rule 1) AND NOT exists(*Application.java under <source-root>/**)
```
Partial `*Application.java` found → flag manual review, do not create. Never create a 2nd entry point.

---

## 3 — Package & class name

```
package    = shortest common package prefix of all classes under <source-root>
             fallback: groupId (Maven) | group (Gradle), dots → segments
className  = PascalCase(artifactId | rootProject.name) + "Application"
             fallback: "Application"
target_path = <source-root>/<package-path>/<ClassName>.java
```

---

## 4 — Template

```
target.springBootMajor >= 3 → Java 17+
target.springBootMajor == 2 → Java 8+ (or project baseline, whichever higher)
```
Same `@SpringBootApplication` shape both majors — no `javax.*`/`jakarta.*` imports here.

`jar` packaging (default):
```java
package <resolved.package>;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class <ClassName> {
    public static void main(String[] args) {
        SpringApplication.run(<ClassName>.class, args);
    }
}
```

`war` packaging:
```java
package <resolved.package>;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

@SpringBootApplication
public class <ClassName> extends SpringBootServletInitializer {
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(<ClassName>.class);
    }
    public static void main(String[] args) {
        SpringApplication.run(<ClassName>.class, args);
    }
}
```

---

## 5 — Guardrails

- Never overwrite existing file at `target_path` → skip, flag manual review.
- Package = common root (Rule 3) only — never a leaf/feature package.
- No `@EnableWebMvc` on this class.
- Emit as file-creation finding with `target_path` — never as a code comment.
