---
name: java-21-inspection-rules
description: "Defines all inspection and modernization rules an agent must apply when migrating Java code to Java 21. Covers Records, Sealed Classes, Pattern Matching, Switch Expressions, Text Blocks, and more."
user-invocable: false
---

# Skill: Java 21 Code Inspection & Modernization Guidelines

## Purpose

This skill defines all the rules an agent must apply when inspecting and migrating Java code to Java 21. When analyzing source code, the agent must identify patterns from older Java versions and replace them with idiomatic Java 21 equivalents.

---

## Rule Categories

---

### 1. Records (JEP 395 — Final in Java 16+)

**Rule:** Replace simple data-carrier classes (immutable POJOs with only fields, constructor, getters, `equals`, `hashCode`, `toString`) with `record`.

**Before:**
```java
public final class Point {
    private final int x;
    private final int y;

    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public int getX() { return x; }
    public int getY() { return y; }

    @Override
    public boolean equals(Object o) { ... }

    @Override
    public int hashCode() { ... }

    @Override
    public String toString() { ... }
}
```

**After:**
```java
public record Point(int x, int y) {}
```

**Conditions for applying:**
- Class is `final`.
- All fields are `private final`.
- No mutable state.
- No class inheritance (records cannot extend classes).
- Constructor only assigns fields.

---

### 2. Sealed Classes and Interfaces (JEP 409 — Final in Java 17+)

**Rule:** Replace unconstrained class hierarchies that model a closed set of subtypes with `sealed` classes/interfaces and `permits`.

**Before:**
```java
public abstract class Shape {}
public class Circle extends Shape { ... }
public class Rectangle extends Shape { ... }
```

**After:**
```java
public sealed abstract class Shape permits Circle, Rectangle {}
public final class Circle extends Shape { ... }
public final class Rectangle extends Shape { ... }
```

**Conditions for applying:**
- The set of subclasses is known and fixed.
- Subclasses are in the same package or module.
- Subclasses must be `final`, `sealed`, or `non-sealed`.

---

### 3. Pattern Matching for `instanceof` (JEP 394 — Final in Java 16+)

**Rule:** Remove explicit casts after `instanceof` checks by using pattern variables.

**Before:**
```java
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.length());
}
```

**After:**
```java
if (obj instanceof String s) {
    System.out.println(s.length());
}
```

**Conditions for applying:**
- Anywhere an `instanceof` check is immediately followed by a cast.

---

### 4. Pattern Matching for `switch` (JEP 441 — Final in Java 21)

**Rule:** Replace chains of `instanceof` checks or type-switch workarounds with `switch` pattern matching.

**Before:**
```java
if (shape instanceof Circle c) {
    return Math.PI * c.radius() * c.radius();
} else if (shape instanceof Rectangle r) {
    return r.width() * r.height();
} else {
    throw new IllegalArgumentException("Unknown shape");
}
```

**After:**
```java
return switch (shape) {
    case Circle c    -> Math.PI * c.radius() * c.radius();
    case Rectangle r -> r.width() * r.height();
    default          -> throw new IllegalArgumentException("Unknown shape");
};
```

**Conditions for applying:**
- Multiple `instanceof` branches on the same variable.
- Type-based dispatch logic.
- Works with sealed hierarchies to enable exhaustive switches (no `default` needed).

---

### 5. Switch Expressions (JEP 361 — Final in Java 14+)

**Rule:** Replace `switch` statements that assign or return a value with `switch` expressions using arrow syntax.

**Before:**
```java
int numLetters;
switch (day) {
    case MONDAY:
    case FRIDAY:
    case SUNDAY:
        numLetters = 6;
        break;
    case TUESDAY:
        numLetters = 7;
        break;
    default:
        numLetters = 8;
}
```

**After:**
```java
int numLetters = switch (day) {
    case MONDAY, FRIDAY, SUNDAY -> 6;
    case TUESDAY                -> 7;
    default                     -> 8;
};
```

**Conditions for applying:**
- `switch` statement assigns the same variable in every branch.
- `switch` statement returns in every branch.
- Replace `break` with `->` arrow cases or `yield` for multi-statement blocks.

---

### 6. Text Blocks (JEP 378 — Final in Java 15+)

**Rule:** Replace multiline string concatenation or strings with `\n` escapes with text blocks.

**Before:**
```java
String json = "{\n" +
              "  \"name\": \"Alice\",\n" +
              "  \"age\": 30\n" +
              "}";
```

**After:**
```java
String json = """
        {
          "name": "Alice",
          "age": 30
        }
        """;
```

**Conditions for applying:**
- String contains newlines (`\n`) or is built via concatenation for multiline content.
- Common in SQL queries, JSON, HTML, and XML strings.

---

### 7. `var` Local Variable Type Inference (JEP 286 — Final in Java 10+)

**Rule:** Use `var` for local variable declarations where the type is obvious from the right-hand side.

**Before:**
```java
HashMap<String, List<Integer>> map = new HashMap<String, List<Integer>>();
BufferedReader reader = new BufferedReader(new FileReader(path));
```

**After:**
```java
var map = new HashMap<String, List<Integer>>();
var reader = new BufferedReader(new FileReader(path));
```

**Conditions for applying:**
- Local variable only (not fields, parameters, or return types).
- Type is clearly inferrable and readable from the initializer.
- Do NOT use `var` when it reduces readability (e.g., `var x = getValue();` where type is unclear).

---

### 8. Guarded Patterns in `switch` (JEP 441 — Final in Java 21)

**Rule:** Use guarded patterns in `switch` to combine type checks with conditions.

**After:**
```java
return switch (obj) {
    case Integer i when i > 0 -> "Positive integer: " + i;
    case Integer i             -> "Non-positive integer: " + i;
    case String s              -> "String of length: " + s.length();
    default                    -> "Other";
};
```

---

### 9. Virtual Threads / Structured Concurrency (JEP 444 — Final in Java 21)

**Rule:** Replace manual thread pool management and `Thread` creation for I/O-bound tasks with virtual threads.

**Before:**
```java
ExecutorService executor = Executors.newFixedThreadPool(100);
executor.submit(() -> handleRequest(request));
```

**After:**
```java
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
executor.submit(() -> handleRequest(request));
```

Or for single threads:
```java
Thread.ofVirtual().start(() -> handleRequest(request));
```

**Conditions for applying:**
- Thread pools used for I/O-bound tasks (HTTP calls, DB queries, file I/O).
- High concurrency scenarios where thread count is a bottleneck.
- Do NOT replace CPU-bound thread pools with virtual threads.

---

### 10. Sequenced Collections (JEP 431 — Final in Java 21)

**Rule:** Use `SequencedCollection`, `SequencedSet`, and `SequencedMap` interfaces and their new methods (`getFirst()`, `getLast()`, `reversed()`) instead of manual index or iterator-based access.

**Before:**
```java
List<String> list = new ArrayList<>(List.of("a", "b", "c"));
String first = list.get(0);
String last = list.get(list.size() - 1);
list.add(0, "z");
```

**After:**
```java
List<String> list = new ArrayList<>(List.of("a", "b", "c"));
String first = list.getFirst();
String last  = list.getLast();
list.addFirst("z");
```

---

### 11. String Enhancements (Java 11–21)

**Rule:** Use modern `String` API methods.

| Old pattern | Modern replacement |
|---|---|
| `s.trim()` | `s.strip()` (Unicode-aware) |
| `s.isEmpty() \|\| s.trim().isEmpty()` | `s.isBlank()` |
| Manual split + loop | `s.lines()` |
| `String.valueOf(c).repeat(n)` | `s.repeat(n)` |
| `s.startsWith(" ")` whitespace check | `s.stripLeading()` / `s.stripTrailing()` |

---

### 12. `NullPointerException` Improvements (Java 14+)

**Rule:** No code change required, but ensure code compiles with `-XX:+ShowCodeDetailsInExceptionMessages` (default on in Java 14+). Avoid suppressing NPE messages.

---

### 13. Collection Factory Methods (Java 9+)

**Rule:** Replace manually constructed immutable collections with factory methods.

**Before:**
```java
List<String> list = new ArrayList<>();
list.add("a");
list.add("b");
List<String> immutable = Collections.unmodifiableList(list);

Map<String, Integer> map = new HashMap<>();
map.put("a", 1);
map.put("b", 2);
Map<String, Integer> immutableMap = Collections.unmodifiableMap(map);
```

**After:**
```java
List<String> list = List.of("a", "b");
Map<String, Integer> map = Map.of("a", 1, "b", 2);
Set<String> set = Set.of("a", "b");
```

**Conditions for applying:**
- Collection is immutable (no modifications after creation).
- Elements are non-null.

---

### 14. `Optional` Best Practices (Java 8–21)

**Rule:** Avoid anti-patterns with `Optional`.

| Anti-pattern | Correct usage |
|---|---|
| `optional.get()` without check | `optional.orElseThrow()` |
| `if (optional.isPresent()) { ... optional.get() }` | `optional.ifPresent(...)` or `optional.map(...)` |
| `Optional.of(value)` on nullable | `Optional.ofNullable(value)` |
| Returning `null` instead of `Optional.empty()` | Always return `Optional.empty()` |
| Using `Optional` as a field type | Only use `Optional` as a return type |

---

### 15. Stream API Best Practices (Java 8–21)

**Rule:** Modernize Stream usage with newer collectors and methods.

| Old pattern | Modern replacement |
|---|---|
| `Collectors.toList()` | `Stream.toList()` (Java 16+, unmodifiable) |
| `Collectors.toUnmodifiableList()` | `Stream.toList()` |
| `stream.filter(...).findFirst().get()` | `stream.filter(...).findFirst().orElseThrow()` |
| Manual for-loop to build a list | `stream.map(...).toList()` |
| `stream.collect(Collectors.joining(","))` | Keep as-is (still idiomatic) |

---

### 16. Deprecated API Removal (Java 9–21)

**Rule:** Replace usages of removed or deprecated APIs.

| Deprecated/Removed | Replacement |
|---|---|
| `Thread.stop()`, `Thread.suspend()`, `Thread.resume()` | Use interruption or `ExecutorService` |
| `Runtime.exec(String)` (deprecated) | `ProcessBuilder` |
| `SecurityManager` (removed in Java 17) | Remove or replace with alternatives |
| `Applet` (removed in Java 17) | Replace with modern alternatives |
| `finalize()` override | Use `Cleaner` API or try-with-resources |
| `javax.activation`, `javax.xml.bind` (removed in Java 11) | Add Jakarta EE dependencies or use alternatives |

---

### 17. `try-with-resources` (Java 7+)

**Rule:** Replace manual `finally` blocks for closing resources with `try-with-resources`.

**Before:**
```java
InputStream is = null;
try {
    is = new FileInputStream(file);
    // use is
} finally {
    if (is != null) is.close();
}
```

**After:**
```java
try (var is = new FileInputStream(file)) {
    // use is
}
```

---

### 18. Functional Interfaces & Lambdas (Java 8+)

**Rule:** Replace anonymous inner classes implementing functional interfaces with lambdas or method references.

**Before:**
```java
list.sort(new Comparator<String>() {
    @Override
    public int compare(String a, String b) {
        return a.compareTo(b);
    }
});

Runnable r = new Runnable() {
    @Override
    public void run() { System.out.println("Hello"); }
};
```

**After:**
```java
list.sort(String::compareTo);

Runnable r = () -> System.out.println("Hello");
```

---

### 19. Local Classes and Interfaces in Methods (Java 16+)

**Rule:** Static members (classes, interfaces, records, enums) can now be declared inside non-static methods. Use this to group related local types.

---

### 20. Module System Compliance (JPMS — Java 9+)

**Rule:** When migrating to modular projects, ensure:
- `module-info.java` is present with correct `requires`, `exports`, and `opens` declarations.
- Reflective access to private members uses explicit `opens` in the module descriptor.
- Split packages across modules are eliminated.
- Internal JDK APIs (`sun.*`, `com.sun.*`) are replaced with supported public APIs.

---

## Agent Behavior Guidelines

When analyzing code:

1. **Identify** all patterns listed above in the source code.
2. **Prioritize** changes by impact: Records > Pattern Matching > Switch Expressions > Text Blocks > Virtual Threads.
3. **Report** each finding with:
   - File and line number.
   - Rule violated.
   - Suggested replacement code.
4. **Do not** apply changes that break existing behavior or require runtime changes not covered by the rules.
5. **Do not** apply `var` where the inferred type reduces readability.
6. **Do not** convert a class to `record` if it has mutable fields, extends another class, or has non-trivial constructor logic.
7. **Validate** that the migrated code compiles with `--release 21`.
8. **Check** for deprecated API usages with `-Xlint:deprecation` flag guidance.
9. When a sealed class is introduced, **ensure** all subclasses are updated with `final`, `sealed`, or `non-sealed` modifiers.
10. For virtual threads, **only** suggest migration for I/O-bound workloads.
