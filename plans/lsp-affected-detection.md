# LSP-Based Affected Package Detection for Validation Hooks

## Problem

Validation hooks currently have no way to know which packages are affected by a set of changed files. In monorepos, this means either:

- Running all test suites on every turn (slow, wasteful)
- Relying on tool-specific solutions like `turbo --filter` (not language-agnostic)
- Using `run_if_files_match` with extension globs (can't scope to packages)

We need a language-agnostic way to answer: "given these changed files, which parts of the codebase are affected?"

## Proposal

Use LSP servers — managed by the weaver server — to build a file-level dependency graph. The validation runner queries this graph to resolve a new `{{affected_dirs}}` template variable that scopes test commands to only affected packages/directories. When no LSP is available, fall back to import-pattern grep analysis. When neither works, run everything (safe default).

## Architecture

```
Agent writes files → stop hook → validation runner
                                   │
                                   ├── extracts changed files from session log
                                   ├── POST /api/affected { changedFiles, sessionId }
                                   │         │
                                   │     weaver server
                                   │         ├── LSP discovery service
                                   │         │     ├── scans known install locations (Mason, VS Code, Homebrew, etc.)
                                   │         │     ├── selects best available LSP binary per language
                                   │         │     └── caches discovery results
                                   │         │
                                   │         ├── LSP bridge service
                                   │         │     ├── starts/reuses LSP server for workspace
                                   │         │     ├── for each changed file:
                                   │         │     │     ├── documentSymbol → exported symbols
                                   │         │     │     └── references → files that import them
                                   │         │     └── returns affected file set
                                   │         │
                                   │         ├── grep fallback (when no LSP available)
                                   │         │     ├── scan for import/require/use statements referencing changed files
                                   │         │     └── returns approximate affected file set
                                   │         │
                                   │         └── maps affected files → directories (using scope config)
                                   │
                                   ├── receives affected dirs
                                   └── substitutes {{affected_dirs}} in test commands
```

## LSP Discovery Service

New service in `server/src/services/lsp-discovery/`.

The discovery service finds LSP binaries across editor ecosystems without requiring user configuration. It scans known install locations, validates binaries are executable, and selects the best available option per language.

### Discovery Chain

For each language, check locations in priority order (first match wins):

```
1. .weaver config override (explicit user choice)
2. $PATH (globally installed, works everywhere)
3. Mason — ~/.local/share/nvim/mason/bin/ (Neovim)
4. VS Code extensions — ~/.vscode/extensions/*/server/ (VS Code / Cursor)
5. Homebrew — /opt/homebrew/bin/, /usr/local/bin/ (macOS)
6. npm global — $(npm root -g)/ (Node.js LSPs)
7. pip/pipx — ~/.local/bin/ (Python LSPs)
8. cargo — ~/.cargo/bin/ (Rust LSPs)
9. go — ~/go/bin/ (Go LSPs)
```

Priority rationale: explicit config wins, then PATH (user's intent), then editor-managed installs (known-good versions), then package managers.

### Editor-Specific Discovery

#### Neovim (Mason)

Mason is the most common LSP package manager for Neovim. All binaries go to a single predictable directory.

| Path                                     | Notes                           |
| ---------------------------------------- | ------------------------------- |
| `~/.local/share/nvim/mason/bin/<binary>` | Standard Mason install location |
| `$XDG_DATA_HOME/nvim/mason/bin/<binary>` | Respects XDG if set             |

Mason binaries are standalone executables or shell wrappers — no special invocation needed.

#### VS Code / Cursor

VS Code bundles LSP servers inside extensions. The binary locations are less predictable but follow patterns.

| Path                                                    | Notes                             |
| ------------------------------------------------------- | --------------------------------- |
| `~/.vscode/extensions/<ext>/node_modules/.bin/<binary>` | npm-based LSP servers             |
| `~/.vscode/extensions/<ext>/server/out/<binary>`        | Bundled servers                   |
| `~/.cursor/extensions/<ext>/...`                        | Cursor uses same extension format |
| `~/.vscode-insiders/extensions/<ext>/...`               | VS Code Insiders                  |

Known extension → binary mappings:

| Extension ID                       | Binary / Entry Point                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `ms-vscode.vscode-typescript-next` | Uses VS Code's built-in tsserver (not standalone)           |
| `ms-python.vscode-pylance`         | `pylance-langserver` (proprietary, may not work standalone) |
| `rust-lang.rust-analyzer`          | `rust-analyzer` binary in extension dir                     |
| `golang.go`                        | Uses system `gopls` (not bundled)                           |

Caveat: some VS Code LSP servers (Pylance, TypeScript) are tightly coupled to the editor and won't work standalone. Discovery should validate by attempting a handshake before marking as available.

#### JetBrains

JetBrains IDEs use their own language engine, not LSP. They do ship some LSP servers for specific features but these aren't usable externally. Skip JetBrains for LSP discovery.

However, JetBrains projects often have build tool configs (Gradle, Maven, Cargo.toml) that encode the dependency graph. This could be a future Layer 2 enhancement.

#### Sublime Text

Sublime's LSP package (`LSP`) delegates to system-installed LSP binaries. No bundled servers — discovery falls through to PATH/Mason/Homebrew checks.

#### Helix / Zed / Other Modern Editors

These editors also use system-installed LSP binaries (no bundled servers). Same as Sublime — discovery falls through to PATH checks.

### Discovery Result

```typescript
interface LspDiscoveryResult {
  language: string; // e.g. "typescript", "python"
  binary: string; // absolute path to executable
  args: string[]; // e.g. ["--stdio"]
  source: string; // e.g. "mason", "vscode-extension", "path", "config"
  validated: boolean; // true if handshake succeeded
}
```

### Discovery Caching

- Cache results per machine (write to `~/.weaver/lsp-cache.json`)
- Invalidate on: binary not found at cached path, weaver version upgrade, manual `weaver lsp refresh`
- TTL: 24 hours (re-scan daily to pick up new installs)

### Language → LSP Binary Mapping

Built-in defaults (used when no config override):

| Extensions                   | LSP Binary Name              | `--stdio`          | Notes                         |
| ---------------------------- | ---------------------------- | ------------------ | ----------------------------- |
| `.ts`, `.tsx`, `.js`, `.jsx` | `typescript-language-server` | Yes                | Most common, works standalone |
| `.py`                        | `pyright-langserver`         | Yes                | Open source, fast             |
| `.py` (alt)                  | `pylsp`                      | Yes                | Python LSP Server (community) |
| `.rs`                        | `rust-analyzer`              | Default mode       | No `--stdio` flag needed      |
| `.go`                        | `gopls`                      | `serve` subcommand | `gopls serve` for stdio mode  |
| `.rb`                        | `ruby-lsp`                   | Yes                | Shopify's Ruby LSP            |
| `.rb` (alt)                  | `solargraph`                 | `stdio` subcommand | Older, still common           |
| `.java`                      | `jdtls`                      | Requires wrapper   | Eclipse JDT.LS, complex setup |
| `.lua`                       | `lua-language-server`        | Yes                | Common for Neovim configs     |
| `.ex`, `.exs`                | `elixir-ls`                  | Yes                | Elixir                        |
| `.c`, `.cpp`, `.h`           | `clangd`                     | Yes                | LLVM project                  |

When multiple LSP options exist for a language (e.g. `pyright` vs `pylsp`), try in listed order.

### Config Override

Users can specify exact LSP commands in `.weaver` to skip discovery:

```json
{
  "validation": {
    "lsp": {
      "servers": [
        {
          "languages": ["ts", "tsx", "js", "jsx"],
          "command": "typescript-language-server",
          "args": ["--stdio"]
        },
        {
          "languages": ["py"],
          "command": "/path/to/custom/pyright-langserver",
          "args": ["--stdio"]
        }
      ]
    }
  }
}
```

Config entries skip discovery entirely for their languages. Discovery still runs for unconfigured languages.

## LSP Bridge Service

New service in `server/src/services/lsp-bridge/`.

### Responsibilities

1. **LSP server lifecycle** — start, initialize, keep warm, shut down
2. **Dependency queries** — find affected files given a set of changed files
3. **Caching** — avoid redundant queries within a turn

### LSP Server Management

| Event                                           | Action                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| First `/api/affected` call for a workspace      | Discover LSP binary, start server, wait for initialization, query |
| Subsequent calls (same workspace)               | Reuse running server                                              |
| Session ends (no active sessions for workspace) | Kill LSP server after idle timeout (5 min)                        |
| Server crash                                    | Log warning, fall through to grep fallback                        |

### Dependency Query Algorithm

For each changed file:

1. **Get exports** — `textDocument/documentSymbol` request, filter to exported/public symbols
2. **Find references** — `textDocument/references` for each exported symbol, collect unique file URIs
3. **Deduplicate** — union all referencing files across all changed files
4. **Include changed files themselves** — they're always "affected"
5. **Map to directories** — apply the existing `scope` logic to derive test directories

Optimization: if a changed file has no exports (e.g. a test file, a config file), skip the references query — only the file itself is affected.

### Caching

- Cache `documentSymbol` and `references` results within a single validation run
- LSP servers maintain their own internal index — subsequent queries are fast after initial indexing
- No cross-turn caching needed (LSP server stays warm, its internal cache handles this)

## Grep Fallback

When no LSP server is available for a language, fall back to import-pattern grep analysis.

New service in `server/src/services/grep-deps/`.

### How It Works

For each changed file, grep the workspace for import statements that reference it:

```bash
# TypeScript/JavaScript
grep -rl "from ['\"].*changed-module['\"]" --include='*.ts' --include='*.tsx'

# Python
grep -rl "^from changed_module import\|^import changed_module" --include='*.py'

# Go
grep -rl "\"project/path/to/changed/package\"" --include='*.go'

# Rust
grep -rl "use crate::changed_module\|mod changed_module" --include='*.rs'

# Ruby
grep -rl "require.*changed_module\|require_relative.*changed_module" --include='*.rb'
```

### Language-Specific Import Patterns

| Language      | Import Pattern                                   | Grep Strategy                                               |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| TypeScript/JS | `import ... from './path'` / `require('./path')` | Match module specifier against changed file's relative path |
| Python        | `from module import ...` / `import module`       | Match module name (dot-separated path)                      |
| Go            | `import "pkg/path"`                              | Match full import path                                      |
| Rust          | `use crate::module` / `mod module`               | Match module path segments                                  |
| Ruby          | `require 'path'` / `require_relative 'path'`     | Match require argument                                      |
| Elixir        | `alias Module` / `import Module`                 | Match module name                                           |

### Limitations

- Won't catch dynamic imports (`import()` in JS, `importlib` in Python)
- Won't catch re-exports through barrel files accurately
- May produce false positives (commented-out imports, string matches)
- Slower than LSP for large codebases (full grep scan vs indexed lookup)

### When Grep Is Used

```
{{affected_dirs}} requested
  → LSP available? → YES → use LSP (precise)
  → LSP available? → NO  → grep fallback (approximate)
  → grep finds results? → YES → use grep results
  → grep finds results? → NO  → fall back to "." (run everything)
```

## API

### `POST /api/affected`

Request:

```json
{
  "sessionId": "abc-123",
  "changedFiles": [
    "/Users/me/project/shared/types/validation.ts",
    "/Users/me/project/hook-handler/src/validate.ts"
  ],
  "cwd": "/Users/me/project"
}
```

Response:

```json
{
  "affectedFiles": [
    "/Users/me/project/server/src/services/log-parser.ts",
    "/Users/me/project/client/src/components/ValidationBanner.tsx",
    "/Users/me/project/hook-handler/src/validate.ts",
    "/Users/me/project/hook-handler/src/inject.ts",
    "/Users/me/project/shared/types/validation.ts"
  ],
  "affectedDirs": ["server", "client", "hook-handler", "shared"],
  "strategy": "lsp",
  "lspSource": "mason",
  "timing": { "queryMs": 120, "serverStartMs": 0 }
}
```

When using grep fallback:

```json
{
  "affectedFiles": [...],
  "affectedDirs": ["server", "hook-handler", "shared"],
  "strategy": "grep",
  "timing": { "queryMs": 340 }
}
```

When nothing is available:

```json
{
  "affectedFiles": [],
  "affectedDirs": [],
  "strategy": "none",
  "fallbackReason": "no LSP binary found, grep produced no results"
}
```

### `GET /api/lsp/status`

Returns discovery results and running server status (useful for debugging):

```json
{
  "discovered": [
    {
      "language": "typescript",
      "binary": "/Users/me/.local/share/nvim/mason/bin/typescript-language-server",
      "source": "mason",
      "validated": true
    },
    {
      "language": "rust",
      "binary": "/opt/homebrew/bin/rust-analyzer",
      "source": "homebrew",
      "validated": true
    }
  ],
  "running": [
    {
      "language": "typescript",
      "workspace": "/Users/me/project",
      "pid": 12345,
      "uptime": "4m 32s"
    }
  ]
}
```

### `POST /api/lsp/refresh`

Force re-run discovery (e.g. after installing a new LSP server):

```json
{ "discovered": [...] }
```

## Validation Runner Changes

### New template variable: `{{affected_dirs}}`

Space-separated list of affected directories (relative to CWD). Resolution:

1. If command uses `{{affected_dirs}}`:
   a. Call `POST /api/affected` with changed files
   b. If `strategy: "lsp"` or `strategy: "grep"` → use `affectedDirs` with scope dedup
   c. If `strategy: "none"` → resolve to `"."` (safe fallback, run everything)
2. If weaver server is unreachable → resolve to `"."` (safe fallback)

### Example configs

Monorepo with LSP-powered scoping:

```json
{
  "validation": {
    "stop": [
      {
        "name": "test:affected",
        "command": "npx jest {{affected_dirs}}",
        "scope": "parent",
        "run_if_files_match": "**/*.{ts,tsx}",
        "timeout_ms": 60000
      }
    ]
  }
}
```

Mixed strategy (turbo for build, LSP for tests):

```json
{
  "validation": {
    "stop": [
      {
        "name": "build",
        "command": "npx turbo build",
        "timeout_ms": 60000
      },
      {
        "name": "test:affected",
        "command": "npx jest {{affected_dirs}}",
        "scope": "parent",
        "run_if_files_match": "**/*.{ts,tsx}",
        "timeout_ms": 60000
      }
    ]
  }
}
```

## Fallback Behavior

The system must never block or break validation when LSP/grep is unavailable:

| Scenario                                | Behavior                                      |
| --------------------------------------- | --------------------------------------------- |
| LSP binary not found anywhere           | Fall through to grep                          |
| LSP server fails to initialize          | Fall through to grep, kill server             |
| LSP query times out (> 10s)             | Fall through to grep                          |
| Grep produces no results                | `{{affected_dirs}}` → `"."`                   |
| Weaver server not running               | `{{affected_dirs}}` → `"."` (HTTP call fails) |
| LSP returns empty references            | Include changed files' own directories only   |
| `{{affected_dirs}}` not used in command | Skip all LSP/grep work entirely               |

## Performance Considerations

- **Cold start**: First query per workspace pays LSP initialization cost (1-5s for TypeScript, longer for Rust). Subsequent queries are fast (<200ms).
- **Warm server**: LSP servers stay running between turns, so only the first turn per session has cold start overhead.
- **Query timeout**: 10s max per `/api/affected` call. If LSP is slow, fall back to grep.
- **Grep performance**: Full workspace grep takes 100-500ms for typical projects. Acceptable as a fallback.
- **Lazy startup**: Only start LSP when a command actually uses `{{affected_dirs}}`. No overhead for configs that don't use it.
- **Discovery cost**: First scan takes ~50ms (filesystem checks). Cached for 24 hours.

## Implementation Steps

### Phase 2a: LSP discovery service

1. Create `server/src/services/lsp-discovery/` with scanner for Mason, VS Code, PATH, Homebrew, etc.
2. Implement language → binary mapping with priority chain
3. Add binary validation (check executable, attempt LSP handshake)
4. Add discovery caching (`~/.weaver/lsp-cache.json`)
5. Add `GET /api/lsp/status` and `POST /api/lsp/refresh` routes

### Phase 2b: LSP bridge service

1. Create `server/src/services/lsp-bridge/` with LSP client implementation (stdio transport)
2. Implement server lifecycle (start, initialize, keep warm, idle shutdown)
3. Implement dependency query (documentSymbol → references → affected files)
4. Handle multi-language workspaces (one LSP server per language)

### Phase 2c: Grep fallback service

1. Create `server/src/services/grep-deps/` with language-specific import pattern matching
2. Implement grep-based dependency resolution for top languages (TS/JS, Python, Go, Rust, Ruby)
3. Map grep results to affected directories

### Phase 2d: API and validation runner integration

1. Add `POST /api/affected` route that orchestrates LSP → grep → none fallback
2. Add `{{affected_dirs}}` template variable to validation runner
3. Implement fallback logic and timeout handling
4. Update VALIDATION.md

### Phase 2e: Testing

1. Unit tests for LSP discovery (mock filesystem for each editor's install locations)
2. Unit tests for LSP bridge (mock LSP protocol messages)
3. Unit tests for grep fallback (fixture files with known import patterns)
4. Unit tests for affected dirs resolution in validation runner
5. Integration test: start real `typescript-language-server`, query a small fixture project
6. Fallback chain tests: LSP unavailable → grep → none

### Phase 2f: CLI integration

1. Add `weaver lsp status` command — shows discovered LSP servers and running instances
2. Add `weaver lsp refresh` command — force re-scan

## Open Questions

1. **Multiple languages in one workspace** — start one LSP server per language detected in changed files? Or pre-start for all detected languages?
2. **Incremental updates** — should we send `textDocument/didChange` notifications to the LSP server when the agent writes files mid-turn, so the index stays current?
3. **Cross-language dependencies** — e.g. a Python service calling a TypeScript API via generated types. LSP can't see across languages. Accept this limitation or add heuristics?
4. **VS Code Pylance** — proprietary, may not work standalone. Should we detect and skip it, or attempt anyway?
5. **LSP server memory** — keeping multiple LSP servers warm consumes memory. Should we have a global limit (e.g. max 3 concurrent servers)?
6. **Monorepo root detection** — for the grep fallback, should we limit grep scope to the monorepo root? Or always use CWD?
