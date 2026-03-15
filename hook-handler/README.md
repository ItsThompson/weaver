# weaver-hook-handler

kiro-cli hook scripts that capture session events, run validation, and inject failure context into the LLM's next prompt.

## Installation

See the [setup guide](../docs/setup.md) for full hook installation instructions.

## Development

```bash
# Build
npm run build --prefix hook-handler

# Run tests
npm test --prefix hook-handler
```

## What it does

1. **Event logging**: Captures all kiro-cli hook events (agent spawn, user prompts, tool calls, turn completion) and writes them to `~/.weaver/` for the dashboard to read.
2. **Validation**: Runs configured linting, type-checking, and test commands after each agent turn. See [validation hooks](../docs/features/validation.md).
3. **Prompt injection**: When validation failures occurred on the previous turn, injects the failure details into the LLM's context on the next prompt.

## Configuration

Validation hooks are configured via `.weaver.json` files in your project. See [validation hooks](../docs/features/validation.md) for the full schema and examples.
