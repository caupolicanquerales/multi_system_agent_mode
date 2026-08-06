#!/usr/bin/env node
/**
 * log_analyzer.js
 * Smart Log Trimmer for the multi-system agent pipeline.
 *
 * Strips non-essential output from Maven, Node, and TypeScript build logs
 * and prints only the high-signal error block so the calling agent consumes
 * as few tokens as possible when diagnosing a failed terminal run.
 *
 * Usage:
 *   node .github/tools/log_analyzer.js <log_file>   # from a file
 *   <command> 2>&1 | node .github/tools/log_analyzer.js   # from stdin
 *
 * Exit codes:
 *   0  No errors detected (build passed or unrecognised state)
 *   1  Errors found — compacted block printed to stdout
 */

'use strict';

const fs = require('fs');

// ---------------------------------------------------------------------------
// PROTECTED patterns — these lines always pass regardless of noise rules.
// Used to preserve Caused by: chains, compilation error detail lines, and
// assertion diffs that don't match primary error signals.
// ---------------------------------------------------------------------------
const PROTECTED_PATTERNS = [
  // Root-cause chain — must never be silenced by framework noise filter
  /^[\s\t]*Caused by:/,
  // Maven compiler error detail lines (indented, no [ERROR] prefix)
  /^\s+symbol\s*:/,
  /^\s+location\s*:/,
  /^\s+required\s*:/,
  /^\s+found\s*:/,
  // JUnit / TestNG assertion diff lines
  /^\s+Expected\s*:/,
  /^\s+Actual\s*:/,
  /^\s+Received\s*:/,
  // Jest/Vitest diff markers
  /^\s+[+-]\s+/,
  // Generic "expected … but was" continuation
  /expected\s+.+\s+but\s+was/i,
];

// ---------------------------------------------------------------------------
// NOISE patterns — silence lines that match, UNLESS they also match a
// PROTECTED or ERROR_SIGNAL pattern.
//
// *** All framework stack-frame patterns are anchored with /^\s+at / ***
// This prevents them from silencing "Caused by: org.springframework.beans…"
// lines or compilation errors that mention a class package in their message.
// The blanket /^\[INFO\]/ pattern is intentionally removed — specific
// [INFO] variants below are sufficient and avoid dropping compiler output.
// ---------------------------------------------------------------------------
const NOISE_PATTERNS = [
  // Maven download progress and build lifecycle chatter
  /^\[INFO\]\s+Downloading:/,
  /^\[INFO\]\s+Downloaded:/,
  /^\[INFO\]\s+Building\s/,
  /^\[INFO\]\s+BUILD\s/,
  /^\[INFO\]\s*[-=]{3,}/,
  /^\[INFO\]\s+Total time/,
  /^\[INFO\]\s+Finished at/,
  /^\[INFO\]\s+Scanning for/,
  /^\[INFO\]\s*$/,
  // Passing test summary lines
  /^\[INFO\]\s+Tests run:.*Failures: 0.*Errors: 0/,
  /^PASS\s/,
  // Spring / Java framework STACK FRAMES only (anchored — does NOT silence Caused by lines)
  /^\s+at org\.springframework\./,
  /^\s+at org\.apache\.catalina\./,
  /^\s+at org\.apache\.tomcat\./,
  /^\s+at org\.hibernate\./,
  /^\s+at org\.junit\.platform\./,
  /^\s+at org\.junit\.vintage\./,
  /^\s+at sun\.reflect\./,
  /^\s+at java\.base[\/\\]/,
  /^\s+at java\.lang\.reflect\./,
  /^\s+at jdk\.internal\./,
  /^\s+at com\.sun\./,
  // Node/npm internal stack frames only (/ on Linux/macOS, \ on Windows)
  /^\s+at node:internal[\/\\]/,
  /[\/\\]node_modules[\/\\]/,
  /^\s+at Function\.<anonymous> \(node:/,
  // npm noise
  /^npm warn\s/i,
  /^npm notice\s/i,
  // Generic empty separator lines
  /^-{10,}$/,
  /^={10,}$/,
];

// ---------------------------------------------------------------------------
// ERROR_SIGNAL patterns — a line is "high-signal" when it matches ANY of
// these. Signals anchor the context-capture pass.
// ---------------------------------------------------------------------------
const ERROR_SIGNALS = [
  '[ERROR]',
  'COMPILATION ERROR',
  'BUILD FAILURE',
  'FAILURE!',
  // Test failures
  /^\[ERROR\]\s+Tests run:/,
  /^FAIL(ED)?\s/,
  // Java exceptions and errors (class name followed by colon)
  /\bException[:\s]/,
  /\bError[:\s]/,
  /\bAssertionError/,
  /\bNullPointerException/,
  /\bClassNotFoundException/,
  /\bNoSuchMethodError/,
  /\bNoSuchBeanDefinitionException/,
  /\bUnsatisfiedDependencyException/,
  /\bIllegalStateException/,
  /\bIllegalArgumentException/,
  // Caused by — root-cause chain anchors a new signal
  /^[\s\t]*Caused by:/,
  // TypeScript compiler errors
  /\bTS\d{4}:/,
  /^error TS\d+/,
  // Java / TS / JS source file references with line numbers
  /\S+\.(?:java|kt|ts|js|tsx|jsx):\[?\d+/,
  // npm errors
  /^npm ERR!/,
  // Jest/Mocha test failure header
  /^\s+●\s+.+›/,
  /^  FAIL\s/,
  // Gradle errors
  /^FAILURE:\s/,
  /^> Task .+ FAILED/,
];

// ---------------------------------------------------------------------------
// CONTINUATION patterns — after a signal line, keep capturing subsequent
// lines while they match any of these. Stops the post-signal window from
// being arbitrarily cut off by a fixed line count.
// ---------------------------------------------------------------------------
const CONTINUATION_PATTERNS = [
  // Stack trace lines (any — framework ones are filtered later, user ones kept)
  /^\s+at /,
  // Assertion diff content
  /^\s+(Expected|Actual|Received)\s*:/,
  /^\s+[+-]\s+/,
  // Maven compiler detail continuations
  /^\s+(symbol|location|required|found)\s*:/,
  // Indented continuation (detail lines under a compiler error)
  /^\s{2,}\S/,
  // Caused by chain
  /^[\s\t]*Caused by:/,
  // "... N more" stack truncation marker
  /^\s+\.\.\. \d+ more/,
];

// Lines after a signal: keep collecting while continuations fire; stop after
// this many consecutive non-continuation lines.
const PRE_CONTEXT_LINES  = 3;
const POST_STOP_AFTER    = 2;  // blank/non-continuation lines before ending block

// Hard cap: maximum output lines (keeps token usage bounded).
const MAX_OUTPUT_LINES   = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function matchesAny(line, patterns) {
  for (const p of patterns) {
    if (typeof p === 'string' && line.includes(p)) return true;
    if (p instanceof RegExp && p.test(line)) return true;
  }
  return false;
}

function isSignal(line)       { return matchesAny(line, ERROR_SIGNALS); }
function isProtected(line)    { return matchesAny(line, PROTECTED_PATTERNS); }
function isNoise(line)        { return !isProtected(line) && matchesAny(line, NOISE_PATTERNS); }
function isContinuation(line) { return matchesAny(line, CONTINUATION_PATTERNS); }

// ---------------------------------------------------------------------------
// Core trimmer — block-capture algorithm
//
// Instead of a fixed ±N window, the algorithm:
//   1. Scans for a signal line.
//   2. On hit, emits PRE_CONTEXT_LINES preceding lines.
//   3. Enters "capture mode": emits lines while they are continuations,
//      protected, or signals. Stops after POST_STOP_AFTER consecutive
//      lines that are neither.
//   4. Applies noise filter to every candidate line EXCEPT protected ones.
// ---------------------------------------------------------------------------
function compressLogs(input) {
  // Normalize CRLF (Windows) and bare CR to LF so all regex anchors work consistently
  const lines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const n     = lines.length;
  const output = [];

  let i = 0;
  while (i < n && output.length < MAX_OUTPUT_LINES) {
    const line = lines[i];

    if (!isSignal(line)) {
      i++;
      continue;
    }

    // Emit pre-context (skip noise, honour protected)
    const preStart = Math.max(0, i - PRE_CONTEXT_LINES);
    for (let p = preStart; p < i; p++) {
      const pl = lines[p].trimEnd();
      if (!isNoise(pl)) output.push(pl);
    }

    // Capture mode: emit the signal and everything that follows it
    // until POST_STOP_AFTER consecutive non-continuation lines
    let consecutive = 0;
    while (i < n && output.length < MAX_OUTPUT_LINES) {
      const cl = lines[i].trimEnd();

      const signal    = isSignal(cl);
      const protect   = isProtected(cl);
      const cont      = isContinuation(cl);
      const noise     = isNoise(cl);
      const blank     = cl.trim() === '';

      if (signal || protect) {
        // Always include; reset stop counter
        if (!noise || protect) output.push(cl);
        consecutive = 0;
        i++;
        continue;
      }

      if (cont && !noise) {
        output.push(cl);
        consecutive = 0;
        i++;
        continue;
      }

      // Non-continuation, non-signal: count toward stop threshold
      if (!blank && !noise) {
        // Might be a meaningful line just outside signal vocabulary — keep it
        output.push(cl);
      }
      consecutive++;
      i++;

      if (consecutive >= POST_STOP_AFTER) break;
    }

    // Insert blank separator between error blocks for readability
    if (output.length > 0 && output[output.length - 1] !== '') {
      output.push('');
    }
  }

  // Trim trailing blank line
  while (output.length > 0 && output[output.length - 1] === '') output.pop();

  return output;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  let input = '';

  if (process.argv[2] && fs.existsSync(process.argv[2])) {
    input = fs.readFileSync(process.argv[2], 'utf8');
  } else {
    try {
      input = fs.readFileSync(0, 'utf-8');
    } catch (_) {
      process.exit(0);
    }
  }

  const compacted = compressLogs(input);

  if (compacted.length === 0) {
    console.log('BUILD PASSED OR UNKNOWN ERROR STATE');
    process.exit(0);
  }

  console.log('=== COMPACTED ERROR LOG ===');
  console.log(compacted.join('\n'));
  console.log('===========================');
  process.exit(1);
}

try {
  main();
} catch (_) {
  // Never crash the calling agent — silently exit clean
  process.exit(0);
}

