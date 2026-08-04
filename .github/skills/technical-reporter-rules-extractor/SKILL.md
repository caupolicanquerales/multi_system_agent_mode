---
name: technical-reporter-rules-extractor
description: "Contains the built-in combined grep index and operational rules for the TechnicalReporter agent. Loaded on demand via JTI pattern."
user-invocable: false
---

# Technical Reporter — Rules & Grep Index

## Built-In Combined Grep Index

### java21 — Java files only

| Pattern | Rules |
|---|---|
| `public final class .*\{[\s\n]*private final` | 1 |
| `\bextends\b` in abstract class context | 2 |
| `instanceof\s+[A-Z]\w+\)\s*\{[\s\n]*[A-Z]\w+\s+\w+\s*=\s*\(` | 3 |
| `instanceof` in `if/else if` chains | 3, 4 |
| `switch.*break` assigning a variable | 5 |
| `\+\s*\n\s*"` or `"""` or `\\n"` multi-line string concat | 6 |
| `new HashMap<\|new ArrayList<\|new LinkedHashMap<` | 7 |
| `newFixedThreadPool\|new Thread(` | 9 |
| `\.get(0)\|\.getFirst()\|\.getLast()` | 10 |
| `\.trim()\|Collectors\.toList()\|Collections\.unmodifiable(List\|Set\|Map)\(` | 11, 13, 15 |
| `Thread\.stop\|SecurityManager\|finalize()` | 16 |
| `} finally` containing `.close()` | 17 |
| `new Comparator\|new Runnable\|new Callable` | 18 |

### springboot3 — Java files

| Pattern | Rules |
|---|---|
| `import javax\.` | 3 |
| `WebSecurityConfigurerAdapter` | 4 |
| `antMatchers\|mvcMatchers` | 4 |
| `authorizeRequests()` | 4 |
| `\.getOne(` | 5 |
| `HttpMethod\.valueOf` | 6 |
| `JobBuilderFactory\|StepBuilderFactory` | 9 |
| `@TypeDef\|@Type\(type` | 12 |
| `GenerationType\.AUTO` | 12 |
| `springfox` | 15 |

### springboot3 — Config and build files (only when springboot3 is active)

| File types | Pattern | Rules |
|---|---|---|
| `pom.xml`, `build.gradle` | `<java\.version>[0-9]\|sourceCompatibility.*[0-9]` | 1 |
| `pom.xml`, `build.gradle` | `spring-boot.*2\.` | 2 |
| `pom.xml`, `build.gradle` | `springfox` | 15 |
| `*.properties`, `*.yml`, `*.yaml` | `spring\.redis\.\|spring\.elasticsearch\.rest\|logging\.file=\|logging\.path=\|datasource\.initialization-mode` | 8 |
| `*.properties`, `*.yml`, `*.yaml` | `allow-circular-references=true` | 14 |

Apply only the grep patterns that correspond to the active skills.

---

## Agent Rules

1. Confirm skill file existence with a 5-line read only — **never load full skill text upfront**.
2. Return failure only if all skill files are unreadable or the project path is inaccessible.
3. On-demand rule extraction: grep skill file for `"### N."` → bounded read `[match_line, match_line + 60]`. Cache per session; never re-read the same rule section.
4. Scan only files in the Step 2 discovered list; never read excluded paths.
5. Read-only — never modify any source, config, or build file.
6. Priority Matrix lists all rules from all active skills; Findings section omits zero-count rules.
7. Snippets: `Current code` = 2–4 lines only; `Replacement` = same count. No prose inside findings.
8. `Line` field = single start line (not a range) — required by the Executer for bounded reads.
9. Track batch progress with `manage_todo_list`.
