#!/usr/bin/env node
/**
 * main-class-generator.js
 * Spring Boot Main Class Generator for the multi-system agent pipeline.
 *
 * Applies the rules in .github/skills/spring-boot-main-class/SKILL.md:
 * reads modernization-metrics.json (trigger check) and business-ast-report.json
 * (root package calculation), resolves the artifact name/packaging from the
 * project's build file, and writes the missing @SpringBootApplication entry
 * point to the project's source tree.
 *
 * Usage:
 *   node .github/tools/main-class-generator.js \
 *     --projectPath="C:/path/to/project"
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Strips one layer of matching outer quotes (only when both ends agree) and
// un-escapes any \" / \' left behind by shells that escape rather than strip
// quoted paths (observed inconsistently between PowerShell and Bash).
function stripQuotes(value) {
  if (typeof value !== 'string' || value.length < 2) return value;
  const first = value[0];
  const last  = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\(['"])/g, '$1');
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      const key = arg.slice(2, eq);
      const raw = arg.slice(eq + 1);
      args[key] = stripQuotes(raw);
    }
  }
  return args;
}

const EXCLUDE_DIRS = new Set(['target', 'build', 'out', 'bin', '.git', '.gradle', '.idea', '.vscode', 'node_modules']);

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------
function walkJavaFiles(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJavaFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      results.push(full);
    }
  }
}

// Rule 0 — default src/main/java, else locate it from a known class's package + name,
// else fall back to the default path (best-effort, even if it doesn't exist yet).
function resolveSourceRoot(projectPath, classes) {
  const defaultRoot = path.join(projectPath, 'src', 'main', 'java');
  if (fs.existsSync(defaultRoot)) return defaultRoot;

  const candidate = classes.find((c) => c.packageName && c.className);
  if (candidate) {
    const relPath = path.join(...candidate.packageName.split('.'), `${candidate.className}.java`);
    const allJava = [];
    walkJavaFiles(projectPath, allJava);
    const match = allJava.find((f) => f.endsWith(relPath));
    if (match) return match.slice(0, match.length - relPath.length - 1);
  }
  return defaultRoot;
}

// Rule 2 guard — an existing *Application.java anywhere under source-root blocks creation.
function findExistingApplicationClass(sourceRoot) {
  const results = [];
  walkJavaFiles(sourceRoot, results);
  return results.find((f) => /Application\.java$/i.test(path.basename(f))) || null;
}

// ---------------------------------------------------------------------------
// Rule 3 — package & class name resolution
// ---------------------------------------------------------------------------
function shortestCommonPrefix(packages) {
  if (!packages.length) return null;
  const parts  = packages.map((p) => p.split('.'));
  const minLen = Math.min(...parts.map((p) => p.length));
  const common = [];
  for (let i = 0; i < minLen; i++) {
    const segment = parts[0][i];
    if (parts.every((p) => p[i] === segment)) common.push(segment);
    else break;
  }
  return common.length ? common.join('.') : null;
}

function toPascalCase(name) {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function stripXmlBlocks(xml, tags) {
  let result = xml;
  for (const tag of tags) {
    result = result.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'g'), '');
  }
  return result;
}

function firstXmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return match ? match[1].trim() : null;
}

// Resolves { groupId, artifactId, packaging } from the primary build file (Rule 0/3/4).
function resolveBuildInfo(projectPath) {
  const pomPath = path.join(projectPath, 'pom.xml');
  if (fs.existsSync(pomPath)) {
    const xml = stripXmlBlocks(fs.readFileSync(pomPath, 'utf8'), ['parent', 'dependencies', 'dependencyManagement', 'profiles', 'pluginManagement']);
    return {
      groupId:    firstXmlTag(xml, 'groupId'),
      artifactId: firstXmlTag(xml, 'artifactId'),
      packaging:  (firstXmlTag(xml, 'packaging') || 'jar').toLowerCase(),
    };
  }

  const gradleFile = ['build.gradle', 'build.gradle.kts']
    .map((f) => path.join(projectPath, f))
    .find((f) => fs.existsSync(f));
  if (gradleFile) {
    const text       = fs.readFileSync(gradleFile, 'utf8');
    const groupMatch = text.match(/\bgroup\s*=?\s*['"]([^'"]+)['"]/);
    const isWar      = /apply\s+plugin:\s*['"]war['"]/.test(text) || /id\s*\(?\s*['"]war['"]\s*\)?/.test(text);

    let artifactId = null;
    const settingsFile = ['settings.gradle', 'settings.gradle.kts']
      .map((f) => path.join(projectPath, f))
      .find((f) => fs.existsSync(f));
    if (settingsFile) {
      const nameMatch = fs.readFileSync(settingsFile, 'utf8').match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/);
      if (nameMatch) artifactId = nameMatch[1];
    }
    return { groupId: groupMatch ? groupMatch[1] : null, artifactId, packaging: isWar ? 'war' : 'jar' };
  }

  return { groupId: null, artifactId: null, packaging: 'jar' };
}

// ---------------------------------------------------------------------------
// Rule 4 — packaging-aware template
// ---------------------------------------------------------------------------
function renderTemplate(pkg, className, packaging) {
  const packageLine = pkg ? `package ${pkg};\n\n` : '';

  if (packaging === 'war') {
    return `${packageLine}import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

@SpringBootApplication
public class ${className} extends SpringBootServletInitializer {
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(${className}.class);
    }
    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }
}
`;
  }

  return `${packageLine}import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {
    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }
}
`;
}

function printResult(result) {
  if (result.status === 'success') {
    console.log(`Main class generated at: ${result.target_path}`);
  } else if (result.status === 'skipped') {
    console.log(`Skipped: ${result.reason}`);
  }
  console.log(`RESULT: ${JSON.stringify(result)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args        = parseArgs(process.argv);
  const projectPath = args.projectPath && path.resolve(args.projectPath);

  if (!projectPath) {
    console.error('ERROR: --projectPath=<project root> is required.');
    process.exit(1);
  }

  const metricsPath = path.join(projectPath, 'modernization-metrics.json');
  const astPath      = path.join(projectPath, 'business-ast-report.json');

  if (!fs.existsSync(metricsPath)) {
    console.error(`ERROR: modernization-metrics.json not found: ${metricsPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(astPath)) {
    console.error(`ERROR: business-ast-report.json not found: ${astPath}`);
    process.exit(1);
  }

  let metrics, classes;
  try {
    metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse ${metricsPath}: ${e.message}`);
    process.exit(1);
  }
  try {
    classes = JSON.parse(fs.readFileSync(astPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse ${astPath}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(classes)) {
    classes = (classes && Array.isArray(classes.classes)) ? classes.classes : [];
  }

  // Trigger check (modernization-metrics.json)
  const hasMainClass = !!(metrics.crossCorrelation && metrics.crossCorrelation.hasSpringBootMainClass);
  if (hasMainClass) {
    printResult({ status: 'skipped', reason: 'crossCorrelation.hasSpringBootMainClass is true', target_path: null, class_name: null, package: null, packaging: null });
    return;
  }

  const sourceRoot = resolveSourceRoot(projectPath, classes);

  // Rule 2 guard — don't duplicate a partially-written entry point
  const existing = findExistingApplicationClass(sourceRoot);
  if (existing) {
    printResult({ status: 'skipped', reason: 'existing *Application.java found under source root', target_path: existing, class_name: null, package: null, packaging: null });
    return;
  }

  // Root package calculation (business-ast-report.json)
  const packages = [...new Set(classes.map((c) => c.packageName).filter(Boolean))];
  const build    = resolveBuildInfo(projectPath);
  const rootPackage = shortestCommonPrefix(packages) || build.groupId || '';

  // Class & target path resolution (pom.xml / build.gradle)
  const className   = build.artifactId ? `${toPascalCase(build.artifactId)}Application` : 'Application';
  const packaging   = build.packaging || 'jar';
  const packagePath = rootPackage ? rootPackage.split('.').join(path.sep) : '';
  const targetDir   = packagePath ? path.join(sourceRoot, packagePath) : sourceRoot;
  const targetPath  = path.join(targetDir, `${className}.java`);

  if (fs.existsSync(targetPath)) {
    printResult({ status: 'skipped', reason: 'target file already exists', target_path: targetPath, class_name: className, package: rootPackage, packaging });
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, renderTemplate(rootPackage, className, packaging), 'utf8');

  printResult({ status: 'success', reason: null, target_path: targetPath, class_name: className, package: rootPackage, packaging });
}

main();
