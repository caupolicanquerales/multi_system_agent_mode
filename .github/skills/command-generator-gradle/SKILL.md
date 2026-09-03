---
name: command-generator-gradle
description: "Use when file_type is gradle and command is NOT apply openReWrite. Contains Gradle path resolution (wrapper detection), command mapping table, and noise-suppression normalization rules."
user-invocable: false
---

# Gradle Command Rules

## Path Resolution

| OS | `<gradle>` |
|---|---|
| Windows | `& "<project_location>\gradlew.bat"` *(full absolute path — no `cd`, `Set-Location`, or bare `gradlew`)* |
| Linux/macOS | `cd <project_location> && ./gradlew` |

## Command Mapping Table

| command | terminal command |
|---|---|
| build | `<gradle> clean build -x test --quiet` |
| test | `<gradle> test --quiet` |
| run | `<gradle> bootRun` |
| package | `<gradle> build --quiet` |
| install | `<gradle> build --quiet` |
| clean | `<gradle> clean --quiet` |

## Normalization Rules

For unmapped commands:

- For matching only, trim whitespace and lowercase a copy of `command`.
- If `os` is `linux` or `mac` and `command` already starts with `./gradlew` or `gradle`, keep it unchanged.
- Always append `--quiet` to every Gradle command except `bootRun`.
