# Artist Studio Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Fanfolio artist editor into a commercial creative studio that matches the selected Editorial Collectible reference while retaining every editor tool and stage.

**Architecture:** Preserve state, serialization, API calls, and editor actions in `builder_app/app.js`. Refine the design-stage markup with stable media-library, canvas, tool-rail, and inspector hooks, then reshape the existing adaptive CSS rather than replacing the editor engine.

**Tech Stack:** Static HTML, browser ES modules, CSS, Material Symbols, Node test runner.

---

### Task 1: Lock the studio workspace hierarchy

**Files:**
- Modify: `builder_app/tests/studio-editor-regressions.test.mjs`
- Modify: `builder_app/app.js`

- [x] **Step 1: Write the failing test**

Add source assertions for the commercial design workspace: compact tool rail, visible media library, centered canvas controls, structured inspector, four-step progress, draft save, and the next-stage action.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/studio-editor-regressions.test.mjs`
Expected: FAIL because the media-library and refined workspace hooks are absent.

- [x] **Step 3: Implement the workspace hierarchy**

Reuse `sampleAssets`, existing uploaded image state, `editorTools`, `cardVisual()`, and `editorInspector()`. Keep all existing `data-action`, `data-tool`, `data-side`, and stage navigation contracts intact.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/studio-editor-regressions.test.mjs`
Expected: PASS.

### Task 2: Match the Editorial Collectible studio

**Files:**
- Modify: `builder_app/styles.css`
- Test: `builder_app/tests/studio-editor-regressions.test.mjs`

- [x] **Step 1: Add failing layout assertions**

Require a desktop rail/library/canvas/inspector grid, a tablet layout with a collapsible inspector, and a phone layout that preserves touch-safe tools and actions.

- [x] **Step 2: Run the regression test to verify it fails**

Run: `node --test tests/studio-editor-regressions.test.mjs`
Expected: FAIL on the new style hooks.

- [x] **Step 3: Add the production visual layer**

Apply ink-navy navigation, a white asset library, neutral canvas surround, violet selected states, compact stage controls, clear inspector groups, and consistent 8/12/16/24 spacing. Use only the existing real photo and sticker assets.

- [x] **Step 4: Run the complete studio suite**

Run: `npm test`
Expected: all tests PASS.

### Task 3: Browser verification

**Files:**
- Modify: `design-qa.md`
- Create: `audits/artist-studio-editorial.png`
- Create: `audits/artist-studio-editorial-comparison.png`

- [x] **Step 1: Open a populated card design state**

Verify tool selection, asset selection, front/back switch, layer interaction, inspector controls, draft save, stage navigation, and mobile inspector behavior.

- [x] **Step 2: Compare reference and implementation together**

Capture the same desktop state, compose it beside the cropped studio reference, and record hierarchy, canvas scale, spacing, and responsive findings.

- [x] **Step 3: Iterate until the QA verdict passes**

Append a section to `design-qa.md` ending with the exact line `final result: passed` only after visual comparison and required interactions are verified.
