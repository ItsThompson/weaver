# Release

Create a new Weaver release: review changes, bump version, build, tag, and create a draft GitHub release.

## Steps

### 1. Review changes since last tag

Run `git tag --sort=-v:refname | head -1` to get the latest tag, then `git log <latest-tag>..HEAD --oneline` to list all commits since that tag.

Summarize the changes into categorized groups based on conventional commit prefixes (feat, fix, refactor, test, chore). Determine the bump type automatically:

- `patch`: only fixes, chores, refactors, or test changes (no new features)
- `minor`: at least one `feat` commit
- `major`: breaking changes or a fundamental shift in the project

Present the summary and your chosen bump type to the user for confirmation before proceeding.

If there are no commits since the last tag, stop and tell the user there is nothing to release.

### 2. Bump version, commit, and tag

Parse the latest tag to get the current version (strip the `v` prefix). Increment according to the chosen bump type:

- `patch`: increment patch (e.g., 1.4.1 → 1.4.2)
- `minor`: increment minor, reset patch (e.g., 1.4.1 → 1.5.0)
- `major`: increment major, reset minor and patch (e.g., 1.4.1 → 2.0.0)

Update the `"version"` field in the root `package.json` to the new version, then commit and tag. The tag MUST exist before `npm run dist` because `version:sync` (which `dist` runs) uses `npm version from-git` to read the version from the latest git tag.

```bash
git add package.json
git commit -m "chore: version bump to v{new_version}"
git tag v{new_version}
```

### 3. Build the distribution

Run `npm run dist` and wait for it to complete. This runs `version:sync` internally, which propagates the tagged version to all workspace `package.json` files. The output .dmg will be at `desktop/release/Weaver-{new_version}-arm64.dmg`.

After the build succeeds, commit the synced workspace versions and push everything:

```bash
git add -A
git commit -m "chore: sync workspace versions to v{new_version}"
git push && git push --tags
```

If the build fails, stop and show the error. Do not proceed to the release step.

### 4. Create draft GitHub release

Compose the release using this pattern:

**Release title**: `Weaver v{new_version}: {Short Title}`

- For minor/major releases: join the main feature names with commas and "and" (e.g., "Dictation and Snippets", "Skill Graph, Validation Hooks, and Desktop App")
- For patch releases: brief description of the fix (e.g., "Fix dictation in packaged app")

**Release body**:

- Open with a short intro paragraph (1-2 sentences) summarizing the release theme
- Group changes into sections with `**Bold Section Header**` followed by bullet points
- For minor/major releases: use feature-oriented sections (e.g., **Dictation**, **Configuration**, **Fixes**, **Quality**)
- For patch releases: use a short paragraph followed by a single `**Bug Fix**` section with bullets
- Write bullets from the user's perspective: describe what changed, not how the code works internally
- Omit chore/refactor commits unless they have user-visible impact

Draft the release title and body, present them to the user for review, and confirm before creating.

Create the release:

```bash
gh release create v{new_version} \
  --title "Weaver v{new_version}: {Short Title}" \
  --notes "{release_body}" \
  --draft \
  desktop/release/Weaver-{new_version}-arm64.dmg
```

Tell the user the draft release URL so they can review and publish it.
