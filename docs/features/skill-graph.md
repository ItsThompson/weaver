# Skill Graph

The skill graph is a visual map of all available skills and how they relate to each other.

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

Weaver discovers skills from the following locations:

- **Global skills**: the harness's global skills directory (e.g., `~/.kiro/skills/` for kiro-cli), always included
- **Configured paths**: any directories listed in `skill_paths` in `~/.weaver/config.json`

You can add skill paths from the Settings page using the "Skill paths" field, or by editing the config file directly. Each path should point to a directory containing skill subdirectories. Provide the full path (e.g., `~/projects/my-app/.kiro/skills`): Weaver does not auto-append `.kiro/skills`.

### Project labels

Skills from configured paths are labeled with a project name:

- If the path ends with `.kiro/skills`, the project name comes from the parent directory (e.g., `~/projects/my-app/.kiro/skills` yields `my-app`)
- Otherwise, the basename of the path is used

Workspace skills always show their project label in the graph. Global skills show `(global)` only when a workspace skill has the same name.

Same-named skills from different sources are treated as separate entries. They appear as distinct nodes in the graph and can be navigated to independently.

### Edge resolution

References between skills follow scoping rules:

- A project skill resolves references to same-project skills first, then falls back to global skills
- A global skill can only reference other global skills
- Cross-project references are not created

## Known limitations

- Skills with the same directory name across different projects share the same category assignment. Changing the category of one affects all instances with the same name. A future version may make categories project-aware.
