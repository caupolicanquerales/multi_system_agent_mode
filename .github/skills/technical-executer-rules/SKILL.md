---
name: technical-executer-rules
description: "Contains the Built-In Rule→Skill Index and the Agent Rules for the TechnicalExecuter agent. Loaded on demand via JTI pattern."
user-invocable: false
---

# Technical Executer — Rules & Rule→Skill Index

## Built-In Rule→Skill Index

> The plan's `Skill` column (or section heading `[Skill: ...]`) identifies whether a finding is from `java21` or `springboot3`. Map accordingly.

### java21-inspection-rules rules

| Rule # | Name |
|---|---|
| 1 | Records |
| 2 | Sealed Classes |
| 3 | Pattern Matching instanceof |
| 4 | Pattern Matching switch |
| 5 | Switch Expressions |
| 6 | Text Blocks |
| 7 | var |
| 8 | Guarded Patterns in switch |
| 9 | Virtual Threads |
| 10 | Sequenced Collections |
| 11 | String Enhancements |
| 12 | NullPointerException Improvements |
| 13 | Collection Factory Methods |
| 14 | Optional Best Practices |
| 15 | Stream API Best Practices |
| 16 | Deprecated API Removal |
| 17 | try-with-resources |
| 18 | Functional Interfaces & Lambdas |
| 19 | Local Classes and Interfaces |
| 20 | Module System Compliance |

### springboot3-inspection-rules rules

| Rule # | Name |
|---|---|
| SB1 | Java Version Requirement |
| SB2 | Spring Boot Parent / Dependency Version |
| SB3 | javax→jakarta Namespace |
| SB4 | Spring Security — Deprecated API Removals |
| SB5 | Spring Data |
| SB6 | Spring MVC |
| SB7 | Actuator |
| SB8 | Configuration Properties — Renamed Keys |
| SB9 | Spring Batch |
| SB10 | Spring Cloud Version Alignment |
| SB11 | Deprecated Spring Framework 5 APIs |
| SB12 | Hibernate 6 |
| SB13 | Micrometer / Metrics |
| SB14 | Circular Dependency Detection |
| SB15 | Third-Party Library Compatibility |
| SB16 | Test Configuration |
| SB17 | Gradle Build Script Updates |
| SB18 | Auto-configuration Registration |

---

## Agent Rules

1. Confirm skill file existence with a 5-line read only — **never load full skill content upfront**.
2. On-demand rule extraction: grep skill file for `"### N."` → `read_file [match_line, match_line + 60]`. Cache per session; never re-read the same rule section.
3. Only apply changes listed in the plan — never invent findings.
4. Confirm exact text match in the target file before each `replace_string_in_file` call.
5. One finding per `replace_string_in_file` call — never batch.
6. Never delete, truncate, or fully rewrite files — targeted replacements only.
7. Skip gracefully if a finding's code is not found; do not abort.
8. Revert and mark `failed` on structural breakage; continue to the next finding.
9. Paths: forward slashes only, exact casing from the report, match target file's line endings for `oldString`.
10. Use `manage_todo_list` throughout; always return the JSON summary.
