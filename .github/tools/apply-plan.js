#!/usr/bin/env node
/**
 * apply-plan.js
 * Off-Thread Plan Applier for TechnicalExecuter.
 *
 * Reads the MIGRATION_PLAN.md produced by build-report.js and applies every
 * current → replacement substitution directly to the project source files.
 *
 * Usage:
 *   node .github/tools/apply-plan.js \
 *     --input="MIGRATION_PLAN.md" \
 *     --projectPath="/absolute/path/to/project"
 *
 * Exit codes:
 *   0  All substitutions attempted (see JSON result for per-finding status)
 *   1  Fatal error (missing --input, unreadable file, parse error)
 *
 * Output (stdout): JSON summary object
 * {
 *   "status":           "success" | "partial" | "failed",
 *   "project_name":     string,
 *   "total_findings":   number,
 *   "applied":          number,
 *   "skipped":          number,
 *   "failed":           number,
 *   "changed_files":    string[],
 *   "cascade_warnings": string[]
 * }
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      const key = arg.slice(2, eq);
      const raw = arg.slice(eq + 1).trim();
      // Strip surrounding single or double quotes added by some shells/CLIs
      args[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// 2. MIGRATION_PLAN.md parser
//
// Sections produced by build-report.js that this parser consumes:
//
//   **Project:** MyApp | **Date:** ...
//   ### [Skill: Spring Boot 3 Migration]   (or Java 21 Modernization)
//   #### Rule N — optional name
//   ##### Finding N.M
//   - **File:** `rel/path.java` | **Line:** 42 | **Effort:** Med | **Risk:** Med
//   - **Current:**
//   ```java
//   old code
//   ```
//   - **Replacement:**
//   ```java
//   new code
//   ```
// ---------------------------------------------------------------------------
function parseMigrationPlan(markdown) {
  const SKILL_LABEL = {
    'spring boot 3 migration': 'springboot3',
    'java 21 modernization':   'java21',
  };

  const lines     = markdown.split(/\r?\n/);
  const findings  = [];
  let projectName = 'Project';

  let currentSkill    = null;
  let currentRule     = null;
  let currentRuleName = '';
  let currentFinding  = null;   // finding object being built
  let collectMode     = null;   // 'current' | 'replacement' | null
  let codeLines       = [];
  let insideFence     = false;

  const flushCode = () => {
    if (!currentFinding || collectMode === null) return;
    currentFinding[collectMode] = codeLines.join('\n');
    codeLines   = [];
    collectMode = null;
    insideFence = false;
  };

  const commitFinding = () => {
    if (currentFinding) {
      flushCode();
      findings.push(currentFinding);
      currentFinding = null;
    }
  };

  for (const line of lines) {
    // --- Project name from header line ---
    // **Project:** MyApp | **Date:** ...
    const projMatch = line.match(/\*\*Project:\*\*\s*([^|]+)/);
    if (projMatch) {
      projectName = projMatch[1].trim();
      continue;
    }

    // --- Inside a fenced code block ---
    if (insideFence) {
      if (line.trimEnd() === '```') {
        flushCode();
        continue;  // Fix #3: must not fall through into heading/meta matchers
      }
      codeLines.push(line);
      continue;
    }

    // --- Skill heading: ### [Skill: Spring Boot 3 Migration] ---
    const skillMatch = line.match(/^###\s+\[Skill:\s*(.+?)\]/i);
    if (skillMatch) {
      commitFinding();
      const label  = skillMatch[1].trim().toLowerCase();
      currentSkill    = SKILL_LABEL[label] || label;
      currentRule     = null;
      currentRuleName = '';
      continue;
    }

    // --- Rule heading: #### Rule 3 — Optional Name ---
    const ruleMatch = line.match(/^####\s+Rule\s+(\d+)(?:\s+[—\-–]\s*(.+))?/);
    if (ruleMatch) {
      commitFinding();
      currentRule     = parseInt(ruleMatch[1], 10);
      currentRuleName = (ruleMatch[2] || '').trim();
      continue;
    }

    // --- Finding heading: ##### Finding 3.1 ---
    if (/^#####\s+Finding\s+[\d.]+/.test(line)) {
      commitFinding();
      currentFinding = {
        skill:       currentSkill,
        rule:        currentRule,
        rule_name:   currentRuleName,
        file:        null,
        line:        0,
        effort:      'Med',
        risk:        'Med',
        current:     '',
        replacement: '',
      };
      continue;
    }

    if (!currentFinding) continue;

    // --- Meta line: - **File:** `path` | **Line:** N | **Effort:** X | **Risk:** Y ---
    if (line.startsWith('- **File:**')) {
      const fileMatch   = line.match(/\*\*File:\*\*\s*`([^`]+)`/);
      const lineNumMatch = line.match(/\*\*Line:\*\*\s*(\d+)/);
      const effortMatch = line.match(/\*\*Effort:\*\*\s*(\w+)/);
      const riskMatch   = line.match(/\*\*Risk:\*\*\s*(\w+)/);
      if (fileMatch)    currentFinding.file   = fileMatch[1];
      if (lineNumMatch) currentFinding.line   = parseInt(lineNumMatch[1], 10);
      if (effortMatch)  currentFinding.effort = effortMatch[1];
      if (riskMatch)    currentFinding.risk   = riskMatch[1];
      continue;
    }

    // --- Current / Replacement labels (fenced block follows on the next line) ---
    if (line.startsWith('- **Current:**')) {
      collectMode = 'current';
      codeLines   = [];
      continue;
    }
    if (line.startsWith('- **Replacement:**')) {
      collectMode = 'replacement';
      codeLines   = [];
      continue;
    }

    // --- Opening fence: ```java or ``` ---
    if (/^```/.test(line) && collectMode !== null) {
      insideFence = true;
      continue;
    }
  }

  commitFinding();
  return { projectName, findings };
}

// ---------------------------------------------------------------------------
// 3. Helpers for snippet matching
// ---------------------------------------------------------------------------

// Keeps the file's original line-ending style (CRLF or LF).
function makeNormalizer(fileContent) {
  const isCRLF = fileContent.includes('\r\n');
  return (str) =>
    isCRLF
      ? str.replace(/\r?\n/g, '\r\n')
      : str.replace(/\r\n/g, '\n');
}

// Fix #4: trim only leading/trailing blank lines — preserve internal indentation.
function trimEmptyLines(str) {
  return str.replace(/^([ \t]*\n)+/, '').replace(/(\n[ \t]*)+$/, '');
}

// Fix #1: returns true when a snippet looks like a plain-English description
// rather than real Java code (single-line, no Java syntax characters).
// Returns true when a line contains recognisable Java code syntax.
function looksLikeJavaCode(line) {
  const s = line.trim();
  if (!s) return false;
  if (/[;{}()=@<>]/.test(s)) return true;
  if (/^(public|private|protected|class|interface|enum|import|package|throws|return|new\s|final\s|static\s)/.test(s)) return true;
  if (/^\s*(\/\/|\/\*|\*)/.test(s)) return true;
  return false;
}

// Returns true when the FIRST (topic) line of a snippet looks like a plain-English description.
function isDescriptiveFirstLine(line) {
  const s = line.trim();
  if (!s || looksLikeJavaCode(s)) return false;
  // Must start with an uppercase word (topic sentence)
  if (!/^[A-Z][a-z]/.test(s)) return false;
  // Must contain at least one English connector/verb — guards against e.g. "MyClass Foo"
  return /\b(with|using|that|from|into|and|or|is|are|was|has|have|in|on|of|to|for|the|a|an|via|by|built|declared|defined|replaced|converted|updated|removed|added|across|lines?|instead|when|where|all|each|any)\b/i.test(s);
}

// Returns true when ALL lines of a snippet are descriptive text, not Java code.
// Strategy: first line must pass the "topic sentence" test; every subsequent
// non-blank line must simply not look like Java (allows lowercase continuation
// phrases like "across lines 23-25").
function isDescriptiveSnippet(code) {
  const s = code.trim();
  if (!s) return false;
  const contentLines = s.split('\n').filter(l => l.trim() !== '');
  if (contentLines.length === 0) return false;
  // First line must read as an English description
  if (!isDescriptiveFirstLine(contentLines[0])) return false;
  // Remaining lines must not contain Java syntax
  for (let i = 1; i < contentLines.length; i++) {
    if (looksLikeJavaCode(contentLines[i])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Stage 3: Line-Anchored Window Match
//
// Searches for targetOld as an exact substring within a ±windowSize-line
// window centred on hintLine. Useful when duplicate snippets exist elsewhere
// in the file — the line anchor biases the search toward the correct occurrence.
// Returns updated content or null.
// ---------------------------------------------------------------------------
function tryLineAnchoredReplace(content, targetOld, targetNew, hintLine, windowSize = 30) {
  if (!hintLine || hintLine <= 0) return null;

  // Bug2 fix: index on '\n' positions correctly regardless of CRLF.
  // charStart is always the start of a line (char after the preceding '\n'),
  // and charEnd extends to include the full last line of the window, so a
  // '\r\n' sequence at a boundary is never split mid-pair.
  const nlPos = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') nlPos.push(i);
  }
  const totalLines = nlPos.length + 1;

  const hintIdx  = Math.min(Math.max(hintLine - 1, 0), totalLines - 1); // 0-based
  const startIdx = Math.max(0, hintIdx - windowSize);
  const endIdx   = Math.min(totalLines - 1, hintIdx + windowSize);

  // charStart: first char of startIdx line.  If startIdx > 0, skip past the
  // '\n' at nlPos[startIdx-1]; also skip a preceding '\r' if present (CRLF).
  let charStart;
  if (startIdx === 0) {
    charStart = 0;
  } else {
    charStart = nlPos[startIdx - 1] + 1;
    // If the char just before charStart is '\r' it belongs to the previous
    // line's CRLF — charStart is already past it, so no adjustment needed.
  }

  // charEnd: position just past the last char of the endIdx line.
  // Use the '\n' that terminates that line (nlPos[endIdx]); if the line ends
  // with CRLF we include the '\r' by taking up-to-and-including the '\n'.
  const charEnd = endIdx < nlPos.length ? nlPos[endIdx] + 1 : content.length;

  const window = content.slice(charStart, charEnd);
  if (!window.includes(targetOld)) return null;

  const newWindow = window.replace(targetOld, targetNew);
  return content.slice(0, charStart) + newWindow + content.slice(charEnd);
}

// ---------------------------------------------------------------------------
// Stage 4: Fuzzy Token-Level Match
//
// Tokenises both the pattern and the file content into Java-meaningful tokens,
// discarding all whitespace. Slides over the content token array looking for a
// sequence that exactly matches the pattern token sequence. When found, replaces
// the spanned character range with targetNew.
//
// More robust than a whitespace-regex approach: handles indentation drift,
// tab-vs-space differences, and minor formatting changes without building a
// fragile regex from user-controlled code.
// Returns updated content or null.
// ---------------------------------------------------------------------------
function tryFuzzyTokenReplace(content, targetOld, targetNew) {
  // Bug1 fix: TOKEN_RE must NOT be a shared closure-level variable.
  // A global regex carries lastIndex state; reusing it across the two
  // extractTokens() calls (targetOld then content) would start the second
  // scan mid-string.  Create a fresh RegExp per extractTokens() call instead.
  function makeTokenRe() {
    return /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-zA-Z_$][\w$]*|0x[0-9a-fA-F]+|[0-9]+(?:\.[0-9]+)?[fFdDlLuU]*|[+\-*/%&|^~<>!=?:;,.()\[\]{}@]+/g;
  }

  function extractTokens(src) {
    const tokens = [];
    const re = makeTokenRe();
    let m;
    while ((m = re.exec(src)) !== null) {
      tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
  }

  // patternTokens: offsets inside targetOld — used only for .text comparison.
  // contentTokens: offsets inside content   — used for the final splice.
  const patternTokens = extractTokens(targetOld);
  if (patternTokens.length === 0) return null;

  const contentTokens = extractTokens(content);
  const patLen        = patternTokens.length;

  for (let i = 0; i <= contentTokens.length - patLen; i++) {
    let match = true;
    for (let j = 0; j < patLen; j++) {
      if (contentTokens[i + j].text !== patternTokens[j].text) {
        match = false;
        break;
      }
    }
    if (match) {
      // matchStart / matchEnd are offsets inside `content` (from contentTokens).
      const matchStart = contentTokens[i].start;
      const matchEnd   = contentTokens[i + patLen - 1].end;

      // Preserve the leading indentation of the matched line so that
      // multi-line replacements (e.g. lambda bodies, record definitions)
      // are indented consistently with the surrounding code.
      const lineStart    = content.lastIndexOf('\n', matchStart) + 1;
      const leadingIndent = content.slice(lineStart, matchStart).replace(/\S.*/, '');

      const indentedNew = targetNew
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : leadingIndent + line))
        .join('\n');

      return content.slice(0, matchStart) + indentedNew + content.slice(matchEnd);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4. Structural Integrity Helpers
// ---------------------------------------------------------------------------

// Simple bracket/brace balance check that ignores content inside string
// literals and comments.  Returns { curly, paren, isValid }.
function checkBracketBalance(content) {
  let curly = 0;
  let paren = 0;

  const clean = content
    .replace(/\/\/[^\n]*/g, '')          // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')    // strip block comments
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // collapse string literals
    .replace(/'(?:[^'\\]|\\.)*'/g, "''"  // collapse char literals
    );

  for (const char of clean) {
    if (char === '{') curly++;
    else if (char === '}') curly--;
    else if (char === '(') paren++;
    else if (char === ')') paren--;
  }

  return { curly, paren, isValid: curly === 0 && paren === 0 };
}

// Atomic file write: write to a temp file in the same directory then rename,
// so a mid-write crash never leaves the original file in a corrupt state.
function safeWriteFileAtomic(filePath, content) {
  const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
    throw err;
  }
}

// Import deduplication & stale-javax detector.
// Removes exact duplicate import lines and warns when a javax.* import
// survives alongside a matching jakarta.* import.
function deduplicateImports(content, relPath, warnings) {
  const lines  = content.split('\n');
  const seen   = new Set();
  const result = [];
  let changed  = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ') && trimmed.endsWith(';')) {
      if (seen.has(trimmed)) {
        // Exact duplicate — drop it
        changed = true;
        continue;
      }
      seen.add(trimmed);
    }
    result.push(line);
  }

  // Warn on lingering javax.* imports when jakarta.* counterparts exist
  const jakartaImports = [...seen].filter(l => l.startsWith('import jakarta.'));
  const javaxImports   = [...seen].filter(l => l.startsWith('import javax.'));
  for (const ji of javaxImports) {
    const jakartaEquiv = ji.replace('import javax.', 'import jakarta.');
    if (jakartaImports.includes(jakartaEquiv)) {
      warnings.push(
        `${relPath}: Stale import '${ji}' coexists with '${jakartaEquiv}' — remove the javax line manually.`
      );
    }
  }

  return { content: changed ? result.join('\n') : content, changed };
}

// ---------------------------------------------------------------------------
// 5. Cascade warning detection
// ---------------------------------------------------------------------------
function collectCascadeWarnings(finding, relPath) {
  const warnings = [];
  const ruleNameLc = (finding.rule_name || '').toLowerCase();

  // Record conversion — callers must switch from getter methods to accessor methods
  if (
    finding.skill === 'java21' &&
    (finding.rule === 1 || ruleNameLc.includes('record'))
  ) {
    warnings.push(
      `${relPath}: Converted to Record — verify all callers use accessor methods instead of getters.`
    );
  }

  // javax → jakarta namespace — transitive dependencies may still pull javax
  if (
    finding.skill === 'springboot3' &&
    (finding.rule === 3 || ruleNameLc.includes('javax') || ruleNameLc.includes('jakarta'))
  ) {
    warnings.push(
      `${relPath}: javax→jakarta applied — verify transitive dependencies also use jakarta namespace.`
    );
  }

  // WebSecurityConfigurerAdapter removal — SecurityFilterChain bean required
  if (
    finding.skill === 'springboot3' &&
    (finding.rule === 2 || ruleNameLc.includes('websecurity') || ruleNameLc.includes('configureradapter'))
  ) {
    warnings.push(
      `${relPath}: WebSecurityConfigurerAdapter removed — ensure a SecurityFilterChain @Bean is present.`
    );
  }

  // Sealed class — all permitted subclasses must be reachable from the same compilation unit
  if (
    finding.skill === 'java21' &&
    (finding.rule === 2 || ruleNameLc.includes('sealed'))
  ) {
    warnings.push(
      `${relPath}: Sealed class introduced — all permitted subclasses must be in the same package or module.`
    );
  }

  return warnings;
}

// Replace the (skip+1)-th occurrence of `oldStr` in `content`.
// All prior occurrences (0..skip-1) are left untouched.
// Returns the modified string, or null if fewer than (skip+1) occurrences exist.
function replaceNthOccurrence(content, oldStr, newStr, skip) {
  let pos = 0;
  for (let i = 0; i <= skip; i++) {
    const idx = content.indexOf(oldStr, pos);
    if (idx === -1) return null;  // not enough occurrences
    if (i === skip) {
      return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
    }
    pos = idx + oldStr.length;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 6. Apply all findings for a single file
//    Returns { applied, skipped, failed, modified: boolean, warnings: string[] }
// ---------------------------------------------------------------------------
function applyFindingsToFile(absoluteFilePath, relPath, fileFindings) {
  let fileContent;
  try {
    fileContent = fs.readFileSync(absoluteFilePath, 'utf8');
  } catch (err) {
    console.warn(`Warning: Cannot read file ${absoluteFilePath}: ${err.message}`);
    return {
      applied: 0,
      skipped: fileFindings.length,
      failed: 0,
      modified: false,
      warnings: []
    };
  }

  const originalContent = fileContent;
  const normalize = makeNormalizer(fileContent);

  let applied = 0;
  let skipped = 0;
  let failed  = 0;
  const warnings = [];

  // Tracks how many times each unique targetOld snippet has already been
  // replaced in this file. Used by replaceNthOccurrence so that identical
  // snippets at different line numbers each replace the correct occurrence
  // rather than always clobbering the first one from line 1.
  const occurrenceCounter = new Map();

  // Fix #2: sort ascending (top → bottom) so string.replace() always hits the
  // correct first occurrence. Descending order was wrong because .replace()
  // always substitutes the topmost match regardless of the line hint.
  const sorted = [...fileFindings].sort((a, b) => (a.line || 0) - (b.line || 0));

  for (const finding of sorted) {
    // Fix #4: trim only blank lines, preserve indentation
    const rawCurrent     = trimEmptyLines(finding.current     || '');
    const rawReplacement = trimEmptyLines(finding.replacement || '');

    if (!rawCurrent) {
      skipped++;
      continue;
    }

    // Fix #1: descriptive-text guard — skip findings whose "current" block
    // is a human-readable description, not a code snippet.
    if (isDescriptiveSnippet(rawCurrent)) {
      console.warn(
        `Warning [${relPath}] Rule ${finding.skill}/${finding.rule} line ~${finding.line}: ` +
        `snippet looks like descriptive text, not code — skipping (manual edit required).`
      );
      skipped++;
      continue;
    }

    const targetOld = normalize(rawCurrent);
    const targetNew = normalize(rawReplacement);

    // How many times has this exact snippet already been replaced in this file?
    const skipCount = occurrenceCounter.get(targetOld) || 0;

    // -------------------------------------------------------------------------
    // 4-Stage Decision Pipeline
    // -------------------------------------------------------------------------

    // Stage 2: Exact Match with Nth-Occurrence
    // Uses skipCount so duplicate snippets at different line numbers each map
    // to their own occurrence rather than always clobbering the first.
    const exactResult = replaceNthOccurrence(fileContent, targetOld, targetNew, skipCount);
    if (exactResult !== null) {
      fileContent = exactResult;
      occurrenceCounter.set(targetOld, skipCount + 1);
      applied++;
      warnings.push(...collectCascadeWarnings(finding, relPath));
      continue;
    }

    // Stage 3: Line-Anchored Window Match
    // Falls back to an exact substring search within ±30 lines of the hint line.
    // Handles drift where file edits from prior findings shifted line numbers,
    // while the snippet is still present nearby.
    const anchoredResult = tryLineAnchoredReplace(
      fileContent, targetOld, targetNew, finding.line
    );
    if (anchoredResult !== null) {
      fileContent = anchoredResult;
      occurrenceCounter.set(targetOld, skipCount + 1);
      applied++;
      warnings.push(...collectCascadeWarnings(finding, relPath));
      console.warn(
        `Info  [${relPath}] Rule ${finding.skill}/${finding.rule} line ~${finding.line}: ` +
        `applied via line-anchored window match.`
      );
      continue;
    }

    // Stage 4: Fuzzy Token-Level Match
    // Tokenises both pattern and file, ignoring all whitespace. Robust against
    // indentation drift, tab-vs-space differences, and minor formatting changes.
    const fuzzyResult = tryFuzzyTokenReplace(fileContent, targetOld, targetNew);
    if (fuzzyResult !== null) {
      fileContent = fuzzyResult;
      // Bug3 fix: update occurrenceCounter so subsequent identical snippets
      // processed by Stage 2 skip this (now replaced) occurrence correctly.
      occurrenceCounter.set(targetOld, skipCount + 1);
      applied++;
      warnings.push(...collectCascadeWarnings(finding, relPath));
      console.warn(
        `Info  [${relPath}] Rule ${finding.skill}/${finding.rule} line ~${finding.line}: ` +
        `applied via fuzzy token-level match.`
      );
      continue;
    }

    // All stages exhausted — mark skipped.
    console.warn(
      `Warning [${relPath}] Rule ${finding.skill}/${finding.rule} line ~${finding.line}: ` +
      `snippet not matched after all pipeline stages — may already be applied or context differs.`
    );
    skipped++;
  }

  let modified = false;
  if (fileContent !== originalContent) {
    // 1. Import deduplication & stale-javax detection
    const importResult = deduplicateImports(fileContent, relPath, warnings);
    if (importResult.changed) fileContent = importResult.content;

    // 2. Bracket balance guard — warn but still write (don't silently revert
    //    valid structural refactors that happen to span multiple findings).
    const originalBalance = checkBracketBalance(originalContent);
    const newBalance      = checkBracketBalance(fileContent);
    if (originalBalance.isValid && !newBalance.isValid) {
      warnings.push(
        `${relPath}: Bracket balance broken after edits ` +
        `(curly delta: ${newBalance.curly}, paren delta: ${newBalance.paren}) ` +
        `— manual review required.`
      );
    }

    // 3. Atomic write via tmp-then-rename
    try {
      safeWriteFileAtomic(absoluteFilePath, fileContent);
      modified = true;
    } catch (err) {
      console.error(`Error: Cannot write file ${absoluteFilePath}: ${err.message}`);
      failed  += applied;
      applied  = 0;
    }
  }

  return { applied, skipped, failed, modified, warnings };
}

// ---------------------------------------------------------------------------
// 7. Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);

  const inputArg   = args.input;
  const projectPath = args.projectPath
    ? path.resolve(args.projectPath)
    : process.cwd();

  // --- Validate required args -----------------------------------------------
  if (!inputArg) {
    console.error('Error: Missing required argument --input (path to MIGRATION_PLAN.md).');
    process.exit(1);
  }

  const resolvedInput = path.isAbsolute(inputArg)
    ? inputArg
    : path.resolve(projectPath, inputArg);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  // --- Parse MIGRATION_PLAN.md -----------------------------------------------
  let parsedPlan;
  try {
    const markdown = fs.readFileSync(resolvedInput, 'utf8');
    parsedPlan = parseMigrationPlan(markdown);
  } catch (err) {
    console.error(`Error: Failed to parse ${resolvedInput}: ${err.message}`);
    process.exit(1);
  }

  const findings = parsedPlan.findings;

  // --- Build summary skeleton ------------------------------------------------
  const summary = {
    status:           'success',
    project_name:     parsedPlan.projectName || path.basename(projectPath),
    total_findings:   findings.length,
    applied:          0,
    skipped:          0,
    failed:           0,
    changed_files:    new Set(),
    cascade_warnings: []
  };

  // --- Group findings by relative file path ----------------------------------
  const fileMap = new Map();
  for (const finding of findings) {
    const relFile = finding.file;
    if (!relFile) {
      summary.skipped++;
      continue;
    }
    if (!fileMap.has(relFile)) fileMap.set(relFile, []);
    fileMap.get(relFile).push(finding);
  }

  // --- Apply findings file-by-file ------------------------------------------
  for (const [relPath, fileFindings] of fileMap.entries()) {
    const absoluteFilePath = path.isAbsolute(relPath)
      ? relPath
      : path.resolve(projectPath, relPath);

    if (!fs.existsSync(absoluteFilePath)) {
      console.warn(`Warning: File not found: ${absoluteFilePath} — skipping ${fileFindings.length} finding(s).`);
      summary.skipped += fileFindings.length;
      continue;
    }

    const result = applyFindingsToFile(absoluteFilePath, relPath, fileFindings);

    summary.applied  += result.applied;
    summary.skipped  += result.skipped;
    summary.failed   += result.failed;
    result.warnings.forEach(w => summary.cascade_warnings.push(w));
    if (result.modified) summary.changed_files.add(relPath);
  }

  // --- Determine overall status ----------------------------------------------
  if (summary.failed > 0 && summary.applied === 0) {
    summary.status = 'failed';
  } else if (summary.skipped > 0 || summary.failed > 0) {
    summary.status = 'partial';
  }

  // --- Emit JSON result -------------------------------------------------------
  const result = {
    ...summary,
    changed_files: Array.from(summary.changed_files)
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
