---
name: springboot3-inspection-rules
description: "Defines all inspection and migration rules an agent must apply when migrating a Spring Boot 2.x project to Spring Boot 3.x. Covers Jakarta EE namespace migration, Security, JPA, Batch, and configuration property changes."
user-invocable: false
---

# Skill: Spring Boot 2.x to 3.x Migration Inspection Rules

## Purpose

This skill defines all the rules an agent must apply when inspecting and migrating a Spring Boot 2.x project to Spring Boot 3.x. Rules are grouped by category. For each rule: detect the old pattern, apply the modern replacement, and note any conditions or risks.

Spring Boot 3.x requires **Java 17 minimum** and is based on **Jakarta EE 10** (namespace change from `javax.*` to `jakarta.*`). This is the most pervasive breaking change in the migration.

---

## Rule Categories

---

### 1. Java Version Requirement

**Rule:** Spring Boot 3.x requires Java 17 or higher. Ensure the project build file targets at least Java 17.

**Before (`pom.xml`):**
```xml
<properties>
    <java.version>11</java.version>
</properties>
```

**After:**
```xml
<properties>
    <java.version>17</java.version>
</properties>
```

**Before (`build.gradle`):**
```groovy
java.sourceCompatibility = JavaVersion.VERSION_11
```

**After:**
```groovy
java.sourceCompatibility = JavaVersion.VERSION_17
```

**Conditions:** Any Java version below 17 must be upgraded. Spring Boot 3.x will not compile or run on Java 8, 11, or 16.

---

### 2. Spring Boot Parent / Dependency Version

**Rule:** Upgrade the Spring Boot parent POM or Gradle plugin to 3.x.

**Before (`pom.xml`):**
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>2.7.x</version>
</parent>
```

**After:**
```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.x</version>
</parent>
```

**Before (`build.gradle`):**
```groovy
plugins {
    id 'org.springframework.boot' version '2.7.x'
}
```

**After:**
```groovy
plugins {
    id 'org.springframework.boot' version '3.2.x'
}
```

---

### 3. `javax.*` → `jakarta.*` Namespace Migration (Critical)

**Rule:** Replace all `javax.*` imports with `jakarta.*` equivalents. This is the most impactful change in Spring Boot 3.x / Jakarta EE 10.

**Common replacements:**

| Old import | New import |
|---|---|
| `javax.persistence.*` | `jakarta.persistence.*` |
| `javax.validation.*` | `jakarta.validation.*` |
| `javax.servlet.*` | `jakarta.servlet.*` |
| `javax.transaction.*` | `jakarta.transaction.*` |
| `javax.annotation.*` | `jakarta.annotation.*` |
| `javax.inject.*` | `jakarta.inject.*` |
| `javax.ws.rs.*` | `jakarta.ws.rs.*` |
| `javax.xml.bind.*` | `jakarta.xml.bind.*` |
| `javax.mail.*` | `jakarta.mail.*` |
| `javax.el.*` | `jakarta.el.*` |

**Before:**
```java
import javax.persistence.Entity;
import javax.validation.constraints.NotNull;
import javax.servlet.http.HttpServletRequest;
```

**After:**
```java
import jakarta.persistence.Entity;
import jakarta.validation.constraints.NotNull;
import jakarta.servlet.http.HttpServletRequest;
```

**Conditions:** Apply to every `.java` file in `src/`. Also update any XML/properties files referencing `javax` class names.

---

### 4. Spring Security — Deprecated API Removals

**Rule:** Spring Security 6 (bundled with Spring Boot 3) removed several deprecated classes and changed the configuration model.

#### 4.1 — `WebSecurityConfigurerAdapter` removed

**Before:**
```java
@Configuration
public class SecurityConfig extends WebSecurityConfigurerAdapter {
    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeRequests().antMatchers("/public/**").permitAll();
    }
}
```

**After:**
```java
@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
            .requestMatchers("/public/**").permitAll()
        );
        return http.build();
    }
}
```

#### 4.2 — `antMatchers` / `mvcMatchers` → `requestMatchers`

**Before:**
```java
http.authorizeRequests().antMatchers("/admin/**").hasRole("ADMIN");
```

**After:**
```java
http.authorizeHttpRequests(auth -> auth
    .requestMatchers("/admin/**").hasRole("ADMIN")
);
```

**Note:** In Spring Security 6, `requestMatchers(String pattern)` defaults to `MvcRequestMatcher` when Spring MVC is on the classpath. For non-MVC paths (e.g. H2 console, static resources served outside Spring MVC), wrap the pattern explicitly:
```java
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;

http.authorizeHttpRequests(auth -> auth
    .requestMatchers(new AntPathRequestMatcher("/h2-console/**")).permitAll()
);
```
Also ensure `http.headers(h -> h.frameOptions(f -> f.sameOrigin()))` and CSRF exemption are configured for H2 console setups.

#### 4.3 — `authorizeRequests` → `authorizeHttpRequests`

Replace all `authorizeRequests()` chains with `authorizeHttpRequests()`.

#### 4.4 — `HttpSecurity.cors()` / `csrf()` lambda syntax

**Before:**
```java
http.cors().and().csrf().disable();
```

**After:**
```java
http.cors(Customizer.withDefaults())
    .csrf(csrf -> csrf.disable());
```

#### 4.5 — `PasswordEncoder` — no change required, but verify bean is declared

`BCryptPasswordEncoder` and other encoders are still available. Ensure a `PasswordEncoder` bean is declared explicitly.

---

### 5. Spring Data — Repository and Query Changes

#### 5.1 — `CrudRepository.findById` returns `Optional` (unchanged, but verify `.get()` usage)

No signature change, but ensure callers use `orElseThrow()` instead of `.get()`.

#### 5.2 — `JpaRepository.getOne` → `getReferenceById`

**Before:**
```java
MyEntity entity = repository.getOne(id);
```

**After:**
```java
MyEntity entity = repository.getReferenceById(id);
```

#### 5.3 — `@Query` native queries — no change

#### 5.4 — Auditing: `@EnableJpaAuditing` — no change

#### 5.5 — `spring.jpa.open-in-view` default changed

In Spring Boot 3, `spring.jpa.open-in-view` defaults to `false`. If your application relies on lazy loading in views, add explicitly:
```properties
spring.jpa.open-in-view=true
```

---

### 6. Spring MVC — Deprecated and Removed APIs

#### 6.1 — `PathMatchingConfigurationAdapter` / `WebMvcConfigurer` default methods

`WebMvcConfigurer` methods are unchanged but `PathMatchingConfigurationAdapter` was removed. Use `WebMvcConfigurer` directly.

#### 6.2 — Default `spring.mvc.pathmatch.use-suffix-pattern` removed

Spring Boot 3 removes suffix pattern matching entirely. Remove any configuration that sets `spring.mvc.pathmatch.use-suffix-pattern=true`.

#### 6.3 — `HttpMethod` — Interface in Spring 6 (informational)

In Spring Framework 6 / Boot 3, `HttpMethod` was changed from an **enum** to an **interface** to support custom HTTP methods (e.g. WebDAV). As a result:

- `HttpMethod.GET`, `HttpMethod.POST`, etc. are still valid static constants — no change needed.
- `HttpMethod.valueOf("GET")` also remains valid and returns an `HttpMethod` instance.
- **Switch expressions or `==` comparisons** against `HttpMethod` enum values will break — replace with `.equals()` or use the constant directly.

**Before (broken — enum comparison):**
```java
if (request.getMethod().equals(HttpMethod.GET.name())) { ... }
```

**After:**
```java
if (HttpMethod.GET.matches(request.getMethod())) { ... }
```

No action is required if the code only uses `HttpMethod.GET` / `HttpMethod.POST` as constants.

#### 6.4 — `ResponseEntityExceptionHandler` — method signatures changed

Override methods in `ResponseEntityExceptionHandler` now use `jakarta.servlet` types. Update all `@Override` methods to match the new signatures.

---

### 7. Actuator — Endpoint and Property Changes

#### 7.1 — Actuator base path default changed

In Spring Boot 3, the default management base path is `/actuator` (unchanged). However, `management.endpoints.web.base-path` must now be set explicitly if customized.

#### 7.2 — `info` endpoint disabled by default

**Before (Spring Boot 2 — info was enabled by default):**
No configuration needed.

**After (Spring Boot 3 — must enable explicitly):**
```properties
management.endpoints.web.exposure.include=health,info
management.info.env.enabled=true
```

#### 7.3 — Health endpoint groups

No breaking change, but `management.endpoint.health.show-details` behavior is unchanged.

---

### 8. Configuration Properties — Renamed and Removed Keys

**Rule:** Many `application.properties` / `application.yml` keys were renamed or removed between Spring Boot 2.7 and 3.x.

| Old key | New key |
|---|---|
| `spring.redis.*` | `spring.data.redis.*` |
| `spring.elasticsearch.rest.*` | `spring.elasticsearch.*` |
| `spring.datasource.initialization-mode` | `spring.sql.init.mode` |
| `spring.jpa.hibernate.ddl-auto` | unchanged |
| `spring.mvc.pathmatch.use-suffix-pattern` | removed (set to false always) |
| `spring.security.oauth2.resourceserver.jwt.jwk-set-uri` | unchanged |
| `logging.file` | `logging.file.name` |
| `logging.path` | `logging.file.path` |
| `server.max-http-header-size` | `server.max-http-request-header-size` |
| `spring.cache.infinispan.config` | removed |

**Action:** Search `application.properties` and `application.yml` for deprecated keys and replace them.

---

### 9. Spring Batch — Major Breaking Changes (if used)

**Rule:** Spring Batch 5 (bundled with Spring Boot 3) introduced significant API changes.

#### 9.1 — `JobBuilderFactory` / `StepBuilderFactory` removed

**Before:**
```java
@Autowired
private JobBuilderFactory jobBuilderFactory;

Job job = jobBuilderFactory.get("myJob")
    .start(step1)
    .build();
```

**After:**
```java
@Bean
public Job myJob(JobRepository jobRepository, Step step1) {
    return new JobBuilder("myJob", jobRepository)
        .start(step1)
        .build();
}
```

#### 9.2 — `StepBuilderFactory` → `StepBuilder`

**Before:**
```java
stepBuilderFactory.get("myStep").<In, Out>chunk(10)
    .reader(reader)
    .writer(writer)
    .build();
```

**After:**
```java
new StepBuilder("myStep", jobRepository).<In, Out>chunk(10, transactionManager)
    .reader(reader)
    .writer(writer)
    .build();
```

> ⚠️ **Important:** Spring Batch 5 requires an explicit `PlatformTransactionManager` passed directly into `.chunk(chunkSize, transactionManager)`. This is a deliberate breaking change — standard auto-refactoring recipes (including OpenRewrite) often miss this argument and generate code that does not compile. Always inject `PlatformTransactionManager` as a `@Bean` parameter and pass it to the `StepBuilder`.

#### 9.3 — `@EnableBatchProcessing` behavior changed

`@EnableBatchProcessing` now auto-configures batch infrastructure. If you previously used it with custom configuration, review whether it conflicts with auto-configuration.

---

### 10. Spring Cloud (if used) — Version Alignment

**Rule:** Spring Cloud versions must match the Spring Boot 3.x compatibility matrix.

| Spring Boot | Spring Cloud |
|---|---|
| 3.0.x | 2022.0.x (Kilburn) |
| 3.1.x | 2022.0.x (Kilburn) |
| 3.2.x | 2023.0.x (Leyton) |
| 3.3.x | 2023.0.x (Leyton) |

Update the `spring-cloud.version` property in `pom.xml` or `build.gradle` accordingly.

---

### 11. Deprecated Spring Framework 5 APIs Removed in Spring 6

Spring Boot 3 is based on Spring Framework 6. The following Spring Framework 5.x deprecated APIs are removed.

| Removed class/method | Replacement |
|---|---|
| `org.springframework.util.Assert.notNull(obj, Supplier)` signature changes | Use `Assert.notNull(obj, () -> "message")` |
| `MockMvcBuilders.webAppContextSetup` — unchanged, but verify imports use `jakarta` | Update test imports |
| `RestTemplate` `exchange` with `HttpEntity` | Unchanged, but `RestClient` is preferred in Spring 6 |
| `@RequestMapping` `produces` with suffix patterns | Remove — suffix patterns removed |

---

### 12. Hibernate 6 — JPA / Entity Changes (if using JPA)

Spring Boot 3 uses Hibernate 6.x. Key changes:

#### 12.1 — `@Type` annotation changed

**Before:**
```java
@Type(type = "json")
private Map<String, Object> metadata;
```

**After:**
```java
@JdbcTypeCode(SqlTypes.JSON)
private Map<String, Object> metadata;
```

#### 12.2 — `@TypeDef` removed

Remove all `@TypeDef` annotations. Register custom types via `@Type` with the new Hibernate 6 API or `@JdbcType`.

#### 12.3 — `CriteriaBuilder` — no significant change

#### 12.4 — `@Formula` — unchanged

#### 12.5 — ID generation strategy default changed

`GenerationType.AUTO` now uses `GenerationType.SEQUENCE` by default in Hibernate 6 (was `TABLE` in Hibernate 5). If you rely on auto-increment columns, change to `GenerationType.IDENTITY` explicitly:

```java
@GeneratedValue(strategy = GenerationType.IDENTITY)
```

---

### 13. Micrometer / Metrics — Breaking Changes

Spring Boot 3 uses Micrometer 1.10+ and the new Observation API.

#### 13.1 — `spring.metrics.*` properties removed

Replace with Micrometer-specific configuration under `management.metrics.*`.

#### 13.2 — `@Timed` on `@RestController` methods

Previously auto-applied via `@Timed` on class/method. Now requires explicit `ObservationRegistry` or a `TimedAspect` bean.

---

### 14. Circular Dependency Detection — Now Fails by Default

**Rule:** Spring Boot 3 fails on circular bean dependencies by default (previously a warning).

**Fix:** Refactor to eliminate circular dependencies. As a temporary workaround:
```properties
spring.main.allow-circular-references=true
```

**Risk:** High — do not rely on the workaround in production; fix the circular dependency.

---

### 15. Third-Party Library Compatibility

Verify compatibility of these commonly used libraries with Spring Boot 3 / Jakarta EE 10:

| Library | Minimum version for Spring Boot 3 |
|---|---|
| Lombok | 1.18.24+ |
| MapStruct | 1.5.3+ |
| Springfox (Swagger 2) | **NOT compatible** — migrate to Springdoc OpenAPI 2.x |
| SpringDoc OpenAPI | 2.x (not 1.x) |
| Flyway | 9.x+ |
| Liquibase | 4.17+ |
| Testcontainers | 1.17.6+ |
| Jackson | 2.14+ (auto-managed by Spring Boot 3 BOM) |
| ModelMapper | 3.1+ |

#### 15.1 — Springfox → Springdoc migration (critical if Springfox is used)

**Before (`pom.xml`):**
```xml
<dependency>
    <groupId>io.springfox</groupId>
    <artifactId>springfox-boot-starter</artifactId>
    <version>3.0.0</version>
</dependency>
```

**After:**
```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.2.0</version>
</dependency>
```

Remove all `@Api`, `@ApiOperation`, `@ApiParam` annotations (Springfox-specific). Replace with `@Tag`, `@Operation`, `@Parameter` from `io.swagger.v3.oas.annotations`.

---

### 16. Test Configuration Changes

#### 16.1 — `@SpringBootTest` — unchanged

#### 16.2 — `MockMvc` — imports updated to `jakarta`

Verify all test imports using `javax.servlet` are updated to `jakarta.servlet`.

#### 16.3 — `@AutoConfigureMockMvc` — unchanged

#### 16.4 — `TestRestTemplate` — unchanged

#### 16.5 — `@DataJpaTest` — uses Hibernate 6 by default

Tests using `@DataJpaTest` now run against Hibernate 6. Verify that entity configurations are compatible (see Rule 12).

---

### 17. Gradle — Build Script Updates (if using Gradle)

#### 17.1 — `bootJar` / `bootRun` tasks — unchanged

#### 17.2 — `dependencyManagement` plugin still required for BOM imports

```groovy
plugins {
    id 'io.spring.dependency-management' version '1.1.x'
}
```

#### 17.3 — `sourceCompatibility` must be `17` or higher

---

### 18. Banner and Auto-configuration Changes

#### 18.1 — Auto-configuration registration moved

Spring Boot 3 uses `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` instead of `META-INF/spring.factories` for auto-configuration registration.

**Before (`spring.factories`):**
```
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  com.example.MyAutoConfiguration
```

**After (`AutoConfiguration.imports`):**
```
com.example.MyAutoConfiguration
```

**Conditions:** Only applies to projects that define custom auto-configurations.

---

## Agent Behavior Guidelines

When analyzing a Spring Boot 2.x project for migration to Spring Boot 3.x:

1. **Check Java version first** (Rule 1) — if below 17, this must be fixed before anything else compiles.
2. **Apply `javax` → `jakarta` migration** (Rule 3) to every `.java` file — this is the highest-volume change.
3. **Inspect `pom.xml` / `build.gradle`** for parent version, dependency versions, and properties (Rules 2, 8, 10, 15).
4. **Inspect `application.properties` / `application.yml`** for renamed/removed keys (Rule 8).
5. **Inspect Security configuration** (Rule 4) — `WebSecurityConfigurerAdapter` removal breaks compilation.
6. **Inspect JPA entities and repositories** (Rules 5, 12) — Hibernate 6 changes affect persistence layer.
7. **Check for Springfox** (Rule 15.1) — if present, it will not start at all on Spring Boot 3.
8. **Check for Spring Batch** (Rule 9) — if present, factory classes were removed.
9. **Report each finding** with file path, line number, rule number, current code, and suggested replacement.
10. **Prioritize by compilation impact**: Rule 3 (javax→jakarta) and Rule 4 (Security) block compilation; fix these first in the migration order.

