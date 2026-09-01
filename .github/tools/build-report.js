#!/usr/bin/env node
/**
 * build-report.js
 * Off-Thread Report Builder for TechnicalReporter.
 *
 * Reads .migration-findings.json (produced by the TechnicalReporter Map phase)
 * and writes the final MIGRATION_PLAN.md (or skill-specific variant).
 *
 * Usage:
 *   node .github/tools/build-report.js \
 *     --input=".migration-findings.json" \
 *     --output="MIGRATION_PLAN.md" \
 *     --projectName="MyProject"
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      const key   = arg.slice(2, eq);
      const raw   = arg.slice(eq + 1);
      // Strip surrounding single or double quotes added by some shells/CLIs
      args[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Sorting helpers
// ---------------------------------------------------------------------------
function skillPriority(skill) {
  return skill === 'springboot3' ? 0 : 1;
}

// springboot3 rules 1-4 block compilation — sort them first within the skill
function rulePriority(skill, rule) {
  if (skill === 'springboot3' && rule <= 4) return rule;
  return 100 + rule;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args        = parseArgs(process.argv);
  const inputPath   = path.resolve(args.input   || '.migration-findings.json');
  const outputPath  = path.resolve(args.output  || 'MIGRATION_PLAN.md');
  const projectName = args.projectName           || 'Project';

  if (!fs.existsSync(inputPath)) {
    console.error(`ERROR: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse ${inputPath}: ${e.message}`);
    process.exit(1);
  }

  const activeSkills = rawData.active_skills || [];
  const rawFindings  = rawData.findings      || [];

  // 1. Deduplicate findings (skill + rule + file + line as identity key)
  const seen     = new Set();
  const findings = [];
  for (const f of rawFindings) {
    const key = `${f.skill}:${f.rule}:${f.file}:${f.line}`;
    if (!seen.has(key)) {
      seen.add(key);
      findings.push(f);
    }
  }

  // 2. Sort & Prioritize
  //    - springboot3 before java21
  //    - within springboot3: blocking rules (1-4) before the rest
  //    - within same skill+priority band: ascending rule number, then file, then line
  findings.sort((a, b) => {
    const sp = skillPriority(a.skill) - skillPriority(b.skill);
    if (sp !== 0) return sp;
    const rp = rulePriority(a.skill, a.rule) - rulePriority(b.skill, b.rule);
    if (rp !== 0) return rp;
    if (a.file < b.file) return -1;
    if (a.file > b.file) return  1;
    return a.line - b.line;
  });

  // 3. Build Markdown
  const dateStr = new Date().toISOString().split('T')[0];

  let md = `# Migration Plan\n\n`;
  md += `**Project:** ${projectName} | **Date:** ${dateStr} | **Files scanned:** ${rawData.files_scanned || 0} | **Findings:** ${findings.length}\n`;
  md += `**Active skills:** ${activeSkills.join(', ')}\n\n`;
  md += `---\n\n`;

  // Executive Summary
  md += `## Executive Summary\n\n`;
  md += `${rawData.summary || 'Automated inspection completed across active rulesets.'}\n\n`;
  md += `---\n\n`;

  // Priority Matrix
  md += `## Priority Matrix\n\n`;
  md += `| Priority | Skill | Rule | Count | Effort | Risk |\n`;
  md += `|---|---|---|---|---|---|\n`;

  // Aggregate counts per (skill, rule) for the matrix
  const ruleMap = new Map();
  for (const f of findings) {
    const k = `${f.skill}:${f.rule}`;
    if (!ruleMap.has(k)) {
      ruleMap.set(k, { skill: f.skill, rule: f.rule, rule_name: f.rule_name || '', count: 0, effort: f.effort || 'Med', risk: f.risk || 'Med' });
    }
    ruleMap.get(k).count++;
  }

  let priority = 1;
  for (const entry of ruleMap.values()) {
    md += `| ${priority++} | ${entry.skill} | Rule ${entry.rule}${entry.rule_name ? ' — ' + entry.rule_name : ''} | ${entry.count} | ${entry.effort} | ${entry.risk} |\n`;
  }
  md += `\n---\n\n`;

  // Findings
  md += `## Findings\n\n`;

  if (findings.length === 0) {
    md += `*No migration issues found.*\n\n`;
  } else {
    let currentSkill = null;
    let currentRule  = null;
    let findingIndex = 1;

    for (const f of findings) {
      // Skill heading
      if (f.skill !== currentSkill) {
        currentSkill = f.skill;
        currentRule  = null;
        const skillLabel = currentSkill === 'springboot3' ? 'Spring Boot 3 Migration' : 'Java 21 Modernization';
        md += `### [Skill: ${skillLabel}]\n\n`;
      }

      // Rule heading
      if (f.rule !== currentRule) {
        currentRule  = f.rule;
        findingIndex = 1;
        const ruleName = f.rule_name ? ` — ${f.rule_name}` : '';
        md += `#### Rule ${f.rule}${ruleName}\n\n`;
      }

      md += `##### Finding ${f.rule}.${findingIndex++}\n`;
      md += `- **File:** \`${f.file}\` | **Line:** ${f.line} | **Effort:** ${f.effort || 'Med'} | **Risk:** ${f.risk || 'Med'}\n`;
      if (f.target_path) {
        md += `- **Target Path:** \`${f.target_path}\`\n`;
      }
      if (f.action === 'manual_action') {
        md += `- **Action:** manual_action\n`;
        if (f.instructions) {
          md += `- **Instructions:** ${f.instructions}\n`;
        }
        md += '\n';
      } else {
        md += `- **Current:**\n\`\`\`java\n${(f.current || '').trimEnd()}\n\`\`\`\n`;
        md += `- **Replacement:**\n\`\`\`java\n${(f.replacement || '').trimEnd()}\n\`\`\`\n\n`;
      }
    }
  }

  // Files with no findings
  if (rawData.compliant_files && rawData.compliant_files.length > 0) {
    md += `---\n\n## Files With No Findings\n\n`;
    for (const f of rawData.compliant_files) {
      md += `- \`${f}\`\n`;
    }
    md += '\n';
  }

  // Compiler & Tooling Checklist
  md += `---\n\n## Compiler & Tooling Checklist\n\n`;
  if (activeSkills.includes('java21') || activeSkills.length === 0) {
    md += `- [ ] \`pom.xml\` / \`build.gradle\` targets Java 21 (\`--release 21\`).  [java21]\n`;
    md += `- [ ] No removed APIs in use (SecurityManager, \`Thread.stop()\`).  [java21]\n`;
    md += `- [ ] \`--enable-preview\` not required — all Java 21 features are final.  [java21]\n`;
  }
  if (activeSkills.includes('springboot3') || activeSkills.length === 0) {
    md += `- [ ] Spring Boot parent upgraded to 3.x.  [springboot3]\n`;
    md += `- [ ] All \`javax.*\` imports replaced with \`jakarta.*\`.  [springboot3]\n`;
    md += `- [ ] \`WebSecurityConfigurerAdapter\` removed.  [springboot3]\n`;
  }
  md += `- [ ] IDE set to target JDK. Test suite passes before and after migration.  [both]\n`;

  // 4. Write output
  fs.writeFileSync(outputPath, md, 'utf8');
  console.log(`Report written to: ${outputPath}`);

  // 5. Clean up temporary input file
  try { fs.unlinkSync(inputPath); } catch (_) {}
  console.log(`Cleaned up: ${inputPath}`);
}

main();
