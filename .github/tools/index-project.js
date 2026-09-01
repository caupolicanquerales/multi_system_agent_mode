#!/usr/bin/env node
/**
 * index-project.js
 * Off-Thread Pre-Processing Indexer for TechnicalReporter agent.
 *
 * Usage:
 *   node .github/tools/index-project.js --path="<project_root>" --skills="java21,springboot3"
 *
 * Output:
 *   <project_root>/.migration-index.json
 *
 * The output is a dictionary keyed by forward-slash relative file path.
 * Each entry is an array of candidate hits: { skill, rule, line }.
 *
 * Patterns sourced from:
 *   .github/skills/technical-reporter-rules-extractor/SKILL.md
 *
 * Zero external dependencies — uses only Node.js built-in modules.
 * Requires Node.js >= 12.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Pattern registry — mirrors the Built-In Combined Grep Index in
// technical-reporter-rules-extractor/SKILL.md
//
// Patterns are split into two groups per skill:
//   LINE_PATTERNS    — single-line regexes; matched against each line string.
//   CONTENT_PATTERNS — multi-line regexes; matched against full file content
//                      via exec() loop; line numbers are computed from offset.
//
// No regex carries a /g flag here — statefulness is handled explicitly where
// needed (exec loops use locally-created regex objects).
// ---------------------------------------------------------------------------
const REGISTRY = {
  java21: {
    LINE_PATTERNS: [
      { rule: 2,  regex: /\bextends\b/ },
      { rule: 7,  regex: /new\s+HashMap<|new\s+ArrayList<|new\s+LinkedHashMap</ },
      // Negative lookbehind skips import-only lines (e.g. `import java.util.concurrent.ExecutorService;`)
      { rule: 9,  regex: /Executors\.\w+ThreadPool\b|Executors\.newSingleThread(?:Executor|ScheduledExecutor)\b|new\s+Thread\s*\(|(?<!import\s\S+\.)(?:ExecutorService|ThreadPoolExecutor)\b/ },
      { rule: 10, regex: /\.get\(0\)|\.getFirst\(\)|\.getLast\(\)/ },
      { rule: 11, regex: /\.trim\(\)/ },
      { rule: 13, regex: /Collectors\.toList\(\)/ },
      { rule: 15, regex: /Collections\.unmodifiable(?:List|Set|Map)\(/ },
      { rule: 16, regex: /Thread\.stop|SecurityManager|finalize\s*\(\s*\)/ },
      { rule: 18, regex: /new\s+Comparator|new\s+Runnable|new\s+Callable/ },
      // Rule 19 — Local Static Members: static nested class/interface/enum candidates
      { rule: 19, regex: /\bstatic\s+(?:class|interface|enum)\s+\w/ },
      // Rule 20 — Module System: internal sun.* / com.sun.* API usage
      { rule: 20, regex: /import\s+(?:sun|com\.sun)\.\w/ },
      // Rule 21 — Java Time API: matches both fully-qualified and standalone legacy date/time types
      { rule: 21, regex: /\b(?:java\.util\.)?(?:Date|Calendar)\b|\b(?:SimpleDateFormat|DateFormat)\b/ },
      // Rule 22 — Modern HTTP Client: legacy HttpURLConnection usage
      { rule: 22, regex: /HttpURLConnection\b|\.openConnection\(\)/ },
      // Rule 23 — Modern NIO: legacy file I/O stream constructors
      { rule: 23, regex: /new\s+(?:FileReader|FileWriter|BufferedReader|BufferedWriter)\s*\(/ },
      // Rule 24 — DTO Record Conversion: classes named *DTO or *Dto (camelCase)
      { rule: 24, regex: /\bclass\s+\w+(?:DTO|Dto)\b/ },
    ],
    CONTENT_PATTERNS: [
      // Rule 1 — Records: public final class ... { ... private final
      { rule: 1,  source: 'public\\s+final\\s+class\\s+\\w[\\s\\S]*?private\\s+final' },
      // Rule 3 — instanceof with explicit cast on next line
      { rule: 3,  source: 'instanceof\\s+[A-Z]\\w+\\)\\s*\\{[\\s\\S]*?[A-Z]\\w+\\s+\\w+\\s*=\\s*\\(' },
      // Rule 4 — instanceof in if/else-if chains
      { rule: 4,  source: 'instanceof[\\s\\S]*?else\\s+if' },
      // Rule 5 — switch with break assigning a variable
      { rule: 5,  source: 'switch\\s*\\([\\s\\S]*?\\)\\s*\\{[\\s\\S]*?break;' },
      // Rule 6 — multi-line string concatenation
      { rule: 6,  source: '\\+\\s*\\n\\s*"|"""' },
      // Rule 17 — try/finally with .close()
      { rule: 17, source: '}\\s*finally[\\s\\S]*?\\.close\\(\\)' },
      // Rule 24 — DTO Record Conversion: dto/vo/model/payload/request/response packages; full-class read required at inspection time
      { rule: 24, source: 'package\\s+[\\w.]+\\.(?:dto|vo|model|payload|request|response)\\s*;' },
    ],
  },
  springboot3: {
    LINE_PATTERNS: [
      { rule: 3,  regex: /import\s+javax\./ },
      { rule: 4,  regex: /WebSecurityConfigurerAdapter|antMatchers|mvcMatchers|authorizeRequests\s*\(\s*\)/ },
      { rule: 5,  regex: /\.getOne\s*\(/ },
      { rule: 6,  regex: /HttpMethod\.valueOf/ },
      { rule: 9,  regex: /JobBuilderFactory|StepBuilderFactory/ },
      { rule: 12, regex: /@TypeDef|@Type\s*\(\s*type|GenerationType\.AUTO/ },
      { rule: 15, regex: /springfox/ },
      // Rule 6  — Spring MVC: removed PathMatchingConfigurationAdapter
      { rule: 6,  regex: /PathMatchingConfigurationAdapter/ },
      // Rule 11 — Removed APIs: RestTemplate still works but RestClient is preferred in Spring 6
      { rule: 11, regex: /\bRestTemplate\b/ },
      // Rule 13 — Misc: @Timed on controllers requires explicit ObservationRegistry in Boot 3
      { rule: 13, regex: /@Timed\b/ },
      // Rule 17 — Legacy Servlet: HttpServlet subclasses should become @Controller
      { rule: 17, regex: /extends\s+HttpServlet\b|implements\s+(?:Controller|HttpRequestHandler)\b/ },
      // Rule 18 — Legacy JDBC DAO: JdbcDaoSupport should be replaced with JdbcTemplate injection
      { rule: 18, regex: /extends\s+(?:JdbcDaoSupport|HibernateDaoSupport|SqlMapClientDaoSupport)\b/ },
    ],
    CONTENT_PATTERNS: [],
  },
};

// Config and build file patterns (springboot3 only) — all single-line safe
const SPRINGBOOT3_CONFIG_PATTERNS = [
  { rule: 1,  regex: /<java\.version>[0-9]|sourceCompatibility\s*=\s*['"]?[0-9]/ },
  { rule: 2,  regex: /spring-boot.*2\./ },
  { rule: 15, regex: /springfox/ },
  { rule: 8,  regex: /spring\.redis\.|spring\.elasticsearch\.rest|logging\.file=|logging\.path=|datasource\.initialization-mode|server\.max-http-header-size|spring\.mvc\.pathmatch\.use-suffix-pattern/ },
  { rule: 13, regex: /spring\.metrics\./ },
  { rule: 14, regex: /allow-circular-references\s*=\s*true/ },
  // Rule 19 — XML config files: Spring MVC namespace or web.xml descriptor
  { rule: 19, regex: /xmlns:(?:mvc|beans)\s*=\s*['"]http:\/\/www\.springframework\.org\/schema|<web-app\b/ },
];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const eq  = arg.indexOf('=');
    const key = arg.slice(2, eq);          // strip leading --
    args[key] = eq === -1 ? true : arg.slice(eq + 1);
  }
  return args;
}

// ---------------------------------------------------------------------------
// File-type predicates (shared by discoverFiles and scanFile)
// ---------------------------------------------------------------------------
const isJavaFile      = name => name.endsWith('.java');
const isConfigFile    = name => /\.(properties|ya?ml)$/.test(name);
const isBuildFile     = name => name === 'pom.xml' || name === 'build.gradle';
// Spring XML descriptors (web.xml, *-context.xml, *-servlet.xml) — excludes pom.xml
const isSpringXmlFile = name => name !== 'pom.xml' && name.endsWith('.xml');

// ---------------------------------------------------------------------------
// Zero-dependency recursive file discovery
// ---------------------------------------------------------------------------
const EXCLUDE_SEGMENTS = new Set([
  'target', 'build', '.gradle', 'out', '.git', 'node_modules', 'dist',
]);
const EXCLUDE_PATTERNS = [
  /[\\/]generated/i,
  /[\\/]protobuf[\\/]/,
  /[\\/]openapi[\\/]/,
  /[\\/]mapstruct[\\/]/,
];

function shouldExclude(absPath) {
  const parts = absPath.split(/[\\/]/);
  if (parts.some(p => EXCLUDE_SEGMENTS.has(p))) return true;
  if (EXCLUDE_PATTERNS.some(re => re.test(absPath)))  return true;
  return false;
}

function walkDir(dir, matchFn, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return results; }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (shouldExclude(full)) continue;
    if (entry.isDirectory()) {
      walkDir(full, matchFn, results);
    } else if (entry.isFile() && matchFn(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function discoverFiles(projectPath, activeSkills) {
  const javaRoot = path.join(projectPath, 'src', 'main', 'java');
  const scanRoot = fs.existsSync(javaRoot) ? javaRoot : projectPath;

  let files = walkDir(scanRoot, isJavaFile);

  if (activeSkills.includes('springboot3')) {
    const resourcesRoot = path.join(projectPath, 'src', 'main', 'resources');
    if (fs.existsSync(resourcesRoot)) {
      files = files.concat(walkDir(resourcesRoot, isConfigFile));
      files = files.concat(walkDir(resourcesRoot, isSpringXmlFile));
    }
    const webAppRoot = path.join(projectPath, 'src', 'main', 'webapp');
    if (fs.existsSync(webAppRoot)) {
      files = files.concat(walkDir(webAppRoot, isSpringXmlFile));
    }
    files = files.concat(walkDir(projectPath, isBuildFile).filter(f => {
      // Only top-level pom.xml / build.gradle
      return path.dirname(f) === projectPath;
    }));
  }

  return [...new Set(files)];
}

// ---------------------------------------------------------------------------
// Compute line number (1-based) from a character offset within content
// ---------------------------------------------------------------------------
function offsetToLine(content, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// Apply an array of single-line patterns against pre-split lines
function applyLinePatterns(patterns, lines, skill, addHit) {
  for (const { rule, regex } of patterns) {
    lines.forEach((ln, idx) => {
      if (regex.test(ln)) addHit(skill, rule, idx + 1);
    });
  }
}

// ---------------------------------------------------------------------------
// Single-file scanner — returns array of { skill, rule, line } hits
// ---------------------------------------------------------------------------
function scanFile(filePath, activeSkills) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); }
  catch (_) { return []; }

  const lines   = content.split('\n');
  const hits    = [];
  const seen    = new Set(); // deduplicate (skill, rule, line) triples

  function addHit(skill, rule, lineNo) {
    const key = `${skill}:${rule}:${lineNo}`;
    if (!seen.has(key)) { seen.add(key); hits.push({ skill, rule, line: lineNo }); }
  }

  const isJava   = isJavaFile(path.basename(filePath));
  const isConfig = isConfigFile(path.basename(filePath));
  const isBuild  = isBuildFile(path.basename(filePath));

  for (const skill of activeSkills) {
    const { LINE_PATTERNS = [], CONTENT_PATTERNS = [] } = REGISTRY[skill] || {};

    // --- Java file: line-by-line patterns then multi-line content patterns ---
    if (isJava) {
      applyLinePatterns(LINE_PATTERNS, lines, skill, addHit);

      for (const { rule, source } of CONTENT_PATTERNS) {
        const re = new RegExp(source, 'g');   // fresh stateful regex each time
        let m;
        while ((m = re.exec(content)) !== null) {
          addHit(skill, rule, offsetToLine(content, m.index));
          // Prevent infinite loop on zero-length matches
          if (m.index === re.lastIndex) re.lastIndex++;
        }
      }
    }

    // --- Config / build / Spring XML file patterns (springboot3 only, all single-line) ---
    const isSpringXml = isSpringXmlFile(path.basename(filePath));
    if (skill === 'springboot3' && (isConfig || isBuild || isSpringXml)) {
      applyLinePatterns(SPRINGBOOT3_CONFIG_PATTERNS, lines, skill, addHit);
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args        = parseArgs(process.argv);
  const projectPath = path.resolve(args.path || '.');
  const skillsArg   = String(args.skills || 'java21,springboot3')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const activeSkills = skillsArg.filter(s => Object.prototype.hasOwnProperty.call(REGISTRY, s));

  if (!fs.existsSync(projectPath)) {
    console.error(`ERROR: project path not found: ${projectPath}`);
    process.exit(1);
  }
  if (activeSkills.length === 0) {
    console.error(`ERROR: no valid skills found in --skills="${args.skills}". Valid values: ${Object.keys(REGISTRY).join(', ')}`);
    process.exit(1);
  }

  console.log(`Indexing: ${projectPath}`);
  console.log(`Skills:   ${activeSkills.join(', ')}`);

  const files    = discoverFiles(projectPath, activeSkills);
  const indexMap = {};
  let   hitFiles = 0;

  for (const file of files) {
    const hits = scanFile(file, activeSkills);
    if (hits.length > 0) {
      // Bug 3 fix: normalize to forward slashes regardless of OS
      const relPath     = path.relative(projectPath, file).replace(/\\/g, '/');
      indexMap[relPath] = hits;
      hitFiles++;
    }
  }

  const outputPath = path.join(projectPath, '.migration-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(indexMap, null, 2), 'utf8');

  console.log(`Done. ${hitFiles} files with candidates out of ${files.length} scanned.`);
  console.log(`Index written to: ${outputPath}`);
}

main();

