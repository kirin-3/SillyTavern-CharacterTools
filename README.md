# SillyTavern Character Tools

**An LLM-powered extension for analyzing, scoring, and iteratively improving character cards.**

Stop guessing if your character card is good. Let an AI tear it apart, tell you exactly what's wrong, rewrite it better, and then verify it didn't lose the character's soul in the process.

![Main Interface Screenshot Placeholder]
<!-- SCREENSHOT: Full popup with a character selected, showing the pipeline nav with Score/Rewrite/Analyze stages, and some results visible -->

---

## What It Does

Character Tools runs your character cards through a three-stage pipeline:

1. **Score** — Get brutal, field-by-field feedback on what works and what's garbage
2. **Rewrite** — Generate an improved version based on that feedback
3. **Analyze** — Compare the rewrite against the original to catch "soul loss" and regressions

Then iterate until it's actually good, or accept and move on.

---

## Features

### 🎯 Field-Level Scoring

Not just "this card is a 7/10" — you get specific ratings and feedback for each field: description, personality, first message, scenario, example messages, system prompt, and more.

![Score Results Screenshot Placeholder]
<!-- SCREENSHOT: Score results panel showing field-by-field breakdown with scores, strengths, weaknesses, and suggestions -->

### ✍️ Smart Rewrites

The rewrite stage returns changes addressed to real card fields. Each proposal includes the original value, replacement, and rationale, so you can review and select individual changes instead of reconciling one large document.

### ✅ Apply Back to the Card

Select the proposed fields you want and click **Apply Selected Fields**. Character Tools verifies the original character identity, writes only those fields, and keeps a pre-write snapshot for one-step revert. Lorebook proposals remain manual guidance. If the SillyTavern write endpoint is unavailable, the same review degrades to per-field copy instructions.

### 🔍 Soul Check Analysis

The analyze stage compares your rewrite against the original and answers the critical question: *Does this still feel like the same character?*

- What was preserved
- What was lost
- What was gained
- Verdict: **ACCEPT**, **NEEDS_REFINEMENT**, or **REGRESSION**

![Analysis Results Screenshot Placeholder]
<!-- SCREENSHOT: Analyze results showing the verdict badge, preserved/lost/gained sections -->

### 🔄 Iterative Refinement

If the analysis says "needs work," hit Refine. The extension:

- Saves your current iteration to history
- Generates a new rewrite addressing the identified issues
- Lets you analyze again
- Repeat until it's right

Full iteration history with one-click revert to any previous version.

![Iteration History Screenshot Placeholder]
<!-- SCREENSHOT: Iteration history panel showing 2-3 iterations with verdict badges and revert buttons -->

### 📋 Selective Field Processing

Don't want to rewrite the whole card? Select only the fields you care about. Working on alternate greetings? Pick specific ones.

![Field Selection Screenshot Placeholder]
<!-- SCREENSHOT: Character preview with field checkboxes, showing some fields selected and some not -->

### 📊 Structured Output Support

Structured output is enabled by default for Score, Rewrite, and Analyze, with a built-in schema for every stage. Every structured prompt ends with compact guidance derived from the active schema: required root keys, an example instance, and allowed enum values. Responses pass through reasoning-block removal, fence repair, balanced JSON extraction, and required-key validation. A provider that rejects schemas is retried once without the schema; malformed structured content is re-asked once with the correct guidance placed last.

**Don't know JSON Schema?** No problem. Click **Generate** and describe what you want in plain English:

> "rating 1-10, list of issues, summary, and a boolean for whether it needs more work"

The AI builds the schema for you.

![Schema Generation Screenshot Placeholder]
<!-- SCREENSHOT: The schema generation input dialog, or the schema textarea with a generated schema -->

### 💾 Preset System

Save your prompts and schemas as presets. Includes sensible defaults, but you can customize everything:

- Stage-specific prompts
- Custom JSON schemas
- System prompt additions
- Refinement instructions

---

## Compatibility

### ✅ Confirmed Working

- **Chat Completion APIs** — OpenRouter, OpenAI, Anthropic/Claude, Google AI Studio, Mistral, Groq, etc.

### ❓ Unknown

- **Text Completion APIs** — Might work, might not. We haven't tested it. If you try it and it works (or explodes), let us know.

The extension uses SillyTavern's `generateRaw` function for current-settings mode. Text completion, structured output, and prompt formatting can vary by backend.

---

## Installation

### From SillyTavern (Recommended)

1. Open SillyTavern
2. Go to **Extensions** panel (stacked cubes icon)
3. Click **Install Extension**
4. Paste: `https://github.com/Inktomi93/SillyTavern-CharacterTools`
5. Click **Install**
6. Refresh your browser

### Manual Installation

```bash
cd SillyTavern/data/<your-user>/extensions/third-party/
git clone https://github.com/Inktomi93/SillyTavern-CharacterTools
```

Restart SillyTavern after installation.

---

## Quick Start

### 1. Open the Extension

Find **Character Tools** in the Extensions panel, click **Open Character Tools**.

![Extension Panel Screenshot Placeholder]
<!-- SCREENSHOT: Extensions panel showing Character Tools entry with the Open button -->

### 2. Select a Character

Search for a character by name. The extension shows all populated fields with token counts.

![Character Search Screenshot Placeholder]
<!-- SCREENSHOT: Character search dropdown with results showing avatars and descriptions -->

### 3. Choose Your Fields

By default, all populated fields are selected. Uncheck any you want to skip. Alternate greetings and lorebook entries can be selected individually. When a full lorebook would exceed the model context, Character Tools shows the entries it recommends omitting, dropping disabled entries before enabled ones.

### 4. Configure the Pipeline

The pipeline has three stages: **Score → Rewrite → Analyze**

- Check/uncheck stages to include them
- Click a stage button to view/edit its configuration
- Each stage has its own prompt and optional JSON schema
- Prompt and schema editors start collapsed; expand either without losing unsaved text
- Collapsed sections keep the active preset and token count visible
- Collapse the configuration rail when you want the results area to take over

![Pipeline Nav Screenshot Placeholder]
<!-- SCREENSHOT: Pipeline navigation showing all three stages with checkboxes, one stage active -->

### 5. Run It

- **Run Stage** — Run just the currently selected stage
- **Run Selected** — Run all checked stages in sequence

### 6. Review Results

Results appear in the panel below. For each stage you can:

- **Lock** — Prevent accidental regeneration
- **Copy** — Copy to clipboard
- **Regenerate** — Try again with the same settings
- **Continue** — Move to the next stage
- **Apply Selected Fields** — Write reviewed rewrite entries to the card
- **Revert Last Apply** — Restore every field touched by the last write

![Results Panel Screenshot Placeholder]
<!-- SCREENSHOT: Results panel showing formatted output with toolbar (lock, copy buttons) and footer actions -->

### 7. Iterate If Needed

After Analyze, if the verdict is **NEEDS_REFINEMENT**:

1. Click **Refine** to generate an improved rewrite
2. Click **Analyze This Rewrite** to check the new version
3. Repeat until you get **ACCEPT** or decide it's good enough
4. Click **Accept Rewrite** to lock it as final

### 8. Export

Click **Export** to download a markdown file with:

- All stage results
- Full iteration history
- Timestamps and metadata

---

## The Pipeline in Detail

### Score Stage

**Input:** Your character card (selected fields only)

**Output:** Field-by-field analysis with:

- Numerical rating (1-10)
- Strengths
- Weaknesses
- Specific improvement suggestions
- Overall score and priority improvements

**When to use:** Always start here. Even if you think your card is good, the score gives you a baseline and identifies blind spots.

### Rewrite Stage

**Input:** Original character + Score feedback (if available)

**Output:** A structured list of per-field replacements with canonical field key, original index, content, rationale, and summary

**When to use:** After scoring, or standalone if you just want a fresh take. The rewrite incorporates score feedback automatically when available.

### Analyze Stage

**Input:** Original character + Current rewrite

**Output:** Comparison analysis with:

- What was preserved from the original
- What was lost (the "soul check")
- What was improved
- Verdict: ACCEPT / NEEDS_REFINEMENT / REGRESSION
- Specific issues to address (if refinement needed)

**When to use:** After every rewrite. This is your quality gate.

---

## Refinement Loop

The real power is in iteration:

```text
Score → Rewrite → Analyze
                    ↓
              NEEDS_REFINEMENT?
                    ↓
                 Refine → Analyze → ...
                    ↓
                 ACCEPT?
                    ↓
                  Done
```

Each iteration is saved. If iteration #3 is worse than #2, revert with one click.

---

## Settings

Access settings via the ⚙️ icon in the popup header.

![Settings Modal Screenshot Placeholder]
<!-- SCREENSHOT: Settings modal showing the Generation section with "Use Current Settings" toggle -->

### Generation

- **Use Current SillyTavern Settings** — Uses your active API connection. `generateRaw` does not expose a sampler override, so all stages inherit the active temperature.
- **Connection Profile** — Uses a SillyTavern Connection Manager profile. Score and Analyze run at low temperature for repeatability; Rewrite inherits the profile sampler settings.

### System Prompt

The system prompt is sent with every generation. You can:

- Add your own instructions (appended to the base)
- Edit the base prompt (advanced, affects all stages)

### Refinement Prompt

Instructions for the refinement loop. Customize how the AI approaches fixing identified issues.

### Presets

- View all prompt and schema presets
- Delete custom presets (builtins are locked)
- Export/import custom presets for backup or sharing

---

## Creating Custom Schemas

You have two options:

### Option 1: Generate from Description

Click the **Generate** button under the schema textarea and describe what you want:

> "scores for description, personality, and first message (1-10 each), a list of the top 3 problems, and an overall recommendation"

The AI creates a valid JSON schema from your description. Review it, tweak if needed, save as a preset.

### Option 2: Write JSON Schema Manually

If you know JSON Schema, write it directly. The extension validates as you type and warns about compatibility issues with different providers.

Required format:

```json
{
  "name": "MySchema",
  "strict": true,
  "value": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "score": { "type": "number" },
      "issues": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["score", "issues"]
  }
}
```

Use **Validate** to check for errors, **Auto-Fix** to add missing `additionalProperties: false`, and **Format** to prettify.

---

## Keyboard Shortcuts

| Shortcut       | Action            |
|----------------|-------------------|
| `Ctrl+Enter`   | Run current stage |
| `Escape`       | Cancel generation |

---

## Tips

### For Best Results

1. **Choose a model that follows JSON instructions reliably** — The built-in rubrics and repair chain are designed to work with reasoning models such as GLM and DeepSeek as well as larger frontier models. Provider schema support still varies; unstructured fallback is shown in the result toolbar when used.

2. **Don't skip Analyze** — It's tempting to just take the rewrite, but the soul check catches problems you won't notice until you're mid-roleplay.

3. **Trust REGRESSION verdicts** — If the AI says it got worse, it probably did. Revert and try different refinement instructions.

4. **Iterate 2-3 times max** — If it's not converging after 3 iterations, the original might need manual work first.

### Customizing Prompts

The built-in prompts are solid defaults, but you can:

- Create stage-specific presets for different character types
- Add constraints ("keep it under 500 words", "maintain first-person perspective")
- Use placeholders like `{{original_character}}` and `{{score_results}}` for precise control

### Structured Output

JSON schemas force consistent output format. Good for:

- Programmatic processing of results
- Ensuring the AI doesn't skip sections
- Getting machine-readable scores

Not all providers accept native schemas. Character Tools retries schema-rejection failures once without a schema and keeps the raw result copyable and exportable. You can still disable structured output per stage.

---

## Troubleshooting

### Extension doesn't appear

- Refresh your browser
- Check it's enabled in the Extensions panel
- Look for errors in browser console (F12)

### Generation fails

- Verify your API is connected (green dot in popup header)
- Check SillyTavern console for error details
- Try a different model if one is consistently failing

### Results look wrong or incomplete

- Check whether the result toolbar reports an unstructured fallback
- Inspect **Prompt Preview** to see the complete serialized card and schema instructions
- Check that custom prompts do not conflict with the base field-craft rubric

### "No character selected" error

- Make sure you've searched and clicked on a character
- The character must have at least one populated field

### Using Text Completion API and it's broken

- This extension was built for Chat Completion. Text Completion *might* work but is untested.
- Try switching to a Chat Completion source if available.

---

## Requirements

- SillyTavern 1.12.0+
- A connected LLM API (Chat Completion recommended — OpenRouter, OpenAI, Claude, etc.)
- A model that can follow the stage rubric and return JSON when structured output is enabled

---

## License

AGPL-3.0

---

## Support

[GitHub Issues](https://github.com/Inktomi93/SillyTavern-CharacterTools/issues)

---
