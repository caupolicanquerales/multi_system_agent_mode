---
name: command-extractor-npm-rules
description: "Use when file_type is npm. Contains rules for detecting npm/Node.js projects (package.json) and targeted grep_search patterns to extract Node.js version and framework version metadata (React, Angular, Vue, Next.js, NestJS, Express)."
user-invocable: false
---

# npm Extraction Rules

## File Type Detection

If a `package.json` file is found in the project directory → `file_type: "npm"`.

## Metadata Extraction

One `grep_search`, `isRegexp: true`:

```
pattern: "engines"|"react"|"@angular/core"|"vue"|"next"|"@nestjs/core"|"express"|"node"
includePattern: <path to package.json>
```

Extract all relevant version values from the returned lines:

- `"node"` or `"engines"` → `metadata.language.nodeVersion`
- `"react"` → `metadata.frameworks.reactVersion`
- `"@angular/core"` → `metadata.frameworks.angularVersion`
- `"vue"` → `metadata.frameworks.vueVersion`
- `"next"` → `metadata.frameworks.nextVersion`
- `"@nestjs/core"` → `metadata.frameworks.nestjsVersion`
- `"express"` → `metadata.frameworks.expressVersion`

**Never call `read_file` on the full `package.json`.**

## Normalization

- If a version cannot be determined, omit that key.
- Return plain version strings exactly as found (do not transform ranges).
- Include only values confidently found in files.
