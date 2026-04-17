# Cherrypick

Cherrypick lets you select and remove parts of a conversation, then reload a pruned context via `/chat load`.

> **Note:** Cherrypick currently supports kiro-cli only. It relies on kiro-cli's `/chat save` and `/chat load` commands.

## When to use it

- A conversation has grown long and you want to trim irrelevant turns
- The agent went down a wrong path and you want to remove those exchanges before continuing
- You want to create a clean checkpoint of a conversation

## How to use it

1. Open the Weaver dashboard and navigate to **Cherrypick** from the sidebar
2. Select a session to work with
3. Browse the conversation turns: each turn shows the user prompt and the agent's tool calls
4. Check or uncheck individual turns to include or exclude them
5. Copy the pruned conversation output
6. In your kiro-cli session, use `/chat load` to reload with the pruned context
