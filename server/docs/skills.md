# Skills API

## GET /api/skills

Returns the full skill graph with nodes and edges.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "nodes": [
    {
      "name": "typescript",
      "description": "TypeScript language conventions and best practices",
      "category": "language",
      "source": "global"
    },
    {
      "name": "react",
      "description": "React component patterns and hooks",
      "category": "domain",
      "source": "workspace"
    },
    {
      "name": "testing",
      "description": "Unit and integration testing strategies",
      "category": "workflow",
      "source": "global"
    }
  ],
  "edges": [
    { "from": "react", "to": "typescript" },
    { "from": "testing", "to": "typescript" }
  ]
}
```

Each node has:

- `name` — skill directory name
- `description` — from SKILL.md frontmatter
- `category` — one of `core`, `language`, `domain`, `workflow`
- `source` — `workspace` or `global`, indicating where the skill was loaded from

Each edge represents a reference from one skill to another, detected by backtick-wrapped skill names in the markdown body.

---

## GET /api/skills/:name

Returns a single skill's frontmatter and markdown body.

### Parameters

| Parameter | In   | Type   | Required | Description          |
| --------- | ---- | ------ | -------- | -------------------- |
| `name`    | path | string | yes      | Skill directory name |

### Response

**Status:** `200 OK`

```json
{
  "frontmatter": {
    "name": "typescript",
    "description": "TypeScript language conventions and best practices",
    "version": "1.0.0"
  },
  "body": "# TypeScript\n\nUse strict mode and prefer `const` over `let`.\n\nSee also `testing` for test conventions.\n"
}
```

### Error

**Status:** `404 Not Found`

```json
{
  "error": "Skill not found"
}
```
