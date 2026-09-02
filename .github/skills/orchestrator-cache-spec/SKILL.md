---
name: orchestrator-cache-spec
description: "Lean shared spec for the Orchestrator's in-turn project_context session cache: structure, validity rules, implicit project inference, and cache bypass condition. Referenced by Command Flow, Refactoring Flow, and Modernization Flow — load only when a flow needs to resolve or bypass the cache."
---

## Session Context Cache

The Orchestrator maintains an in-turn variable `project_context` (a map keyed by `project_name`). Each entry stores the full CommandExtractor JSON for that project so that sequential commands/flows on the same project skip re-extraction.

**Cache structure (per entry):**
```
project_context[<project_name>] = {
  command,            ← overwritten per request; all other fields are cached
  project_name,
  project_location,
  file_type,
  os,
  hasMavenWrapper,
  pwsh_available,     ← Windows only; cached from Command Flow Step 1b
  metadata            ← flat object of all version fields
}
```

**Cache validity rules:**
- An entry is valid for the duration of the current conversation turn sequence.
- Invalidate (delete) the entry for `<project_name>` if: the user mentions a dependency change, a `pom.xml`/`build.gradle`/`package.json` edit, or explicitly asks to re-scan the project.
- Never share cache entries across different `project_name` values.
- **Location disambiguation:** `project_name` is the primary lookup key. `project_location` is stored inside each entry and used only when two entries would share the same `project_name` (ambiguous workspace). In that case, append `"|" + project_location` to form a unique key for the colliding entries — but only after the collision is detected, not preemptively. If `project_name` is missing or blank in CommandExtractor's response, fall back to keying by `project_location` alone.

**Implicit project inference (no project name in follow-up):**
- Maintain a `last_active_project` variable (the `project_name` most recently resolved by any flow).
- When the user's message contains an intent but no identifiable `project_name` (e.g. *"now compile it"*, *"run tests"*, *"generate the modernization report"*), substitute `last_active_project` as the target before evaluating the bypass condition.
- If `last_active_project` is unset (first request in the session), resolve via CommandExtractor as normal — it will extract the project name from the workspace context.

**Cache bypass condition — skip re-resolution when ALL of the following are true:**
1. An entry keyed by `project_name` (or `project_location` if `project_name` was blank) exists in `project_context` and is valid.
2. The user's new request targets the same project (resolved via explicit name, `last_active_project`, or unique location match).
3. Only a flow-specific field changes (e.g. `command` for Command Flow); no metadata fields are expected to differ.

When the bypass fires: update the cached entry's changed field and reuse the rest of the entry as-is — do not re-call CommandExtractor.

---

> **Consumers:** [orchestrator-command-flow](.github/skills/orchestrator-command-flow/SKILL.md) (Step 1/1b + bypass), [orchestrator-refactoring-flow](.github/skills/orchestrator-refactoring-flow/SKILL.md) (Step 5 cache resolution), [orchestrator-modernization-flow](.github/skills/orchestrator-modernization-flow/SKILL.md) (Step 1 cache resolution).
