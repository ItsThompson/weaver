# Weaver Hook Installation

## Prerequisites

- kiro-cli installed and configured
- An agent config file (e.g., `~/.config/amazonq/global/agents/your-agent.json`)

## Steps

1. Symlink the hook script to the kiro-cli hooks directory:

```bash
mkdir -p ~/.config/amazonq/global/hooks
ln -s ~/Documents/weaver/hooks/weaver-log.sh ~/.config/amazonq/global/hooks/weaver-log.sh
chmod +x ~/Documents/weaver/hooks/weaver-log.sh
```

2. Add hook entries to your agent config JSON. Add the following `hooks` block to your agent config file:

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
},
```

## Configuration

- `WEAVER_MAX_RESPONSE_LENGTH`: Maximum character length for tool response truncation (default: 500). Set as an environment variable to override.

## Data Location

All session data is stored in `~/.weaver/`:

- `sessions.jsonl`: Session index (one JSON line per session)
- `logs/<session-id>.jsonl`: Per-session event logs
- `.current-session-<pid>`: Temporary marker files mapping kiro-cli PIDs to session IDs
