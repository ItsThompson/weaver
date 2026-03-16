# Skills API

## GET /api/skills

Returns the full skill graph with nodes and edges. Includes skills from all configured paths plus `~/.kiro/skills`.

### Parameters

None.

### Response

**Status:** `200 OK`

```json
{
  "nodes": [
    {
      "id": "typescript::my-app",
      "name": "typescript",
      "skillName": "typescript",
      "description": "TypeScript language conventions and best practices",
      "category": "language",
      "source": "workspace",
      "project": "my-app"
    },
    {
      "id": "react::global",
      "name": "react",
      "skillName": "react",
      "description": "React component patterns and hooks",
      "category": "domain",
      "source": "global",
      "project": null
    }
  ],
  "edges": [{ "from": "typescript::my-app", "to": "react::global" }]
}
```

Each node has:

- `id` — composite key in the format `directoryName::project` (or `directoryName::global`)
- `name` — display name from SKILL.md frontmatter
- `skillName` — skill directory name (used for URL construction)
- `description` — from SKILL.md frontmatter
- `category` — user-defined category or `null`
- `source` — `workspace` or `global`, indicating where the skill was loaded from
- `project` — project name derived from the configured path, or `null` for global skills

Each edge represents a reference from one skill to another, detected by backtick-wrapped skill names in the markdown body. Edges use composite ids.

---

## GET /api/skills/:name

Returns a single skill's frontmatter and markdown body.

### Parameters

| Parameter | In    | Type   | Required | Description                                  |
| --------- | ----- | ------ | -------- | -------------------------------------------- |
| `name`    | path  | string | yes      | Skill directory name                         |
| `project` | query | string | no       | Return only the skill from this project      |
| `source`  | query | string | no       | Use `global` to return only the global skill |

When neither `project` nor `source` is provided, the first matching skill is returned (backward compatible).

### Response

**Status:** `200 OK`

```json
{
  "frontmatter": {
    "name": "typescript",
    "description": "TypeScript language conventions and best practices"
  },
  "body": "# TypeScript\n\nUse strict mode and prefer `const` over `let`.\n",
  "source": "workspace",
  "category": "language",
  "project": "my-app"
}
```

### Error

**Status:** `404 Not Found`

```json
{
  "error": "Skill not found"
}
```
