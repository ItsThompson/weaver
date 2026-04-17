# Setup guide

## Prerequisites

- Node.js 20+
- npm 10+
- A supported AI coding harness: [kiro-cli](https://kiro.dev), [Claude Code](https://claude.ai/code), or [pi](https://github.com/badlogic/pi-mono)
- macOS (required for the desktop app and E2E tests)

### For dictation (optional)

- [Ollama](https://ollama.com) installed and running (for LLM transcript cleanup)
- A pulled Ollama model: `ollama pull phi4-mini`
- CMake and Xcode Command Line Tools (only if building from source: needed to compile the whisper-server binary)

## Installation

### Option 1: From source

```bash
git clone <repo-url>
cd weaver
npm install
```

### Option 2: Download a release

Download the latest `.dmg` from the [releases page](releases-url) and install the app. You still need to set up the hook scripts and CLI symlink below.

Since the app is not code-signed, macOS may block it with a "damaged" error after downloading. To fix this, run:

```bash
sudo xattr -d com.apple.quarantine /Applications/Weaver.app
```

## Running Weaver

If you installed from source:

```bash
npm run app
```

Or run in the browser for development (hot reload):

```bash
npm run dev
```

If you installed from a release, launch the Weaver app from your Applications folder.

The dashboard is available at `http://localhost:8143` when running.

## Hook installation

Weaver captures events through hook scripts. The setup differs by harness.

### kiro-cli

Symlink the hook script and register it in your agent config.

#### 1. Symlink the hook script

```bash
mkdir -p ~/.config/amazonq/global/hooks
ln -s ~/Documents/weaver/bindings/kiro/weaver-log.sh ~/.config/amazonq/global/hooks/weaver-log.sh
chmod +x ~/Documents/weaver/bindings/kiro/weaver-log.sh
```

#### 2. Register hooks in your agent config

Add the following `hooks` block to your agent config file (e.g. `~/.config/amazonq/global/agents/your-agent.json`):

```json
"hooks": {
  "agentSpawn": [
    {
      "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
      "description": "Weaver: log agent spawn event"
    }
  ],
  "userPromptSubmit": [
    {
      "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
      "description": "Weaver: log user prompt submission"
    }
  ],
  "preToolUse": [
    {
      "matcher": "*",
      "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
      "description": "Weaver: log pre-tool-use for all tools"
    }
  ],
  "postToolUse": [
    {
      "matcher": "*",
      "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
      "description": "Weaver: log post-tool-use for all tools"
    }
  ],
  "stop": [
    {
      "command": "~/.config/amazonq/global/hooks/weaver-log.sh",
      "description": "Weaver: log turn completion"
    }
  ]
}
```

### 3. Set up the CLI (optional)

To use the `weaver` command inside sessions:

```bash
ln -s ~/Documents/weaver/bin/weaver /usr/local/bin/weaver
```

See the [CLI reference](cli.md) for available commands.

### Claude Code

Claude Code hooks are configured in `.claude/settings.json`. Weaver auto-patches this file on every `SessionStart` event, so manual setup is only needed for the initial hook installation.

#### Auto-configuration (recommended)

If you use the Weaver desktop app, the hook script is symlinked automatically on launch. Once the hook script is available, add a single bootstrap entry to your global Claude Code settings (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

On the first `SessionStart`, Weaver's init script patches the settings file with entries for all remaining events (`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`) and sets calculated timeouts based on your project's `.weaver.json`.

#### Manual setup (alternative)

If you prefer to configure all hooks up front, add the full hooks block to `.claude/settings.json` (project or global):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh", "timeout": 10 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh", "timeout": 10 }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh", "timeout": 10 }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh", "timeout": 60 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh", "timeout": 120 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "/usr/local/lib/weaver/bindings/claude-code/weaver-log.sh", "timeout": 10 }] }]
  }
}
```

Adjust the `timeout` values for `Stop` and `PostToolUse` based on how long your validation hooks take. Timeouts are in seconds.

#### What works with Claude Code

- Event logging and session tracking
- Validation hooks (runs on `Stop` and `PostToolUse`)
- Skill resolution (reads `skills` from agent YAML frontmatter)
- Session resume (native `session_id` prevents duplicates)
- Auto-config patching (timeouts synced from `.weaver.json`)

#### What is kiro-cli only

- Cherrypick (interactive code selection UI)

### pi

pi uses an extension-based integration: no manual hook configuration needed.

#### Install the weaver extension

From a local weaver checkout:

```bash
pi install /path/to/weaver/bindings/pi
```

Or if using the packaged Weaver.app:

```bash
pi install /Applications/Weaver.app/Contents/Resources/bindings/pi
```

The extension automatically captures events and sends them to weaver. No manual hook configuration is needed.

> **Note:** npm-published install (`pi install npm:@weaver/binding-pi`) is not yet supported because the validation scripts must be co-located with the weaver installation. This is planned for a future release.

#### What works with pi

- Event logging and session tracking
- Validation hooks (runs on stop and postToolUse)
- Validation failure injection into the next prompt
- Session rename, view, and lifecycle management via `weaver` CLI
- Skill resolution (reads from `.pi/skills/` and `~/.pi/agent/skills/`)

#### What is kiro-cli only

- Cherrypick (interactive code selection UI)

## Validation hooks (optional)

To enable automated validation (linting, type-checking, tests) after each agent turn, create a `.weaver.json` file in your project root. See [validation hooks](features/validation.md) for full details.

### Canonical Tool Names (v1.7+)

`postToolUse` matchers use canonical tool names that work across all harnesses:

| Canonical | kiro-cli native | Claude Code native | pi native |
|-----------|-----------------|-------------------|----------|
| `write`   | `fs_write`      | `Write`           | `write`  |
| `edit`    | (n/a)           | `Edit`            | `edit`   |
| `read`    | `fs_read`       | `Read`            | `read`   |
| `bash`    | `execute_bash`  | `Bash`            | `bash`   |

If your `.weaver.json` uses `fs_write`, update it to `write`:

```json
{
  "validation": {
    "postToolUse": [
      { "matcher": "write", "name": "eslint", "command": "npx eslint --fix {{file}}" }
    ]
  }
}
```

## Fix-validation prompt (optional)

A reusable prompt is provided for instructing the LLM to fix validation failures. To make it available in kiro-cli:

```bash
ln -s ~/Documents/weaver/bindings/kiro/prompts/fix-validation.md \
  ~/.config/amazonq/global/prompts/fix-validation.md
```

Then invoke it in a session with `/prompt fix-validation` after seeing validation failures.

## Packaging

To build a distributable `.app` / `.dmg`:

```bash
npm run dist
```
