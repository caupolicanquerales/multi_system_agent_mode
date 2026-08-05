---
name: springboot3-inspection-rules
description: "Defines all inspection and migration rules an agent must apply when migrating a Spring Boot 2.x project to Spring Boot 3.x. Covers Jakarta EE namespace migration, Security, JPA, Batch, and configuration property changes."
user-invocable: false
---

# Spring Boot 2.x → 3.x Migration Rules

Spring Boot 3.x requires **Java 17+** and **Jakarta EE 10** (`javax.*` → `jakarta.*`). All rules below apply to `src/` unless noted.

---

## Agent Priority Order

1. Fix Java version to 17+ (Rule 1&2) — nothing compiles below 17.
2. Replace all `javax.*` → `jakarta.*` (Rule 3) — highest-volume change.
3. Fix Security config (Rule 4) — `WebSecurityConfigurerAdapter` removal blocks compilation.
4. Update `pom.xml`/`build.gradle` parent, properties, and dependency versions (Rules 1&2, 8, 10, 15).
5. Fix JPA/Hibernate 6 entities and repositories (Rules 5, 12), Spring Batch (Rule 9), and Springfox (Rule 15.1).

Report each finding with: file path, line number, rule number, current code, suggested replacement.

---

## Rules

### 1 & 2 — Build System: Java Version + Spring Boot Parent

| Target | Old value | New value |
|---|---|---|
| `pom.xml` `<java.version>` | `11` (or any < 17) | `17` |
| `pom.xml` `<parent><version>` | `2.7.x` | `3.2.x` |
| `build.gradle` `sourceCompatibility` | `VERSION_11` | `VERSION_17` |
| `build.gradle` plugin `'org.springframework.boot'` | `'2.7.x'` | `'3.2.x'` |
| `build.gradle` `io.spring.dependency-management` plugin | any | `1.1.x` (still required for BOM imports) |

`bootJar` / `bootRun` tasks — unchanged.

---

### 3 — `javax.*` → `jakarta.*` (Critical)

Replace every `javax.*` import in every `.java` file. Also update any XML/properties references.

| Old | New |
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

---

### 4 — Spring Security 6

| Old pattern | New pattern | Notes |
|---|---|---|
| `extends WebSecurityConfigurerAdapter` | `@Bean SecurityFilterChain filterChain(HttpSecurity http)` | Class removed; use bean-based config |
| `http.authorizeRequests()` | `http.authorizeHttpRequests(auth -> ...)` | Method removed |
| `.antMatchers(...)` / `.mvcMatchers(...)` | `.requestMatchers(...)` | Methods removed |
| `http.cors().and().csrf().disable()` | `http.cors(Customizer.withDefaults()).csrf(c -> c.disable())` | Chained `.and()` removed |
| Non-MVC paths (H2 console, static) | `requestMatchers(new AntPathRequestMatcher("/h2-console/**"))` | `requestMatchers(String)` defaults to `MvcRequestMatcher`; use `AntPathRequestMatcher` for non-MVC paths |

`PasswordEncoder` beans (`BCryptPasswordEncoder`) are unchanged — verify explicit `@Bean` declaration exists.

---

### 5 — Spring Data

| Old | New | Notes |
|---|---|---|
| `repository.getOne(id)` | `repository.getReferenceById(id)` | `getOne` removed |
| `Optional.get()` on `findById` | `.orElseThrow()` | No API change; code quality fix |
| `spring.jpa.open-in-view` | Add `spring.jpa.open-in-view=true` if lazy loading in views is needed | Defaults to `false` in Boot 3 |

`@Query`, `@EnableJpaAuditing` — no change.

---

### 6 — Spring MVC

| Item | Action |
|---|---|
| `PathMatchingConfigurationAdapter` | Removed — use `WebMvcConfigurer` directly |
| `spring.mvc.pathmatch.use-suffix-pattern=true` | Remove — suffix pattern matching eliminated |
| `HttpMethod` enum comparisons (`==`) | Replace with `.equals()` or `.matches(request.getMethod())` — `HttpMethod` is now an interface |
| `ResponseEntityExceptionHandler` overrides | Update method signatures to use `jakarta.servlet` types |

---

### 7 — Actuator

| Item | Action |
|---|---|
| `info` endpoint | Now disabled by default — add `management.endpoints.web.exposure.include=health,info` and `management.info.env.enabled=true` |
| `management.endpoints.web.base-path` | Set explicitly if customized |

---

### 8 — Renamed/Removed `application.properties` Keys

| Old key | New key |
|---|---|
| `spring.redis.*` | `spring.data.redis.*` |
| `spring.elasticsearch.rest.*` | `spring.elasticsearch.*` |
| `spring.datasource.initialization-mode` | `spring.sql.init.mode` |
| `spring.mvc.pathmatch.use-suffix-pattern` | Removed |
| `logging.file` | `logging.file.name` |
| `logging.path` | `logging.file.path` |
| `server.max-http-header-size` | `server.max-http-request-header-size` |
| `spring.cache.infinispan.config` | Removed |

`spring.jpa.hibernate.ddl-auto`, `spring.security.oauth2.resourceserver.jwt.jwk-set-uri` — unchanged.

---

### 9 — Spring Batch 5 (if used)

| Old | New |
|---|---|
| `@Autowired JobBuilderFactory` + `.get("name").start(step).build()` | `new JobBuilder("name", jobRepository).start(step).build()` |
| `stepBuilderFactory.get("name").<I,O>chunk(10)` | `new StepBuilder("name", jobRepository).<I,O>chunk(10, transactionManager)` |

> ⚠️ `chunk()` now requires an explicit `PlatformTransactionManager` argument. OpenRewrite often misses this — always inject and pass it manually.

`@EnableBatchProcessing` now auto-configures batch infrastructure — verify it does not conflict with custom configuration.

---

### 10 — Spring Cloud Version Alignment (if used)

| Spring Boot | Spring Cloud |
|---|---|
| 3.0.x / 3.1.x | 2022.0.x (Kilburn) |
| 3.2.x / 3.3.x | 2023.0.x (Leyton) |

---

### 11 — Removed Spring Framework 5 APIs

| Removed | Replacement |
|---|---|
| `Assert.notNull(obj, Supplier)` signature | `Assert.notNull(obj, () -> "message")` |
| `@RequestMapping produces` with suffix patterns | Remove — suffix patterns eliminated |
| `RestTemplate` | Still works; `RestClient` preferred in Spring 6 |

---

### 12 — Hibernate 6 (if using JPA)

| Old | New |
|---|---|
| `@Type(type = "json")` | `@JdbcTypeCode(SqlTypes.JSON)` |
| `@TypeDef` | Removed — use `@Type` with Hibernate 6 API or `@JdbcType` |
| `@GeneratedValue(strategy = AUTO)` | Change to `IDENTITY` if using auto-increment columns — `AUTO` now maps to `SEQUENCE` |

`@Formula`, `@EnableJpaAuditing`, `CriteriaBuilder` — unchanged.

---

### 13 — Miscellaneous & Core Behavior

| Topic | Old | New / Action |
|---|---|---|
| Micrometer: `spring.metrics.*` properties | `spring.metrics.*` | `management.metrics.*` |
| Micrometer: `@Timed` on `@RestController` | Auto-applied | Requires explicit `ObservationRegistry` or `TimedAspect` bean |
| Circular dependencies | Logged as warning | **Fails at startup** — fix by refactoring; workaround: `spring.main.allow-circular-references=true` (do not leave in production) |
| Auto-configuration registration (custom configs only) | `META-INF/spring.factories` `EnableAutoConfiguration=com.example.MyAutoConfiguration` | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` containing `com.example.MyAutoConfiguration` |

---

### 15 — Third-Party Library Compatibility

| Library | Minimum version |
|---|---|
| Lombok | 1.18.24+ |
| MapStruct | 1.5.3+ |
| Springfox | **NOT compatible** — migrate to Springdoc OpenAPI 2.x |
| SpringDoc OpenAPI | 2.x (not 1.x) |
| Flyway | 9.x+ |
| Liquibase | 4.17+ |
| Testcontainers | 1.17.6+ |
| Jackson | 2.14+ (auto-managed by BOM) |
| ModelMapper | 3.1+ |

**Springfox → Springdoc:** Replace `io.springfox:springfox-boot-starter` with `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.2.0`. Replace `@Api`, `@ApiOperation`, `@ApiParam` with `@Tag`, `@Operation`, `@Parameter` from `io.swagger.v3.oas.annotations`.

---

### 16 — Test Configuration

| Item | Action |
|---|---|
| `MockMvc` / test imports using `javax.servlet` | Update to `jakarta.servlet` |
| `@DataJpaTest` | Now runs against Hibernate 6 — verify entity compatibility (Rule 12) |

`@SpringBootTest`, `@AutoConfigureMockMvc`, `TestRestTemplate` — unchanged.

