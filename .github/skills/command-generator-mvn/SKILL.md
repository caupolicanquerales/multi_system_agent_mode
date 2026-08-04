---
name: command-generator-mvn
description: "Use when file_type is maven and command is NOT apply openReWrite. Contains Maven path resolution (wrapper detection), command mapping table, and noise-suppression normalization rules."
user-invocable: false
---

# Maven Command Rules

## Path Resolution

Resolve `<mvn>` and `<prefix>` once from this table.

| OS | `hasMavenWrapper` | `<prefix>` | `<mvn>` |
|---|---|---|---|
| Windows | true | *(none)* | `& "<project_location>\mvnw.cmd"` |
| Windows | false | `cd <project_location> &&` | `mvn` |
| Linux/macOS | true | `cd <project_location> &&` | `./mvnw` |
| Linux/macOS | false | `cd <project_location> &&` | `mvn` |

> Windows wrapper: use the full absolute path with the PowerShell `&` call operator — never `cd` + bare `mvnw.cmd`.

## Command Mapping Table

| command | terminal command |
|---|---|
| build | `<prefix> <mvn> clean package -DskipTests -B --no-transfer-progress` |
| test | `<prefix> <mvn> test -B --no-transfer-progress` |
| run | `<prefix> <mvn> spring-boot:run -B --no-transfer-progress` |
| package | `<prefix> <mvn> package -B --no-transfer-progress` |
| install | `<prefix> <mvn> clean install -DskipTests -B --no-transfer-progress` |
| clean | `<prefix> <mvn> clean -B --no-transfer-progress` |

## Normalization Rules

Apply for commands not in the mapping table above:

- For matching only, trim whitespace and lowercase a copy of `command`.
- If `command` contains Maven goals (e.g., `clean install`, `verify`, `clean package -DskipTests`) but does not already start with a Maven executable token (`mvn`, `./mvnw`, `mvnw.cmd`), prepend `<prefix> <mvn>`. If the result lacks a test skip flag (`test`, `-DskipTests`, `-Dmaven.test.skip`), append `-DskipTests`.
- If `command` already starts with `mvn` or `./mvnw`, keep it unchanged but still apply wrapper substitution on Windows.
- Always append `-B --no-transfer-progress` unless already present.
