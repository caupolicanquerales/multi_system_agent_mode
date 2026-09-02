#!/usr/bin/env node
/**
 * metrics-calculater.js
 * Modernization Metrics Calculator for the multi-system agent pipeline.
 *
 * Reads business-ast-report.json (class/interface AST summary) and
 * dependency-tree.txt (Maven `dependency:tree` output) from a project's root
 * path, cross-correlates structural code metrics against active dependencies,
 * writes the consolidated result to modernization-metrics.json in that same
 * root path, and also prints it as JSON on stdout.
 *
 * Usage:
 *   node .github/tools/metrics-calculater.js \
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

// ---------------------------------------------------------------------------
// Regex keyword sets
// ---------------------------------------------------------------------------
const LEGACY_JAVADOC_KEYWORDS   = /legacy|manual mapping|migrated|replaces/i;
const CONCURRENCY_KEYWORDS      = /runnable|callable|executorservice|threadpool|fixedthreadpool/i;
const CONSTANTS_NAME_PATTERN    = /Constants$/i;
const DAO_NAME_PATTERN          = /DAO$/i;
const HTTP_URL_CONNECTION_REGEX = /HttpURLConnection/i;

// ---------------------------------------------------------------------------
// AST Metric Extraction (business-ast-report.json)
// ---------------------------------------------------------------------------
function extractAstMetrics(classes) {
  const totalClasses = classes.length;

  let classesWithAnnotations  = 0;
  let interfaceConstantsCount = 0;
  let rawJdbcDaoCount         = 0;
  let legacyConcurrencyCount  = 0;
  let legacyJavadocFlagCount  = 0;
  let controllerCount         = 0;
  let httpUrlConnectionFlag   = false;
  let webMvcConfig            = null;

  for (const cls of classes) {
    const className   = cls.className   || '';
    const packageName  = cls.packageName || '';
    const annotations  = cls.annotations || [];
    const javadoc      = cls.javadoc     || '';
    const isInterface  = !!cls.isInterface;

    if (annotations.length > 0) classesWithAnnotations++;

    // Anti-pattern: constants declared in an interface (or *Constants class)
    if (CONSTANTS_NAME_PATTERN.test(className) ||
        (isInterface && /constant/i.test(javadoc))) {
      interfaceConstantsCount++;
    }

    // Raw JDBC DAO: lives in a .dao package / named *DAO, no @Repository annotation
    const looksLikeDao = packageName.toLowerCase().endsWith('.dao') || DAO_NAME_PATTERN.test(className);
    if (looksLikeDao && !annotations.includes('Repository')) {
      rawJdbcDaoCount++;
    }

    // Legacy concurrency markers (raw Runnable/Callable/ExecutorService usage)
    if (CONCURRENCY_KEYWORDS.test(javadoc) || CONCURRENCY_KEYWORDS.test(className)) {
      legacyConcurrencyCount++;
    }

    // Legacy Javadoc keyword flags
    if (LEGACY_JAVADOC_KEYWORDS.test(javadoc)) {
      legacyJavadocFlagCount++;
    }

    if (annotations.includes('Controller') || annotations.includes('RestController')) {
      controllerCount++;
    }

    if (HTTP_URL_CONNECTION_REGEX.test(javadoc)) {
      httpUrlConnectionFlag = true;
    }

    if (className === 'WebMvcConfig') {
      webMvcConfig = cls;
    }
  }

  const annotationRatio = totalClasses > 0 ? classesWithAnnotations / totalClasses : 0;
  const controllerRatio = totalClasses > 0 ? controllerCount / totalClasses : 0;

  // MVC configuration status: migrated (@Configuration, no @EnableWebMvc) vs still on XML/legacy
  let mvcConfigStatus = 'NOT_FOUND';
  if (webMvcConfig) {
    const hasConfiguration = (webMvcConfig.annotations || []).includes('Configuration');
    const hasEnableWebMvc  = (webMvcConfig.annotations || []).includes('EnableWebMvc');
    mvcConfigStatus = hasConfiguration && !hasEnableWebMvc ? 'MIGRATED' : 'LEGACY_XML';
  }

  return {
    totalClasses,
    classesWithAnnotations,
    annotationRatio,
    controllerCount,
    controllerRatio,
    interfaceConstantsCount,
    rawJdbcDaoCount,
    legacyConcurrencyCount,
    legacyJavadocFlagCount,
    httpUrlConnectionFlag,
    mvcConfigStatus,
  };
}

// ---------------------------------------------------------------------------
// Dependency Parsing (dependency-tree.txt)
// ---------------------------------------------------------------------------
// Maven `dependency:tree` line format (tree glyphs stripped):
//   groupId:artifactId:packaging:version:scope
const DEPENDENCY_LINE_REGEX = /([\w.-]+):([\w.-]+):([\w.-]+):([\w.-]+):(\w+)/;

function parseDependencyTree(text) {
  const dependencies = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const match = DEPENDENCY_LINE_REGEX.exec(line);
    if (!match) continue;
    const [, groupId, artifactId, packaging, version, scope] = match;
    dependencies.push({ groupId, artifactId, packaging, version, scope });
  }

  return dependencies;
}

// Category rules are matched against every dependency in a single pass, so
// adding/adjusting a modernity marker never requires a new array scan —
// this keeps the cost O(dependencies) regardless of tree size or category count.
const DEPENDENCY_CATEGORY_RULES = [
  { key: 'springCore',    test: (d) => /^spring-core$/i.test(d.artifactId) },
  { key: 'springWeb',     test: (d) => /^spring-web(mvc)?$/i.test(d.artifactId) },
  { key: 'springBoot',    test: (d) => /^spring-boot(-autoconfigure)?$/i.test(d.artifactId) || /^spring-boot-starter/i.test(d.artifactId) },
  { key: 'springDataJpa', test: (d) => /^spring-data-jpa$/i.test(d.artifactId) || /^spring-boot-starter-data-jpa$/i.test(d.artifactId) },
  { key: 'hibernate',     test: (d) => /^hibernate-/i.test(d.artifactId) },
  { key: 'springJdbc',    test: (d) => /^spring-jdbc$/i.test(d.artifactId) },
  { key: 'h2',            test: (d) => /^h2$/i.test(d.artifactId) },
  { key: 'jakarta',       test: (d) => /^jakarta\./i.test(d.groupId) },
  { key: 'javax',         test: (d) => /^javax\./i.test(d.groupId) },
  { key: 'openApi',       test: (d) => /^springdoc-openapi|^swagger-|^springfox-/i.test(d.artifactId) },
  { key: 'jsr310',        test: (d) => /^jackson-datatype-jsr310$/i.test(d.artifactId) },
  // Non-Spring legacy ecosystem markers (Struts, EJB, MyBatis, Axis/JAX-WS, app-server specs)
  { key: 'struts',        test: (d) => /^struts/i.test(d.artifactId) || /^org\.apache\.struts/i.test(d.groupId) },
  { key: 'ejb',           test: (d) => /^javax\.ejb$|^jakarta\.ejb$/i.test(d.groupId) },
  { key: 'mybatis',       test: (d) => /^mybatis/i.test(d.artifactId) },
  { key: 'axisJaxWs',     test: (d) => /^axis|^jax-?ws/i.test(d.artifactId) || /^javax\.xml\.ws$|^jakarta\.xml\.ws$/i.test(d.groupId) },
  { key: 'appServerSpec', test: (d) => /websphere|weblogic/i.test(d.groupId) || /websphere|weblogic/i.test(d.artifactId) },
];

// Splits a Maven version string into comparable numeric/string segments
function parseVersionParts(version) {
  return String(version).split(/[.-]/).map((part) => (/^\d+$/.test(part) ? parseInt(part, 10) : part));
}

function compareVersions(a, b) {
  const partsA = parseVersionParts(a);
  const partsB = parseVersionParts(b);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = partsA[i];
    const pb = partsB[i];
    if (pa === pb) continue;
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    if (typeof pa === 'number' && typeof pb === 'number') return pa - pb;
    return String(pa).localeCompare(String(pb));
  }
  return 0;
}

// Picks the highest version among all matches of a category (dependency trees
// commonly carry multiple resolved/omitted versions of the same artifact).
function highestVersion(matches) {
  return matches.reduce((best, d) => (best === null || compareVersions(d.version, best) > 0 ? d.version : best), null);
}

function extractDependencyMetrics(dependencies) {
  // Single categorical pass: every dependency is classified against every
  // rule in one iteration, instead of re-scanning the whole tree per marker.
  const matches = {};
  for (const rule of DEPENDENCY_CATEGORY_RULES) matches[rule.key] = [];

  for (const dep of dependencies) {
    for (const rule of DEPENDENCY_CATEGORY_RULES) {
      if (rule.test(dep)) matches[rule.key].push(dep);
    }
  }

  const springCoreVersion = highestVersion(matches.springCore.length ? matches.springCore : matches.springWeb);
  const springCoreMajor   = springCoreVersion ? parseInt(springCoreVersion.split('.')[0], 10) : null;

  const springBootVersion = highestVersion(matches.springBoot);
  const springBootMajor   = springBootVersion ? parseInt(springBootVersion.split('.')[0], 10) : null;
  const springBootAdoptionFlag = matches.springBoot.length > 0;

  const jakartaFlag = matches.jakarta.length > 0;
  const javaxFlag   = matches.javax.length > 0;

  const springDataJpaPresent = matches.springDataJpa.length > 0;
  const hibernatePresent     = matches.hibernate.length > 0;
  const springJdbcPresent    = matches.springJdbc.length > 0;
  const h2Present            = matches.h2.length > 0;

  const legacyEcosystem = {
    strutsPresent:        matches.struts.length > 0,
    ejbPresent:           matches.ejb.length > 0,
    mybatisPresent:       matches.mybatis.length > 0,
    axisJaxWsPresent:     matches.axisJaxWs.length > 0,
    appServerSpecPresent: matches.appServerSpec.length > 0,
  };
  const legacyEcosystemCount = Object.values(legacyEcosystem).filter(Boolean).length;

  let persistenceLayer = 'UNKNOWN';
  if (springDataJpaPresent || hibernatePresent) {
    persistenceLayer = 'JPA_HIBERNATE';
  } else if (legacyEcosystem.mybatisPresent) {
    persistenceLayer = 'MYBATIS';
  } else if (springJdbcPresent && h2Present) {
    persistenceLayer = 'JDBC_ONLY';
  } else if (springJdbcPresent) {
    persistenceLayer = 'JDBC_ONLY';
  }

  return {
    springCoreVersion,
    springCoreMajor,
    springBootVersion,
    springBootMajor,
    springBootAdoptionFlag,
    jakartaFlag,
    javaxFlag,
    persistenceLayer,
    springDataJpaPresent,
    springWebPresent: matches.springWeb.length > 0,
    openApiFlag: matches.openApi.length > 0,
    jsr310Flag: matches.jsr310.length > 0,
    legacyEcosystem,
    legacyEcosystemCount,
  };
}

// ---------------------------------------------------------------------------
// Cross-Correlation & Rule Evaluation
// ---------------------------------------------------------------------------
function crossCorrelate(ast, deps) {
  // DAO vs. Persistence Tech: raw DAOs still around while Spring Data JPA is available
  const daoVsPersistenceFlag = ast.rawJdbcDaoCount > 0 && deps.springDataJpaPresent;

  // HTTP Client Modernity: legacy HttpURLConnection usage while modern web stack is available
  const httpClientModernityFlag = ast.httpUrlConnectionFlag && deps.springWebPresent;

  return {
    daoVsPersistenceFlag,
    httpClientModernityFlag,
    mvcConfigStatus: ast.mvcConfigStatus,
  };
}

// ---------------------------------------------------------------------------
// Deterministic Scoring (0-100)
// ---------------------------------------------------------------------------
const WEIGHTS = {
  annotationDensity: 0.35,
  frameworkVersion:  0.35,
  legacyDebt:        0.30,
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function computeScore(ast, deps, cross) {
  // W1: annotation density — annotated classes, Spring controllers, JSR-310 date handling
  const annotationDensityScore = clamp01(
    (ast.annotationRatio + ast.controllerRatio + (deps.jsr310Flag ? 1 : 0)) / 3
  );

  // W2: framework version score — Spring Boot 3.x/Spring 6, Jakarta EE, OpenAPI
  const springBootScore = deps.springBootMajor >= 3 ? 1 : deps.springBootMajor === 2 ? 0.5 : 0;
  const spring6Score    = deps.springCoreMajor >= 6 ? 1 : deps.springCoreMajor === 5 ? 0.5 : 0;
  const jakartaScore    = deps.jakartaFlag && !deps.javaxFlag ? 1 : deps.jakartaFlag ? 0.5 : 0;
  const openApiScore    = deps.openApiFlag ? 1 : 0;
  const frameworkVersionScore = clamp01(
    (springBootScore + spring6Score + jakartaScore + openApiScore) / 4
  );

  // W3: legacy debt penalty — raw JDBC DAOs, HttpURLConnection, interface constants, legacy threads
  const total = ast.totalClasses || 1;
  const legacyEcosystemRatio = deps.legacyEcosystemCount / 5;
  const legacyDebtRatio = clamp01(
    (
      (ast.rawJdbcDaoCount / total) +
      (cross.httpClientModernityFlag ? 1 : 0) +
      (ast.interfaceConstantsCount / total) +
      (ast.legacyConcurrencyCount / total) +
      (ast.legacyJavadocFlagCount / total) +
      legacyEcosystemRatio
    ) / 6
  );

  const rawScore =
    (WEIGHTS.annotationDensity * annotationDensityScore) +
    (WEIGHTS.frameworkVersion  * frameworkVersionScore) -
    (WEIGHTS.legacyDebt        * legacyDebtRatio);

  const modernizationScore = Math.round(clamp01(rawScore) * 100);

  let verdict = 'LEGACY';
  if (modernizationScore >= 70) verdict = 'MODERN';
  else if (modernizationScore >= 40) verdict = 'IN_MODERNIZATION';

  return {
    modernizationScore,
    verdict,
    components: {
      annotationDensityScore: Number(annotationDensityScore.toFixed(3)),
      frameworkVersionScore:  Number(frameworkVersionScore.toFixed(3)),
      legacyDebtRatio:        Number(legacyDebtRatio.toFixed(3)),
    },
  };
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
  if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
    console.error(`ERROR: Project path not found or not a directory: ${projectPath}`);
    process.exit(1);
  }

  const astPath    = path.join(projectPath, 'business-ast-report.json');
  const depsPath   = path.join(projectPath, 'dependency-tree.txt');
  const outputPath = path.join(projectPath, 'modernization-metrics.json');

  if (!fs.existsSync(astPath)) {
    console.error(`ERROR: AST report not found: ${astPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(depsPath)) {
    console.error(`ERROR: Dependency tree not found: ${depsPath}`);
    process.exit(1);
  }

  let classes;
  try {
    classes = JSON.parse(fs.readFileSync(astPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse ${astPath}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(classes)) {
    console.error(`ERROR: ${astPath} must contain a JSON array of class entries.`);
    process.exit(1);
  }

  const depsText = fs.readFileSync(depsPath, 'utf8');

  const astMetrics  = extractAstMetrics(classes);
  const dependencies = parseDependencyTree(depsText);
  const depMetrics  = extractDependencyMetrics(dependencies);
  const cross       = crossCorrelate(astMetrics, depMetrics);
  const scoring     = computeScore(astMetrics, depMetrics, cross);

  const result = {
    astMetrics,
    dependencyMetrics: depMetrics,
    crossCorrelation: cross,
    scoring,
  };

  const resultJson = JSON.stringify(result, null, 2);
  fs.writeFileSync(outputPath, resultJson, 'utf8');
  console.log(resultJson);
}

main();
