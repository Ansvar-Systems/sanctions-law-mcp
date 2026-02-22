#!/usr/bin/env tsx
/**
 * Fetch upstream data from official sources.
 * This is a wrapper that delegates to the existing ingest.ts script.
 * Used by the automated ingest.yml GitHub Actions workflow.
 */
import { execFileSync } from 'node:child_process';

console.log('sanctions-law-mcp: fetching upstream data...');
execFileSync('npx', ['tsx', 'scripts/ingest.ts', '--full-corpus'], { stdio: 'inherit' });
