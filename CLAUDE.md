# CLAUDE.md

> Instructions for Claude Code when working on this MCP server

## Project Overview

This is an MCP (Model Context Protocol) server that provides AI assistants access to [YOUR CONTENT DOMAIN]. Built with TypeScript and SQLite FTS5 for full-text search.

## Architecture

```
src/
├── index.ts           # MCP server entry point (stdio transport)
└── tools/
    ├── search.ts      # Full-text search across all content
    ├── get-item.ts    # Retrieve specific items by ID
    ├── list.ts        # List sources and their contents
    └── definitions.ts # Look up term definitions

scripts/
├── build-db.ts        # Build SQLite database from seed files
├── ingest-source.ts   # Ingest content from external sources
└── check-updates.ts   # Check if sources have been updated

tests/
├── fixtures/
│   └── test-db.ts     # In-memory test database with sample data
└── tools/             # Tool unit tests

data/
├── seed/              # JSON seed files for each source
└── database.db        # SQLite database (built from seed)
```

## Key Patterns

### Database Access

Always use parameterized queries to prevent SQL injection:

```typescript
// Good
db.prepare('SELECT * FROM items WHERE id = ?').get(id);

// Bad - never do this
db.prepare(`SELECT * FROM items WHERE id = '${id}'`);
```

### FTS5 Search

Escape user input before FTS5 queries:

```typescript
function escapeFTS(query: string): string {
  return '"' + query.replace(/"/g, '""') + '"';
}

db.prepare(`
  SELECT *, snippet(items_fts, 0, '→', '←', '...', 32) as snippet
  FROM items_fts
  WHERE items_fts MATCH ?
  ORDER BY bm25(items_fts)
`).all(escapeFTS(userQuery));
```

### Error Handling

Return MCP-formatted errors:

```typescript
if (!result) {
  return {
    content: [{ type: 'text', text: 'Item not found' }],
    isError: true
  };
}
```

## Common Commands

```bash
# Development
npm run dev              # Run server with tsx (hot reload)
npm run build            # Compile TypeScript
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode

# Data Management
npm run ingest -- <id> <output.json>   # Ingest a source
npm run build:db                        # Rebuild database from seed
npm run check-updates                   # Check for source updates

# Testing with MCP Inspector
npx @anthropic/mcp-inspector node dist/index.js
```

## Adding a New Tool

1. Create tool file in `src/tools/`:
   ```typescript
   import Database from 'better-sqlite3';

   export interface MyToolArgs {
     param1: string;
     param2?: number;
   }

   export function myTool(db: Database.Database, args: MyToolArgs) {
     // Implementation
     return {
       content: [{ type: 'text', text: JSON.stringify(result) }]
     };
   }
   ```

2. Register in `src/index.ts`:
   - Add to `TOOLS` array with JSON Schema
   - Add case to `CallToolRequestSchema` handler
   - Import the function

3. Create test in `tests/tools/my-tool.test.ts`

## Testing

Tests use an in-memory SQLite database with sample data:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestDb } from '../fixtures/test-db';
import { myTool } from '../../src/tools/my-tool';

describe('myTool', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  it('should return expected results', () => {
    const result = myTool(db, { param1: 'test' });
    expect(result.content[0].text).toContain('expected');
  });
});
```

## Database Schema

```sql
-- Sources (e.g., regulations, statutes)
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  last_updated TEXT
);

-- Items (e.g., articles, sections)
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,  -- JSON
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

-- Full-text search index
CREATE VIRTUAL TABLE items_fts USING fts5(
  content,
  title,
  content='items',
  content_rowid='id'
);

-- Definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  source_id TEXT NOT NULL,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);
```

## MCP Protocol Notes

- This server uses **stdio transport** (stdin/stdout)
- Tools receive JSON arguments and return `{ content: [...], isError?: boolean }`
- Content items can be `{ type: 'text', text: string }` or `{ type: 'resource', resource: {...} }`

## Deployment Checklist

Before publishing:
- [ ] Update `package.json` with correct name, description, repository
- [ ] Update `src/index.ts` with SERVER_NAME, SERVER_VERSION
- [ ] Update `smithery.yaml` with correct metadata
- [ ] Update `LICENSE` with correct year and organization
- [ ] Build and test: `npm run build && npm test`
- [ ] Test MCP protocol: `npx @anthropic/mcp-inspector node dist/index.js`

## Resources

- [MCP Specification](https://modelcontextprotocol.io/)
- [SKELETON.md](./SKELETON.md) - Detailed architecture documentation
- [CHECKLIST.md](./CHECKLIST.md) - Step-by-step setup guide
- [PATTERNS.md](./PATTERNS.md) - Code patterns and conventions
- [PUBLISHING.md](./PUBLISHING.md) - Publishing to npm and registries

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a Pull Request.
- Branch protection requires: verified signatures, PR review, and status checks to pass.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, etc.
