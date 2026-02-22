#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS, callTool } from './tools/shared-tools.js';

const SERVER_NAME = 'eu.ansvar/sanctions-law';
const SERVER_VERSION = '0.1.0';
const DB_ENV_VAR = 'SANCTIONS_LAW_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

let dbInstance: Database.Database | null = null;

function getDefaultDbPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

function getDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

function closeDb(): void {
  if (!dbInstance) {
    return;
  }
  dbInstance.close();
  dbInstance = null;
}

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await callTool(getDb(), name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
