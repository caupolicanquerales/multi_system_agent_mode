#!/usr/bin/env node
/**
 * render-metrics-report.js
 * Off-Thread Report Renderer for MetricsAnalyzer.
 *
 * Reads modernization-metrics.json (produced by metrics-calculater.js) and
 * deterministically renders MODERNIZATION_REPORT.md — no LLM narrative
 * authoring required, keeping the calling agent's token cost low.
 *
 * Usage:
 *   node .github/tools/render-metrics-report.js \
 *     --input="<project_path>/modernization-metrics.json" \
 *     --output="<project_path>/MODERNIZATION_REPORT.md" \
 *     --projectName="MyProject"
 *
 * Prints a single `RESULT: {...}` line to stdout with
 * { modernization_score, verdict, report_path } so the calling agent can
 * parse the outcome straight from terminal output — no read_file needed.
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

function pct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}

const VERDICT_BADGE = {
  LEGACY: '🔴 LEGACY',
  IN_MODERNIZATION: '🟡 IN_MODERNIZATION',
  MODERN: '🟢 MODERN',
};

const LEGACY_ECOSYSTEM_LABELS = {
  strutsPresent: 'Struts',
  ejbPresent: 'EJB',
  mybatisPresent: 'MyBatis',
  axisJaxWsPresent: 'Axis/JAX-WS',
  appServerSpecPresent: 'App-server specs (WebSphere/WebLogic)',
};

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
function renderHeader(projectName, scoring) {
  const dateStr = new Date().toISOString().split('T')[0];
  const badge   = VERDICT_BADGE[scoring.verdict] || scoring.verdict || 'UNKNOWN';
  return `# Modernization Report\n\n` +
    `**Project:** ${projectName} | **Date:** ${dateStr} | **Verdict:** ${badge} | **Score:** ${scoring.modernizationScore ?? '-'}/100\n\n---\n\n`;
}

function renderScoringBreakdown(scoring) {
  const c = scoring.components || {};
  let md = `## Scoring Breakdown\n\n`;
  md += `| Component | Weight | Value | Contribution |\n|---|---|---|---|\n`;
  md += `| Annotation Density | 35% | ${c.annotationDensityScore ?? '-'} | +${((c.annotationDensityScore || 0) * 0.35).toFixed(3)} |\n`;
  md += `| Framework Version | 35% | ${c.frameworkVersionScore ?? '-'} | +${((c.frameworkVersionScore || 0) * 0.35).toFixed(3)} |\n`;
  md += `| Legacy Debt (penalty) | -30% | ${c.legacyDebtRatio ?? '-'} | -${((c.legacyDebtRatio || 0) * 0.30).toFixed(3)} |\n\n---\n\n`;
  return md;
}

function renderStructuralMetrics(ast) {
  let md = `## Structural Code Metrics\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Total Classes | ${ast.totalClasses ?? '-'} |\n`;
  md += `| Annotated Classes | ${ast.classesWithAnnotations ?? '-'} (${pct(ast.annotationRatio)}) |\n`;
  md += `| Controller Ratio | ${pct(ast.controllerRatio)} (${ast.controllerCount ?? '-'} controllers) |\n`;
  md += `| Interface Constants (anti-pattern) | ${ast.interfaceConstantsCount ?? '-'} |\n`;
  md += `| Raw JDBC DAO Count | ${ast.rawJdbcDaoCount ?? '-'} |\n`;
  md += `| Legacy Concurrency Markers | ${ast.legacyConcurrencyCount ?? '-'} |\n`;
  md += `| Legacy Javadoc Flags | ${ast.legacyJavadocFlagCount ?? '-'} |\n`;
  md += `| MVC Config Status | ${ast.mvcConfigStatus ?? '-'} |\n\n---\n\n`;
  return md;
}

function renderDependencyMetrics(deps) {
  let md = `## Dependency Metrics\n\n`;
  md += `| Metric | Value |\n|---|---|\n`;
  md += `| Spring Core Version | ${deps.springCoreVersion ?? '-'} |\n`;
  md += `| Spring Boot Version | ${deps.springBootVersion ?? '-'} (adopted: ${deps.springBootAdoptionFlag ? 'yes' : 'no'}) |\n`;
  md += `| Jakarta / javax | jakarta: ${deps.jakartaFlag ? 'yes' : 'no'} · javax: ${deps.javaxFlag ? 'yes' : 'no'} |\n`;
  md += `| Persistence Layer | ${deps.persistenceLayer ?? '-'} |\n`;
  md += `| OpenAPI | ${deps.openApiFlag ? 'present' : 'absent'} |\n`;
  md += `| JSR-310 (java.time Jackson support) | ${deps.jsr310Flag ? 'present' : 'absent'} |\n\n`;

  const legacyEco = deps.legacyEcosystem || {};
  if ((deps.legacyEcosystemCount || 0) > 0) {
    md += `**Legacy ecosystem markers detected (${deps.legacyEcosystemCount}):**\n\n`;
    for (const [key, label] of Object.entries(LEGACY_ECOSYSTEM_LABELS)) {
      if (legacyEco[key]) md += `- ${label}\n`;
    }
    md += '\n';
  }
  md += `---\n\n`;
  return md;
}

function renderCrossCorrelation(cross, ast) {
  let md = `## Cross-Correlation Findings\n\n`;
  const findings = [];

  if (cross.daoVsPersistenceFlag) {
    findings.push(`- **DAO vs. Persistence Tech:** ${ast.rawJdbcDaoCount || 0} raw JDBC DAO(s) remain even though Spring Data JPA is available on the classpath — prime candidates for migration to Spring Data repositories.`);
  }
  if (cross.httpClientModernityFlag) {
    findings.push('- **HTTP Client Modernity:** legacy `HttpURLConnection` usage detected while a modern Spring Web stack is present — replace with `RestClient`/`WebClient`.');
  }
  if (cross.mvcConfigStatus === 'MIGRATED') {
    findings.push('- **MVC Configuration:** already migrated to `@Configuration`-based Spring Boot auto-configuration (no `@EnableWebMvc`, no XML).');
  } else if (cross.mvcConfigStatus === 'LEGACY_XML') {
    findings.push('- **MVC Configuration:** still relying on legacy XML/`@EnableWebMvc` configuration — migrate to Boot\'s auto-configuration.');
  } else if (cross.mvcConfigStatus === 'NOT_FOUND') {
    findings.push('- **MVC Configuration:** no `WebMvcConfig` class found — verify the MVC configuration approach manually.');
  }

  md += findings.length ? `${findings.join('\n')}\n\n` : '*No cross-correlation flags triggered.*\n\n';
  md += `---\n\n`;
  return md;
}

function renderRecommendations(ast, deps, cross) {
  const recs = [];
  if ((ast.rawJdbcDaoCount || 0) > 0) {
    recs.push(`Migrate the ${ast.rawJdbcDaoCount} raw JDBC DAO(s) to Spring Data JPA repositories.`);
  }
  if (cross.httpClientModernityFlag) {
    recs.push('Replace `HttpURLConnection` usage with `RestClient`/`WebClient`.');
  }
  if ((ast.interfaceConstantsCount || 0) > 0) {
    recs.push(`Refactor the ${ast.interfaceConstantsCount} interface-constants anti-pattern occurrence(s) into proper constant classes/enums.`);
  }
  if ((ast.legacyConcurrencyCount || 0) > 0) {
    recs.push(`Replace ${ast.legacyConcurrencyCount} legacy concurrency marker(s) (raw Runnable/Callable/ExecutorService) with Spring Async or CompletableFuture.`);
  }
  if (deps.javaxFlag) {
    recs.push('Complete the `javax.*` → `jakarta.*` namespace migration.');
  }
  if (!deps.openApiFlag) {
    recs.push('Add OpenAPI/Swagger documentation (SpringDoc) for API discoverability.');
  }
  if ((deps.legacyEcosystemCount || 0) > 0) {
    recs.push('Plan a dedicated migration track for the detected legacy ecosystem dependencies (Struts/EJB/MyBatis/Axis/app-server specs).');
  }
  if ((ast.annotationRatio || 0) < 0.5) {
    recs.push('Increase Spring annotation-driven configuration coverage to reduce manual wiring.');
  }
  if (recs.length === 0) {
    recs.push('No immediate high-priority modernization gaps detected — continue monitoring dependency versions.');
  }

  let md = `## Recommendations\n\n`;
  md += recs.slice(0, 6).map(r => `- ${r}`).join('\n');
  md += '\n';
  return md;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args        = parseArgs(process.argv);
  const inputPath   = path.resolve(args.input  || 'modernization-metrics.json');
  const outputPath  = path.resolve(args.output || 'MODERNIZATION_REPORT.md');
  const projectName = args.projectName || 'Project';

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse ${inputPath}: ${e.message}`);
    process.exit(1);
  }

  const astMetrics        = data.astMetrics        || {};
  const dependencyMetrics = data.dependencyMetrics || {};
  const crossCorrelation  = data.crossCorrelation  || {};
  const scoring           = data.scoring           || {};

  let md = renderHeader(projectName, scoring);
  md += renderScoringBreakdown(scoring);
  md += renderStructuralMetrics(astMetrics);
  md += renderDependencyMetrics(dependencyMetrics);
  md += renderCrossCorrelation(crossCorrelation, astMetrics);
  md += renderRecommendations(astMetrics, dependencyMetrics, crossCorrelation);

  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`Report written to: ${outputPath}`);

  // Compact machine-readable summary — lets the calling agent avoid read_file entirely.
  console.log(`RESULT: ${JSON.stringify({
    modernization_score: scoring.modernizationScore ?? null,
    verdict: scoring.verdict ?? null,
    report_path: outputPath,
  })}`);
}

main();
