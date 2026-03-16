# Skill Graph

The skill graph is a visual map of all skills available to kiro-cli and how they relate to each other.

## Accessing the graph

Click **Skills** in the sidebar, or navigate to `/skills` in the dashboard.

## What the graph shows

Each node in the graph represents a skill. Edges connect skills that reference each other: when a skill's content mentions another skill by name, an edge is drawn between them.

The graph uses a hierarchical top-down layout so you can see how skills build on each other.

### Node colors

Nodes are color-coded by user-defined categories. You define categories and assign skills in `~/.weaver/config.json`:

```json
{
  "skill_graph": {
    "categories": {
      "core": { "color": "#ff6b6b", "skills": ["coding-practices"] },
      "language": { "skills": ["typescript-standards"] }
    }
  }
}
```

Categories without a `color` get one from a default palette. Skills not assigned to any category appear in grey.

Each skill belongs to at most one category. The category is resolved in this order:

1. **Config override**: if the skill appears in a category's `skills` array in `~/.weaver/config.json`, that category is used
2. **Frontmatter**: if the skill's `SKILL.md` has a `category` field in its YAML frontmatter, that value is used
3. **Uncategorized**: the skill appears in grey

### Managing categories

Categories can be managed from two places:

- **Settings page**: bulk edit all categories, colors, and skill assignments using the category editor
- **Skill Detail page**: change a single skill's category using the dropdown selector

Both save to `~/.weaver/config.json` and the graph updates immediately.

## Skill detail view

Click any node in the graph to open the skill's detail page. You can also click a skill badge on a session detail page to navigate to the same view.

The detail page shows the skill's name, description, full markdown content, and a category selector.

## Where skills come from

Weaver discovers skills from two locations:

- **Workspace skills**: `.kiro/skills/` relative to the project root
- **Global skills**: `~/.kiro/skills/`

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`, and optionally `category`) and a markdown body. When both locations contain a skill with the same name, the workspace version takes priority.
