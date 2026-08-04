---
name: technical-report
description: "Contains the Combined Grep Pass and On-Demand Rule Retrieval procedures for the TechnicalReporter agent. Loaded on demand via JTI pattern."
user-invocable: false
---

# Technical Report — Grep Pass & Rule Retrieval

## Step 3 — Combined Grep Pass

Using only the grep patterns from the **Built-In Combined Grep Index** below that correspond to `active_skills`, run `grep_search` across the discovered file list.

- Run **one `grep_search` call per pattern row** in the index.
- Build a single `file → [(skill, rule[])]` hit map from all results.
- Files absent from the hit map are compliant — **do not read them**.
- Do **not** read file content during this step.

### Built-In Combined Grep Index

#### java21 — Java files only

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

#### springboot3 — Java files

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

#### springboot3 — Config and build files (only when springboot3 is active)

| File types | Pattern | Rules |
|---|---|---|
| `pom.xml`, `build.gradle` | `<java\.version>[0-9]\|sourceCompatibility.*[0-9]` | 1 |
| `pom.xml`, `build.gradle` | `spring-boot.*2\.` | 2 |
| `pom.xml`, `build.gradle` | `springfox` | 15 |
| `*.properties`, `*.yml`, `*.yaml` | `spring\.redis\.\|spring\.elasticsearch\.rest\|logging\.file=\|logging\.path=\|datasource\.initialization-mode` | 8 |
| `*.properties`, `*.yml`, `*.yaml` | `allow-circular-references=true` | 14 |

Apply only the patterns that correspond to `active_skills`.

## Step 4 — On-Demand Rule Retrieval

When a finding is confirmed for rule N in skill S:

1. **Check cache first.** If rule N of skill S was already extracted this session, use the cached text — never re-read.
2. **If not cached:** `grep_search` the skill file for `"### N."` to get its line number, then `read_file [match_line, match_line + 60]`. Store result in session cache.
3. **Validate** the finding against the rule's `Before` pattern from the extracted snippet.
4. **Record:** file path, start line, rule ID, current code (2–4 lines), suggested replacement (same line count), Effort (Low/Med/High), Risk (Low/Med/High).
5. Collapse more than 5 identical findings of the same rule in one file: `"Pattern repeated N times. Showing first occurrence."`.

**Chain-of-thought per file:** `"[skill] Rule N: line X — found/not found"`. No verbose narration.
