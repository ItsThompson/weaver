# Documentation Maintenance

## When to update docs

Update documentation whenever a change affects what a user can observe or interact with:

- New feature, command, config option, or UI page
- Changed behavior of an existing feature (different defaults, renamed options, removed functionality)
- New or changed CLI commands or arguments
- New or changed `.weaver.json` schema fields
- New or changed `~/.weaver/config.json` options
- New or changed environment variables
- New or changed keyboard shortcuts, tray menu items, or dashboard UI

Do NOT update docs for:

- Internal refactors that don't change user-facing behavior
- Test changes
- Build/CI changes
- Code reorganization within a package

## What goes where

| Change type                             | Update                                       |
| --------------------------------------- | -------------------------------------------- |
| New/changed feature                     | `docs/features/<feature>.md`                 |
| New/changed CLI command                 | `docs/cli.md`                                |
| New/changed config option               | `docs/configuration.md`                      |
| New/changed setup step                  | `docs/setup.md`                              |
| New package                             | Root `README.md` + new `<package>/README.md` |
| Changed package purpose or dev workflow | `<package>/README.md`                        |

## Writing style for docs

These docs are written for the user, not the developer. They describe what the user can do and what they will see. They do not explain how the system works internally.

- Describe behavior, not implementation
- Use "Weaver does X" not "the server calls Y which triggers Z"
- Show what the user types, clicks, or sees
- Include config examples with realistic values
- Do not reference source files, function names, module structure, or internal data flow
- Do not describe how packages communicate with each other
- If a feature has edge cases the user might hit, describe the observable behavior ("the command is skipped") not the mechanism ("the runner checks for an empty string")
