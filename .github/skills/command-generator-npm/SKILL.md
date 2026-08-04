---
name: command-generator-npm
description: "Use when file_type is npm. Contains npm command mapping table and normalization rules."
user-invocable: false
---

# npm Command Rules

## Command Mapping Table

| command | terminal command |
|---|---|
| build | `npm run build` |
| test | `npm test` |
| run | `npm start` |
| install | `npm install` |
| clean | `npm run clean` |

## Normalization Rules

Apply for commands not in the mapping table above:

- For matching only, trim whitespace and lowercase a copy of `command`.
- If `command` already starts with `npm`, `npx`, or `pnpm`, keep it unchanged.
- If `command` is not in the mapping table, use the raw command as-is.
- Only set `terminal_command` to `null` when `file_type` is `unknown` or null.
