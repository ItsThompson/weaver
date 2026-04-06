# Snippets

Snippets let you define trigger phrases that expand into predefined text during dictation. When your entire dictation matches a trigger phrase exactly, the expansion text is used instead of running LLM cleanup.

This feature is only available in the desktop app (Electron). It does not appear in browser dev mode.

## When to use snippets

Snippets are useful for text you dictate frequently:

- Email signatures
- Code boilerplate
- Standard responses or greetings
- Addresses or contact information

## How matching works

Snippet matching compares your full dictation against each trigger phrase:

1. Both the dictation and the trigger are stripped of non-alphabetic characters and lowercased
2. The normalized dictation must match the normalized trigger exactly
3. Partial matches do not trigger: saying "please insert intro now" does not match a trigger of "insert intro"
4. If multiple snippets match the same dictation, none of them trigger (to avoid ambiguity)

Choose trigger phrases that are unique and unlikely to appear in regular speech.

## Managing snippets

Open **Snippets** from the sidebar or command palette. You can also select **Manage Snippets** from the **Actions** dropdown on the Dictation page.

### Adding a snippet

1. Click **Add Snippet**
2. Enter a trigger phrase (e.g., "signature")
3. Enter the expansion text (supports multiple lines)
4. Click **Save**

### Editing a snippet

Click **Edit** on any snippet card. The form appears inline with the existing values pre-populated.

### Deleting a snippet

Click **Delete** on any snippet card.

## Example

Create a snippet with:

- **Trigger**: "signature"
- **Expansion**: "Best regards,\nJane Smith\nSenior Engineer"

Now when you open the Dictation page (or use the dictation hotkey) and say "signature", the processed output is the expansion text. No LLM processing is needed.

## Storage

Snippets are stored in `~/.weaver/snippets.jsonl`.
