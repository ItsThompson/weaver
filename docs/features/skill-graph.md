# Skill Graph

The skill graph is a visual map of all skills available to kiro-cli and how they relate to each other.

## Accessing the graph

Click **Skills** in the sidebar, or navigate to `/skills` in the dashboard.

## What the graph shows

Each node in the graph represents a skill. Edges connect skills that reference each other — when a skill's content mentions another skill by name, an edge is drawn between them.

The graph uses a hierarchical top-down layout so you can see how skills build on each other.

### Node colors

Nodes are color-coded by category:

| Category     | Description                                |
| ------------ | ------------------------------------------ |
| **Core**     | Foundational skills used across many areas |
| **Language** | Programming language conventions           |
| **Domain**   | Domain-specific knowledge and patterns     |
| **Workflow** | Process and tooling skills                 |

## Skill detail view

Click any node in the graph to open the skill's detail page. You can also click a skill badge on a session detail page to navigate to the same view.

The detail page shows the skill's name, description, and full markdown content.

## Where skills come from

Weaver discovers skills from two locations:

- **Workspace skills** — `.kiro/skills/` relative to the project root
- **Global skills** — `~/.kiro/skills/`

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`) and a markdown body. When both locations contain a skill with the same name, the workspace version takes priority.
