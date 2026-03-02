# WEAVER-003: Cherrypick Flow Implementation Plan

## Overview

Build the conversation editing tool that lets users upload a `/chat save` JSON file, visually browse conversation exchanges, select exchanges to delete, and download a modified JSON file for use with `/chat load`.

### Success Criteria

- User can upload a `/chat save` JSON file via the browser
- Conversation is parsed into atomic exchanges (prompt → tool chain → response) and displayed as cards
- User can select exchanges to delete via checkboxes
- If saved inside a tangent, main history and tangent history are shown as separate sections
- Preview shows the resulting conversation after deletions
- Download produces a valid JSON file that works with `/chat load`
- `valid_history_range`, `transcript`, and `tangent_state` are correctly updated in the output

### Assumptions & Constraints

- Architecture from WEAVER-001 is complete
- This flow is fully independent from the observability flow — no shared data or state
- All processing can happen client-side (parsing, grouping, pruning, export) — the server is only needed if we want to offload heavy JSON processing, but for P1 client-side is sufficient
- The `/chat save` JSON format follows the structure documented in WEAVER-CONTEXT.md
- Depends on: WEAVER-001

---

## Approach

### Key Decision: Client-Side Processing

All cherrypick logic runs in the browser. The uploaded JSON never leaves the user's machine (no server upload). This keeps the flow simple, fast, and privacy-friendly. The server is not involved in this flow.

### Data Flow

```
User uploads JSON file
        ↓
Browser parses JSON → SavedConversation
        ↓
Group history into ConversationExchanges
        ↓
Render exchanges as selectable cards
        ↓
User marks exchanges for deletion
        ↓
Produce modified SavedConversation (remove exchanges, update metadata)
        ↓
Download as JSON file
```

### UI Layout

The Cherrypick page has three states:
1. **Upload** — file drop zone / file picker
2. **Edit** — exchange cards with checkboxes, split into main + tangent sections if applicable
3. **Preview & Export** — side-by-side or toggle view of before/after, download button

---

## Implementation Steps

### Step 1: Conversation parsing utilities

Build the core logic for parsing `/chat save` JSON into exchanges and producing modified output.

**Files:**
- `client/src/utils/conversation-parser.ts`:
  - `parseConversation(json: SavedConversation): ParsedConversation` — validate structure, extract exchanges from `history`, detect tangent state
  - `groupIntoExchanges(history: ConversationTurn[]): ConversationExchange[]` — implement the grouping logic from WEAVER-CONTEXT.md:
    - New exchange starts at `Prompt` content type
    - Exchange continues through `ToolUseResults` turns
    - Exchange ends at assistant `Response` (not `ToolUse`)
  - `pruneConversation(original: SavedConversation, deleteIds: Set<number>): SavedConversation` — remove selected exchanges, rebuild `history`, update `valid_history_range`, regenerate `transcript`, update `tangent_state` if present
  - `regenerateTranscript(history: ConversationTurn[]): string[]` — build transcript array from history following the format in WEAVER-CONTEXT.md

**Types (modify `shared/types.ts`):**

`ConversationExchange` already exists from WEAVER-001. Add the `turnIndices` field:
```typescript
// Add to existing ConversationExchange interface
turnIndices: [number, number]; // [startIndex, endIndex] in original history array
```

Add new `ParsedConversation` interface:
```typescript
interface ParsedConversation {
  raw: SavedConversation;
  mainExchanges: ConversationExchange[];
  tangentExchanges: ConversationExchange[] | null; // null if not in tangent
  isInTangent: boolean;
}
```

### Step 2: Upload UI

Build the file upload interface.

**Files:**
- `client/src/pages/CherrypickPage.tsx`:
  - File upload zone using a standard `<input type="file" accept=".json">` styled with Cloudscape `FormField` and `Button`
  - On file select: read via `FileReader`, parse JSON, validate it looks like a SavedConversation (check for `history` array, `conversation_id`), call `parseConversation`
  - Show error `Alert` if file is invalid
  - On success: transition to edit state

### Step 3: Exchange cards UI

Display parsed exchanges as selectable cards.

**Files:**
- `client/src/pages/CherrypickPage.tsx` (continued):
  - If `isInTangent`, render two sections with Cloudscape `Container`:
    - "Main Conversation" — `mainExchanges` cards
    - "Tangent" — `tangentExchanges` cards with visual distinction (e.g., different header or badge)
  - Each exchange rendered via `ExchangeCard` component
  - "Select All" / "Deselect All" toggle per section
  - Running count: "X of Y exchanges selected for deletion"

- `client/src/components/ExchangeCard.tsx`:
  - Cloudscape `Container` with `Checkbox` in the header
  - User prompt: first 200 chars, full text in `ExpandableSection` if longer
  - Tools used: `Badge` per tool name
  - Assistant response: first 300 chars preview, expandable
  - Timestamp displayed
  - Visual state change when selected for deletion (e.g., muted/strikethrough styling)

### Step 4: Preview and export

Show the result of deletions and allow download.

**Files:**
- `client/src/pages/CherrypickPage.tsx` (continued):
  - "Preview" button calls `pruneConversation` with selected exchange IDs
  - Preview section shows:
    - Summary: "Removing X exchanges (Y turns) from conversation"
    - Remaining exchanges rendered as a simplified list (non-interactive)
    - Updated transcript array displayed in a `CodeView` or `<pre>` block
  - "Download" button:
    - Produces the pruned `SavedConversation` as a JSON blob
    - Triggers browser download with filename: `<original-filename>-pruned.json`
  - "Reset" button to clear selections and start over

### Step 5: Tangent state handling

Ensure tangent-aware pruning works correctly.

**Files:**
- `client/src/utils/conversation-parser.ts` (additions to `pruneConversation`):
  - If `tangent_state` exists in the original:
    - Deletions in the main section modify `tangent_state.main_history` and `tangent_state.main_transcript`
    - Deletions in the tangent section modify the top-level `history` and `transcript` (since tangent conversation is the current history when saved inside a tangent)
  - After pruning, if all tangent exchanges are deleted, remove `tangent_state` entirely
  - Recalculate `valid_history_range` for both main and current history

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `shared/types.ts` | Modify | Add `turnIndices` to existing `ConversationExchange`, add new `ParsedConversation` interface |
| `client/src/utils/conversation-parser.ts` | Create | Core parsing, grouping, pruning, and transcript regeneration logic |
| `client/src/pages/CherrypickPage.tsx` | Modify | Replace placeholder with full upload → edit → preview → export flow |
| `client/src/components/ExchangeCard.tsx` | Create | Exchange display card with selection checkbox |
| `client/jest.config.mjs` | Create | Jest config for client-side pure logic tests (ts-jest, shared path alias) |
| `client/__tests__/utils/conversation-parser.test.ts` | Create | Unit tests for conversation parsing, grouping, pruning, and transcript regeneration |

---

## Testing Strategy

Client-side pure logic tests use Jest with ts-jest, matching the server setup from WEAVER-001. A `client/jest.config.mjs` is created with the same pattern as `server/jest.config.mjs` (ts-jest ESM preset, `@shared/*` path alias mapping, `.js` -> `.ts` extension rewriting). Test files live in `client/__tests__/` mirroring the `src/` structure. Jest and ts-jest are added as dev dependencies to `client/package.json`.

### Unit Tests
- `client/__tests__/utils/conversation-parser.test.ts` — this is the critical module, test thoroughly:
  - `groupIntoExchanges`:
    - Simple conversation (all Prompt → Response pairs) → one exchange per pair
    - Tool use conversation (Prompt → ToolUse → ToolUseResults → Response) → single exchange spanning multiple turns
    - Multi-step tool chain (Prompt → ToolUse → ToolUseResults → ToolUse → ToolUseResults → Response) → single exchange
    - Empty history → empty array
  - `pruneConversation`:
    - Delete first exchange → history starts at second exchange's turns
    - Delete middle exchange → surrounding exchanges preserved, indices correct
    - Delete all exchanges → empty history, valid_history_range is [0, 0]
    - `valid_history_range` updated correctly after deletion
    - `transcript` regenerated correctly
  - `pruneConversation` with tangent:
    - Delete from main history → `tangent_state.main_history` updated
    - Delete from tangent history → top-level `history` updated
    - Delete all tangent exchanges → `tangent_state` removed
  - `regenerateTranscript`:
    - User prompts prefixed with `"> "`
    - Tool use turns include `[Tool uses: <names>]`
    - Non-tool turns include `[Tool uses: none]`

### Manual Testing
1. Export a real conversation via `/chat save`
2. Upload to Cherrypick page
3. Verify exchanges match the actual conversation
4. Select some exchanges for deletion
5. Preview — verify remaining exchanges look correct
6. Download modified JSON
7. Run `/chat load <modified>.json` in kiro-cli — verify conversation loads correctly and agent summarizes the remaining context
8. Repeat with a conversation saved inside a tangent

---

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| `/chat save` format changes in future kiro-cli versions | Parse defensively with fallbacks; validate required fields on upload and show clear error for unrecognized formats |
| Large conversation files (10MB+) cause browser performance issues | Use `JSON.parse` streaming if needed; limit preview rendering to summaries rather than full content |
| Pruned JSON rejected by `/chat load` | Test with real kiro-cli; ensure all required fields are preserved exactly; only modify `history`, `valid_history_range`, `transcript`, and `tangent_state` |
| Edge case: conversation with only one exchange — deleting it produces empty history | Allow it; `/chat load` with empty history should work (agent starts fresh with loaded context files) |
| Transcript regeneration doesn't match kiro-cli's exact format | Compare regenerated transcript against original for non-deleted exchanges; match format character-by-character |

---

## Dependencies

- WEAVER-001 (architecture) must be complete: client scaffold, Cloudscape setup, routing, and shared types (`ConversationExchange`, `SavedConversation`, `ConversationTurn`, `TangentState`)
- `jest`, `ts-jest`, `@types/jest` added as dev dependencies to `client/package.json`
- No server-side dependencies for this flow
- Real `/chat save` JSON files needed for testing (use `test-dev-hooks.json` from repo as reference)
