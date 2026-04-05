# Setup guide

## Prerequisites

- Node.js 20+
- npm 10+
- kiro-cli installed and configured
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

Weaver captures kiro-cli events through hook scripts. You need to symlink the hook script and register it in your agent config.

### 1. Symlink the hook script

```bash
mkdir -p ~/.config/amazonq/global/hooks
ln -s ~/Documents/weaver/hook-handler/weaver-log.sh ~/.config/amazonq/global/hooks/weaver-log.sh
chmod +x ~/Documents/weaver/hook-handler/weaver-log.sh
```

### 2. Register hooks in your agent config

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

To use the `weaver` command inside kiro-cli sessions:

```bash
ln -s ~/Documents/weaver/bin/weaver /usr/local/bin/weaver
```

See the [CLI reference](cli.md) for available commands.

## Validation hooks (optional)

To enable automated validation (linting, type-checking, tests) after each agent turn, create a `.weaver.json` file in your project root. See [validation hooks](features/validation.md) for full details.

## Fix-validation prompt (optional)

A reusable prompt is provided for instructing the LLM to fix validation failures. To make it available in kiro-cli:

```bash
ln -s ~/Documents/weaver/hook-handler/prompts/fix-validation.md \
  ~/.config/amazonq/global/prompts/fix-validation.md
```

Then invoke it in a kiro-cli session with `/prompt fix-validation` after seeing validation failures.

## Packaging

To build a distributable `.app` / `.dmg`:

```bash
npm run dist
```
