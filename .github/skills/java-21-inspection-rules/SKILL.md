---
name: java-21-inspection-rules
description: "Defines all inspection and modernization rules an agent must apply when migrating Java code to Java 21. Covers Records, Sealed Classes, Pattern Matching, Switch Expressions, Text Blocks, and more."
user-invocable: false
---

# Java 21 Modernization Rules

Identify old-Java patterns in source code and replace with idiomatic Java 21 equivalents. Report each finding with: file path, line number, rule number, old code, suggested replacement.

**Priority order:** Records > Pattern Matching > Switch Expressions > Text Blocks > Virtual Threads.

---

## Rules

### 1 — Records

Replace simple immutable data-carrier classes with `record` when: class is `final`, all fields are `private final`, no mutable state, no class inheritance, constructor only assigns fields.

`public final class Point { private final int x; private final int y; ... }` → `public record Point(int x, int y) {}`

---

### 2 — Sealed Classes

Replace open class hierarchies modeling a fixed set of subtypes with `sealed ... permits` when: subclasses are fixed and known, all in the same package/module. Each subclass must be `final`, `sealed`, or `non-sealed`.

`abstract class Shape {}` + open subclasses → `sealed abstract class Shape permits Circle, Rectangle {}`

---

### 3 — Pattern Matching for `instanceof`

Replace `instanceof` + explicit cast with pattern variable.

`if (obj instanceof String) { String s = (String) obj; ... }` → `if (obj instanceof String s) { ... }`

---

### 4 — Pattern Matching for `switch`

Replace chains of `instanceof` branches on the same variable with `switch` pattern matching. With sealed hierarchies, `default` is not needed (exhaustive switch).

```java
return switch (shape) {
    case Circle c    -> Math.PI * c.radius() * c.radius();
    case Rectangle r -> r.width() * r.height();
    default          -> throw new IllegalArgumentException();
};
```

---

### 5 — Switch Expressions

Replace `switch` statements that assign or return a value with arrow-syntax `switch` expressions. Use `yield` for multi-statement blocks.

Multi-case `switch` with `break` → `int n = switch (day) { case MONDAY, FRIDAY -> 6; case TUESDAY -> 7; default -> 8; };`

---

### 6 — Text Blocks

Replace multiline string concatenation or `\n`-escaped strings (SQL, JSON, HTML, XML) with text blocks (`"""`).

`"{\n" + "  \"name\": \"Alice\"\n" + "}"` → `"""\n        {\n          "name": "Alice"\n        }\n        """`

---

### 7 — `var` Local Type Inference

Use `var` for local variables where the type is obvious from the initializer. Do NOT use where it reduces readability (e.g. `var x = getValue()`). Never on fields, parameters, or return types.

`HashMap<String, List<Integer>> map = new HashMap<>()` → `var map = new HashMap<String, List<Integer>>()`

---

### 8 — Guarded Patterns in `switch`

Use `when` guards to combine type checks with conditions inside `switch`.

```java
return switch (obj) {
    case Integer i when i > 0 -> "Positive: " + i;
    case Integer i             -> "Non-positive: " + i;
    case String s              -> "String length: " + s.length();
    default                    -> "Other";
};
```

---

### 9 — Virtual Threads

Replace fixed thread pools used for **I/O-bound** tasks with `Executors.newVirtualThreadPerTaskExecutor()` or `Thread.ofVirtual().start(...)`. Do NOT use for CPU-bound workloads.

`Executors.newFixedThreadPool(100)` → `Executors.newVirtualThreadPerTaskExecutor()`

---

### 10 — Sequenced Collections

Use new `SequencedCollection` methods instead of index/iterator access.

| Old | New |
|---|---|
| `list.get(0)` | `list.getFirst()` |
| `list.get(list.size() - 1)` | `list.getLast()` |
| `list.add(0, x)` | `list.addFirst(x)` |

---

### 11 — String API

| Old | New |
|---|---|
| `s.trim()` | `s.strip()` (Unicode-aware) |
| `s.isEmpty() \|\| s.trim().isEmpty()` | `s.isBlank()` |
| Manual split + loop | `s.lines()` |
| `"x".repeat(n)` workarounds | `s.repeat(n)` |
| Whitespace prefix/suffix check | `s.stripLeading()` / `s.stripTrailing()` |

---

### 12 — NPE Improvements

No code change required. Ensure `-XX:+ShowCodeDetailsInExceptionMessages` is not suppressed (default on in Java 14+).

---

### 13 — Collection Factory Methods

Replace mutable collections followed by `Collections.unmodifiableList/Map/Set` with factory methods when all elements are non-null and collection is never modified.

`new ArrayList<>() + add + unmodifiableList` → `List.of("a", "b")` / `Map.of("a", 1)` / `Set.of("a", "b")`

---

### 14 — `Optional` Best Practices

| Anti-pattern | Replacement |
|---|---|
| `optional.get()` without check | `optional.orElseThrow()` |
| `if (optional.isPresent()) { optional.get() }` | `optional.ifPresent(...)` or `optional.map(...)` |
| `Optional.of(nullable)` | `Optional.ofNullable(value)` |
| Return `null` instead of empty | `Optional.empty()` |
| `Optional` as field type | Only use as return type |

---

### 15 — Stream API

| Old | New |
|---|---|
| `Collectors.toList()` | `Stream.toList()` (unmodifiable, Java 16+) |
| `Collectors.toUnmodifiableList()` | `Stream.toList()` |
| `.findFirst().get()` | `.findFirst().orElseThrow()` |

---

### 16 — Deprecated / Removed APIs

| Removed / Deprecated | Replacement |
|---|---|
| `Thread.stop()`, `.suspend()`, `.resume()` | Interruption or `ExecutorService` |
| `Runtime.exec(String)` | `ProcessBuilder` |
| `SecurityManager` (removed Java 17) | Remove or replace |
| `Applet` (removed Java 17) | Modern alternative |
| `finalize()` override | `Cleaner` API or try-with-resources |
| `javax.activation`, `javax.xml.bind` (removed Java 11) | Jakarta EE deps or alternatives |

---

### 17 — `try-with-resources`

Replace `finally` blocks that close resources with `try-with-resources`.

`InputStream is = null; try { ... } finally { if (is != null) is.close(); }` → `try (var is = new FileInputStream(file)) { ... }`

---

### 18 — Lambdas & Method References

Replace anonymous inner classes implementing functional interfaces with lambdas or method references.

`new Comparator<String>() { public int compare(String a, String b) { return a.compareTo(b); } }` → `String::compareTo`

`new Runnable() { public void run() { ... } }` → `() -> ...`

---

### 19 — Local Static Members in Methods

Static members (classes, interfaces, records, enums) can now be declared inside non-static methods. Use to group related local types.

---

### 20 — Module System (JPMS)

For modular projects:
- `module-info.java` must declare correct `requires`, `exports`, `opens`.
- Replace `sun.*` / `com.sun.*` internal APIs with supported public APIs.
- Eliminate split packages across modules.
- Reflective access to private members requires explicit `opens`.

