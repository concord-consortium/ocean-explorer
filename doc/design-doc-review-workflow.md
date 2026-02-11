# Design Document Review Workflow

This workflow publishes markdown design documents to Google Docs for review, then
incorporates feedback back into the source markdown.

## Prerequisites

- Google Docs MCP server configured in Claude Code (user-level at `~/.claude.json`)
- MCP server installed at `~/mcp-servers/google-docs-mcp/`
- OAuth credentials configured and authorized

## Shared Drive

Published docs live in a shared Google Drive folder:
https://drive.google.com/drive/folders/1g9pp6muNR1olCRMde4nvJXMrWFyItYMV

The MCP server cannot create files directly on shared drives, so new docs must be
created in your personal Drive first and then moved manually to the shared folder.
The document URL stays the same after moving, and the MCP server can still read/write
content and manage comments on moved documents.

## Publishing a Design Doc to Google Docs

1. Read the markdown file from the repo (e.g., `doc/ocean-currents-science.md`)
2. Use the MCP `createDocument` tool to create a new Google Doc with an appropriate title
3. Use `replaceDocumentWithMarkdown` to populate the doc with the markdown content
4. Manually move the new doc from personal Drive to the shared folder above
5. Share the Google Doc link with reviewers
6. Record the Google Doc URL, tab ID, and shared folder URL as HTML comments at the top
   of the markdown file, e.g.:
   ```
   <!-- Google Doc: https://docs.google.com/document/d/DOC_ID/edit -->
   <!-- Google Doc tab: t.0 = ocean-currents-science.md -->
   <!-- Shared Drive folder: https://drive.google.com/drive/folders/FOLDER_ID -->
   ```

### Multiple markdown files in one Google Doc (tabs)

Related markdown files can share a single Google Doc by using tabs. Each markdown file
maps to one tab, identified by its tab ID in the HTML comment header.

To add a new tab:
1. The user manually creates a new tab in the Google Doc (the MCP server cannot create
   tabs)
2. Use `listDocumentTabs` to find the new tab's ID
3. Use `replaceDocumentWithMarkdown` with the `tabId` parameter to populate it
4. Add the tab mapping comment to the markdown file:
   ```
   <!-- Google Doc tab: t.XXXXX = filename.md -->
   ```

When updating, use the tab ID from the markdown comment to target the correct tab with
`replaceDocumentWithMarkdown`.

## Collecting and Incorporating Feedback

After reviewers have commented or edited:

1. Use `listComments` to retrieve all comments and their reply threads
2. Use `readGoogleDoc` (as markdown) to get the current document content
3. Compare the Google Doc content against the source markdown to identify edits
4. Summarize each piece of feedback (comments + edits)
5. Apply accepted changes to the source markdown file
6. Use `resolveComment` with a reply (e.g., "Incorporated in commit abc123") for
   each comment that was addressed
7. Leave unaddressed comments open for continued discussion

## Updating for Another Round

When the source markdown has been updated (from feedback or new work):

1. Use `replaceDocumentWithMarkdown` to update the same Google Doc with the new content
   (use the `tabId` from the markdown file's header comment if the doc has multiple tabs)
2. Resolve any comments that were addressed in the update
3. Google Docs revision history lets reviewers see what changed between rounds
4. The same URL stays valid throughout all rounds

## Known Limitation: Comment Anchoring Lost on Document Update

**Status: Workflow paused until this is resolved.**

The `replaceDocumentWithMarkdown` MCP tool replaces the entire document content. When
this happens, Google Docs disconnects all existing comments from their anchored text
positions — comments appear as "original content deleted" and lose their context.

This makes the "Updating for Another Round" step above unworkable in practice. Review
cycles are not all-at-once: some comments get resolved quickly while others take days.
We need to update the document incrementally as feedback is addressed, but each update
via full replacement orphans all remaining open comments.

To fix this, the MCP server would need to support **partial document updates** — editing
specific sections or ranges of content rather than replacing the entire document. Until
that capability exists, this workflow cannot be used for iterative review.

## Key Design Decisions

- The markdown file in the repo is the **source of truth**
- The Google Doc is a **feedback layer**, not the canonical version
- We update the same Google Doc (not create new ones) to keep a single stable URL
- Comments are resolved with notes about what was done, preserving the feedback trail
