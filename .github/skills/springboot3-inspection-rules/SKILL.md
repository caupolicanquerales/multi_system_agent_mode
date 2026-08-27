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

> **File-creation rules (Rule 19):** also include `target_path` — the absolute path of the new `.java` file to create (e.g. `src/main/java/com/accenture/library/config/WebMvcConfig.java`).

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

---

### 17 — Legacy Servlet to Spring MVC Controller

**Controller type selection — inspect before converting:**

| Condition | Target annotation | Response strategy |
|---|---|---|
| Servlet writes JSON / plain text directly (`getWriter().write(...)`, `setContentType("application/json")`) | `@RestController` | Return domain objects or `ResponseEntity<T>`; remove `getWriter()` calls |
| Servlet forwards to JSP / sets model attributes / returns HTML (`getRequestDispatcher(...).forward(...)`, `request.setAttribute(...)`) | `@Controller` | Return `ModelAndView` or `String` view name; preserve model attributes as `Model` parameters |
| Servlet mixes both rendering and JSON output | `@Controller` + `@ResponseBody` on JSON methods only | Split into separate handler methods if feasible |

**Parameter migration:**

| Old | New | Condition |
|---|---|---|
| `request.getParameter("x")` | `@RequestParam String x` | Always |
| `request.getInputStream()` / body parsing | `@RequestBody MyDto dto` | Only when content type is `application/json` or `application/xml` — do NOT add `@RequestBody` for form submissions or SSR requests |
| `request.getAttribute("x")` / `session.getAttribute("x")` | `@SessionAttribute` / `Model` / `HttpSession` injection | Preserve session semantics |

**Do NOT** replace `HttpServletResponse.getWriter().write(...)` with `ResponseEntity<T>` when the servlet is rendering an HTML view — that write call is the SSR output and must be migrated to a `ModelAndView` return instead.

---

### 18 — Legacy JDBC DAO to Spring Data JPA / JdbcTemplate

| Old Pattern | New Pattern | Notes |
|---|---|---|
| `extends JdbcDaoSupport` | Inject `JdbcTemplate` or use Spring Data `JpaRepository` | Eliminate manual connection management and row mapping loops |
| Manual `PreparedStatement` & `ResultSet` | `jdbcTemplate.query(...)` or Spring Data interfaces | Boilerplate cleanup |

---

### 19 — XML Configuration to Java-Based Spring Boot `@Configuration`

**Source vs. target location — XML files are never edited in-place:**

XML descriptors (`web.xml`, `*-servlet.xml`, `*-context.xml`) live under `src/main/webapp/WEB-INF/` or `src/main/resources/`. Java `@Configuration` replacements must be created as new `.java` files under `src/main/java/<package>/`. The reporter must **never** place a `replacement` snippet inside the XML file's own `current` context; instead, record two separate fields:

- `current` — the XML file path and the relevant XML fragment being superseded.
- `replacement` — a **complete, compilable Java class** with:
  - Explicit `package` statement matching the project's base package (derived from existing source files).
  - All required `import` statements.
  - All `@Bean` methods reconstructed from the XML `<bean>` definitions found in the source file.
  - `target_path` field set to the absolute path where the new `.java` file must be created (e.g., `src/main/java/com/accenture/library/config/WebMvcConfig.java`).

**Mapping table:**

| XML construct | Java equivalent | Target class |
|---|---|---|
| `<context:component-scan base-package="..."/>` | `@SpringBootApplication` (already scans) | `LibraryApplication.java` — no change needed if present |
| `<mvc:annotation-driven/>` | `@EnableWebMvc` on `@Configuration` class — **⚠ Warning:** Spring Boot auto-configures MVC by default; adding `@EnableWebMvc` disables Boot's auto-configuration. Only use it when full manual MVC control is required; otherwise omit it and rely on `WebMvcConfigurer` alone. | `WebMvcConfig.java` |
| `<mvc:resources mapping="..." location="..."/>` | `registry.addResourceHandler(...)` in `WebMvcConfigurer` | `WebMvcConfig.java` |
| `<bean class="...ViewResolver">` | `@Bean InternalResourceViewResolver` | `WebMvcConfig.java` |
| `<servlet>` + `<servlet-mapping>` in `web.xml` | Handled by Spring Boot's embedded container — **delete only**, no Java replacement required |
| `<filter>` / `<listener>` in `web.xml` | `@Bean FilterRegistrationBean` / `@Bean ServletListenerRegistrationBean` | `AppConfig.java` |

**`web.xml` deletion rule:** Mark `web.xml` for deletion (set `effort: High`, `risk: High`). Do NOT generate a Java replacement for `<servlet>` / `<servlet-mapping>` entries — Spring Boot's embedded Tomcat handles dispatch automatically.