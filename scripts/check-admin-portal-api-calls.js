#!/usr/bin/env node

/**
 * Scan Admin Portal Vue files for API calls and check against defined API methods
 * This helps identify missing endpoints before runtime errors occur
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_PORTAL_DIR = path.join(__dirname, '../irisx-admin-portal/src');
const API_FILE = path.join(__dirname, '../irisx-admin-portal/src/utils/api.js');

// Parse the API file to extract all defined endpoints
function parseAPIFile() {
  const apiContent = fs.readFileSync(API_FILE, 'utf-8');

  const apis = {};
  let currentSection = null;

  // Match patterns like: apiName: { method: () => ... }
  const lines = apiContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for section start (e.g., "auth: {")
    const sectionMatch = line.match(/^(\w+):\s*{/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (currentSection !== 'headers' && currentSection !== 'baseURL') {
        apis[currentSection] = [];
      }
      continue;
    }

    // Check for method definition (e.g., "login: (email, password) =>")
    if (currentSection && apis[currentSection]) {
      const methodMatch = line.match(/^(\w+):\s*\([^)]*\)\s*=>/);
      if (methodMatch) {
        apis[currentSection].push(methodMatch[1]);
      }
    }
  }

  return apis;
}

// Recursively find all .vue files
function findVueFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findVueFiles(fullPath, files);
    } else if (entry.name.endsWith('.vue')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Extract API calls from Vue file
function extractAPICalls(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const calls = [];

  // Pattern: adminAPI.section.method(...)
  const regex = /adminAPI\.(\w+)\.(\w+)\(/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    calls.push({
      section: match[1],
      method: match[2],
      line: content.substring(0, match.index).split('\n').length
    });
  }

  return calls;
}

// Main execution
console.log('🔍 Scanning Admin Portal Vue files for API calls...\n');

const definedAPIs = parseAPIFile();
console.log('📋 Defined API sections:');
Object.keys(definedAPIs).forEach(section => {
  console.log(`   ${section}: ${definedAPIs[section].join(', ')}`);
});
console.log();

const vueFiles = findVueFiles(ADMIN_PORTAL_DIR);
console.log(`📁 Found ${vueFiles.length} Vue files\n`);

const issues = [];
const validCalls = [];

for (const file of vueFiles) {
  const relativePath = path.relative(ADMIN_PORTAL_DIR, file);
  const calls = extractAPICalls(file);

  if (calls.length === 0) continue;

  for (const call of calls) {
    const { section, method, line } = call;

    // Check if section exists
    if (!definedAPIs[section]) {
      issues.push({
        file: relativePath,
        line,
        issue: `Section '${section}' does not exist in adminAPI`,
        call: `adminAPI.${section}.${method}()`
      });
      continue;
    }

    // Check if method exists in section
    if (!definedAPIs[section].includes(method)) {
      issues.push({
        file: relativePath,
        line,
        issue: `Method '${method}' does not exist in adminAPI.${section}`,
        call: `adminAPI.${section}.${method}()`,
        availableMethods: definedAPIs[section].join(', ')
      });
    } else {
      validCalls.push({
        file: relativePath,
        call: `adminAPI.${section}.${method}()`
      });
    }
  }
}

// Report results
if (issues.length === 0) {
  console.log('✅ No API issues found!\n');
  console.log(`   Found ${validCalls.length} valid API calls`);
} else {
  console.log(`❌ Found ${issues.length} API issues:\n`);

  issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue.file}:${issue.line}`);
    console.log(`   Call: ${issue.call}`);
    console.log(`   Issue: ${issue.issue}`);
    if (issue.availableMethods) {
      console.log(`   Available methods: ${issue.availableMethods}`);
    }
    console.log();
  });

  console.log(`\n✅ Also found ${validCalls.length} valid API calls`);
}

// Group issues by file
console.log('\n📊 Issues by file:');
const fileGroups = {};
issues.forEach(issue => {
  if (!fileGroups[issue.file]) {
    fileGroups[issue.file] = [];
  }
  fileGroups[issue.file].push(issue);
});

Object.entries(fileGroups).forEach(([file, fileIssues]) => {
  console.log(`\n   ${file}: ${fileIssues.length} issue(s)`);
  fileIssues.forEach(issue => {
    console.log(`     Line ${issue.line}: ${issue.call}`);
  });
});

process.exit(issues.length > 0 ? 1 : 0);
