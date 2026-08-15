// src/constants.ts
import type {
    CharacterField,
    StructuredOutputSchema,
    PromptPreset,
    SchemaPreset,
    StageDefaults,
    StageName,
    GenerationSettings,
    Settings,
} from './types';

// ============================================================================
// MODULE INFO
// ============================================================================

export const MODULE_NAME = 'character_tools';
export const EXTENSION_PATH = 'third-party/SillyTavern-CharacterTools';
export const SETTINGS_VERSION = 6;
export const VERSION = '1.3.0';     // CHANGED: Version bump for refactor
export const CURRENT_PRESET_VERSION = 3;

// ============================================================================
// CHARACTER FIELDS
// ============================================================================

export const CHARACTER_FIELDS: readonly CharacterField[] = Object.freeze([
    { key: 'description', label: 'Description', path: 'description', type: 'string' },
    { key: 'personality', label: 'Personality', path: 'personality', type: 'string' },
    { key: 'first_mes', label: 'First Message', path: 'first_mes', type: 'string' },
    { key: 'scenario', label: 'Scenario', path: 'scenario', type: 'string' },
    { key: 'mes_example', label: 'Example Messages', path: 'mes_example', type: 'string' },
    { key: 'system_prompt', label: 'System Prompt', path: 'data.system_prompt', type: 'string' },
    { key: 'post_history_instructions', label: 'Post-History Instructions', path: 'data.post_history_instructions', type: 'string' },
    { key: 'creator_notes', label: 'Creator Notes', path: 'data.creator_notes', type: 'string' },
    { key: 'alternate_greetings', label: 'Alternate Greetings', path: 'data.alternate_greetings', type: 'array' },
    { key: 'depth_prompt', label: 'Depth Prompt', path: 'data.extensions.depth_prompt', type: 'object' },
    { key: 'character_book', label: 'Character Lorebook', path: 'data.character_book', type: 'object' },
]);

// ============================================================================
// STAGE DEFINITIONS
// ============================================================================

export const STAGES: readonly StageName[] = Object.freeze(['score', 'rewrite', 'analyze']);

export const STAGE_LABELS: Record<StageName, string> = {
    score: 'Score',
    rewrite: 'Rewrite',
    analyze: 'Analyze',
};

export const STAGE_ICONS: Record<StageName, string> = {
    score: 'fa-star-half-stroke',
    rewrite: 'fa-pen-fancy',
    analyze: 'fa-magnifying-glass-chart',
};

export const STAGE_DESCRIPTIONS: Record<StageName, string> = {
    score: 'Rate and critique the character card',
    rewrite: 'Generate an improved version',
    analyze: 'Compare original vs rewrite, check for soul loss',
};

// ============================================================================
// BASE SYSTEM PROMPT
// ============================================================================

export const BASE_SYSTEM_PROMPT = `You are an expert in TavernCard and SillyTavern character-card construction. Base every judgment on observable evidence in the supplied fields.

Field semantics:
- description stores stable identity, appearance, background, capabilities, and other facts the model needs throughout a chat.
- personality stores behavioral tendencies and decision patterns; repeating description facts here adds cost without adding guidance.
- scenario establishes the current situation, roles, and immediate context; it should contribute information distinct from description.
- first_mes demonstrates the opening situation and character behavior while leaving the user something concrete to respond to.
- mes_example demonstrates interaction patterns. Check that speaker labels, placeholders, and the card's chosen example-block separator convention are internally consistent and parseable.
- system_prompt and post_history_instructions are high-priority behavioral instructions. Description, personality, scenario, and these instruction fields are commonly resident in context on every turn, so repeated or low-information text has recurring token cost.
- alternate_greetings are indexed openings. Keep each proposal tied to its original index.
- depth_prompt is inserted at a configured depth and should contain instructions suited to that position.
- character_book entries are conditional context. Evaluate their keys, enabled state, internal consistency, and complete content.

Craft checks:
- Identify contradictions, exact or semantic duplication across fields, unresolved placeholders, malformed macros, malformed example blocks, and token use disproportionate to information.
- Distinguish deliberate reinforcement from redundant repetition.
- Treat prose and structured attribute formats as equivalent choices. Judge clarity, consistency, and utility within the format used rather than converting formats by preference.
- Preserve specific facts and behavioral constraints that make the character distinct. Do not invent defects or praise not supported by the card.`;

export const DEFAULT_USER_SYSTEM_PROMPT = '';

// ============================================================================
// BASE REFINEMENT PROMPT
// ============================================================================

export const BASE_REFINEMENT_PROMPT = 'Refine the current field-addressable rewrite using the structured analysis. Read verdict, preserved, lost, gained, issuesToAddress, and recommendations as evidence. Fix each supported issue, restore any lost card fact or behavior, retain supported improvements, and avoid changing fields that do not require a correction. Return proposed entries only for selected fields, retaining the canonical field key and original index.';

export const DEFAULT_USER_REFINEMENT_PROMPT = '';

export const DEFAULT_STAGE_SYSTEM_PROMPTS: Record<StageName, string> = {
    score: '',
    rewrite: '',
    analyze: '',
};

// ============================================================================
// BUILTIN PROMPT PRESETS
// ============================================================================

export const BUILTIN_PROMPT_PRESETS: readonly PromptPreset[] = Object.freeze([
    {
        id: 'builtin_score_default',
        name: 'Default Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Score every supplied field using this anchored rubric:
- 1-3: missing, unusable, contradictory, or so underspecified that it gives little reliable guidance.
- 4-6: functional but has material gaps, duplication, ambiguity, malformed conventions, or recurring token cost with limited information.
- 7-8: clear and useful with only localized defects; it fulfills the field's role and is mostly consistent with the rest of the card.
- 9-10: precise, internally consistent, token-efficient, and unusually effective at its field role; no material defect is evident.

For each field, give a score plus at least one exact quote or line reference from that field as evidence. Name strengths, weaknesses, and actionable suggestions. Check description/personality duplication, whether scenario adds a distinct situation, whether first_mes provides a response affordance, whether mes_example labels and separators are consistent, and the recurring cost of always-resident text. Compute an evidence-based overall score and rank the highest-impact improvements.

Worked example using fictional placeholder character Aster Vale:
Input excerpt: description says "Aster is a patient archivist"; personality repeats "patient archivist" and adds nothing else.
Output excerpt: {"field":"personality","score":4,"evidence":"\\"patient archivist\\" repeats description verbatim","strengths":"Consistent with description","weaknesses":"Adds no behavioral guidance","suggestions":"Replace repetition with observable decision patterns"}.`,
    },
    {
        id: 'builtin_score_quick',
        name: 'Quick Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Give a compact assessment using the same anchors: 1-3 unusable or severely deficient; 4-6 functional with material defects; 7-8 effective with localized defects; 9-10 precise, consistent, and token-efficient with no material defect. Cite short exact evidence for each finding. Report the overall score, up to three supported strengths, up to three highest-impact weaknesses, and a one-sentence summary.

Worked example for fictional placeholder character Aster Vale: "Scenario repeats the description's archive job without establishing a present situation" supports a score of 5 and the suggestion to add the immediate problem the opening begins with.`,
    },
    {
        id: 'builtin_rewrite_default',
        name: 'Default Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Propose field-addressable replacements for the selected fields. Use the score evidence to correct supported contradictions, duplication, ambiguity, malformed placeholders or example blocks, missing field function, and disproportionate token cost. Preserve facts, behavioral constraints, and effective material that do not need correction. Emit no entry for an unselected field. Use index -1 for ordinary fields and the original zero-based index for alternate_greetings.

Worked example using fictional placeholder character Aster Vale:
{"changes":[{"field":"personality","index":-1,"content":"Aster verifies claims against the archive before acting and becomes terse when records conflict.","rationale":"Replaces duplicated occupation text with observable behavior."}],"summary":"Removed cross-field duplication while retaining the archivist premise."}`,
    },
    {
        id: 'builtin_rewrite_conservative',
        name: 'Conservative Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: 'Propose only changes justified by a concrete defect in the score evidence. Retain all unaffected content and the card\'s existing format choices. Correct contradictions, broken placeholders, malformed examples, ambiguity, and redundant token use with the smallest sufficient replacement. Return field-addressable entries only for changed selected fields, using index -1 except for original alternate_greetings indices.',
    },
    {
        id: 'builtin_rewrite_expansive',
        name: 'Expansive Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: 'Address every material gap identified by the score evidence. Add information only when a selected field cannot fulfill its defined role without it; otherwise retain the current information density and format. Resolve contradictions, duplication, malformed conventions, and missing response affordances. Return field-addressable entries only for changed selected fields, using index -1 except for original alternate_greetings indices.',
    },
    {
        id: 'builtin_analyze_default',
        name: 'Default Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Compare the original fields with the proposed field-addressable rewrite using concrete facts and constraints from both.

Choose exactly one verdict:
- ACCEPT: the proposal resolves the targeted material defects, preserves required facts and behavior, and introduces no material contradiction or loss.
- NEEDS_REFINEMENT: the proposal is not a net regression but leaves a specific correctable defect, omission, duplication, or unsupported change.
- REGRESSION: the proposal removes or contradicts defining information, worsens field function, introduces a new material defect, or is less usable than the original.

List what was preserved, lost, and gained; assign an evidence-based soulPreservationScore; explain the assessment; and give concrete issuesToAddress and recommendations.

Worked example using fictional placeholder character Aster Vale: if the proposal removes the fact that Aster verifies claims before acting, return {"verdict":"REGRESSION","lost":["Verification-before-action behavior"],"issuesToAddress":["Restore the removed decision rule"]}.`,
    },
    {
        id: 'builtin_analyze_iteration',
        name: 'Iteration Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Compare the current rewrite with the original and the prior structured analysis. Identify which cited issues were resolved and which remain.

Use ACCEPT only when every material cited issue is resolved without material loss; NEEDS_REFINEMENT when a specific correctable issue remains without net regression; REGRESSION when defining information or field function is worse than before. Return concrete preserved, lost, gained, issuesToAddress, recommendations, and an evidence-based soulPreservationScore.`,
    },
    {
        id: 'builtin_analyze_quick',
        name: 'Quick Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: `Make a compact evidence-based comparison. ACCEPT means all targeted material defects are resolved with no material loss. NEEDS_REFINEMENT means a named correctable defect remains without net regression. REGRESSION means defining information or field function became worse. Cite the best supported improvement, the most important loss or remaining issue, and return exactly one verdict.

Worked example for fictional placeholder character Aster Vale: removing a duplicated occupation while adding a concrete decision rule and preserving all facts supports ACCEPT; deleting the decision rule supports REGRESSION.`,
    },
    {
        id: 'builtin_freeform',
        name: 'Freeform',
        stages: [],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        prompt: '',
    },
]);

// ============================================================================
// BUILTIN SCHEMA PRESETS
// ============================================================================

const SCORE_SCHEMA: StructuredOutputSchema = {
    name: 'CharacterScore',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            fieldScores: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        field: { type: 'string' },
                        score: { type: 'number' },
                        evidence: { type: 'string' },
                        strengths: { type: 'string' },
                        weaknesses: { type: 'string' },
                        suggestions: { type: 'string' },
                    },
                    required: ['field', 'score', 'evidence', 'strengths', 'weaknesses', 'suggestions'],
                },
            },
            overallScore: { type: 'number' },
            priorityImprovements: {
                type: 'array',
                items: { type: 'string' },
            },
            summary: { type: 'string' },
        },
        required: ['fieldScores', 'overallScore', 'priorityImprovements', 'summary'],
    },
};

const REWRITE_SCHEMA: StructuredOutputSchema = {
    name: 'CharacterRewrite',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            changes: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        field: {
                            type: 'string',
                            enum: CHARACTER_FIELDS.map(field => field.key),
                        },
                        index: { type: 'number' },
                        content: { type: 'string' },
                        rationale: { type: 'string' },
                    },
                    required: ['field', 'index', 'content', 'rationale'],
                },
            },
            summary: { type: 'string' },
        },
        required: ['changes', 'summary'],
    },
};

const QUICK_SCORE_SCHEMA: StructuredOutputSchema = {
    name: 'QuickScore',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            overallScore: { type: 'number' },
            strengths: {
                type: 'array',
                items: { type: 'string' },
            },
            weaknesses: {
                type: 'array',
                items: { type: 'string' },
            },
            summary: { type: 'string' },
        },
        required: ['overallScore', 'strengths', 'weaknesses', 'summary'],
    },
};

const ANALYZE_SCHEMA: StructuredOutputSchema = {
    name: 'CharacterAnalysis',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
            preserved: {
                type: 'array',
                items: { type: 'string' },
            },
            lost: {
                type: 'array',
                items: { type: 'string' },
            },
            gained: {
                type: 'array',
                items: { type: 'string' },
            },
            soulPreservationScore: { type: 'number' },
            soulAssessment: { type: 'string' },
            verdict: {
                type: 'string',
                enum: ['ACCEPT', 'NEEDS_REFINEMENT', 'REGRESSION'],
            },
            issuesToAddress: {
                type: 'array',
                items: { type: 'string' },
            },
            recommendations: {
                type: 'array',
                items: { type: 'string' },
            },
        },
        required: ['preserved', 'lost', 'gained', 'soulPreservationScore', 'soulAssessment', 'verdict', 'issuesToAddress', 'recommendations'],
    },
};

export const BUILTIN_SCHEMA_PRESETS: readonly SchemaPreset[] = Object.freeze([
    {
        id: 'builtin_schema_score',
        name: 'Default Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: SCORE_SCHEMA,
    },
    {
        id: 'builtin_schema_quick_score',
        name: 'Quick Score',
        stages: ['score'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: QUICK_SCORE_SCHEMA,
    },
    {
        id: 'builtin_schema_rewrite',
        name: 'Default Rewrite',
        stages: ['rewrite'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: REWRITE_SCHEMA,
    },
    {
        id: 'builtin_schema_analyze',
        name: 'Default Analyze',
        stages: ['analyze'],
        isBuiltin: true,
        presetVersion: CURRENT_PRESET_VERSION,
        createdAt: 0,
        updatedAt: 0,
        schema: ANALYZE_SCHEMA,
    },
]);

// ============================================================================
// DEFAULT GENERATION SETTINGS
// ============================================================================

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
    mode: 'current',
    profileId: null,
    maxTokensOverride: null,
};

// ============================================================================
// DEFAULT STAGE CONFIGS
// ============================================================================

export const DEFAULT_STAGE_DEFAULTS: Record<StageName, StageDefaults> = {
    score: {
        promptPresetId: 'builtin_score_default',
        customPrompt: '',
        schemaPresetId: 'builtin_schema_score',
        customSchema: '',
        useStructuredOutput: true,
    },
    rewrite: {
        promptPresetId: 'builtin_rewrite_default',
        customPrompt: '',
        schemaPresetId: 'builtin_schema_rewrite',
        customSchema: '',
        useStructuredOutput: true,
    },
    analyze: {
        promptPresetId: 'builtin_analyze_default',
        customPrompt: '',
        schemaPresetId: 'builtin_schema_analyze',
        customSchema: '',
        useStructuredOutput: true,
    },
};

// ============================================================================
// COMPLETE DEFAULT SETTINGS
// ============================================================================

export const DEFAULT_SETTINGS: Settings = Object.freeze({
    generationSettings: DEFAULT_GENERATION_SETTINGS,

    // Split prompts
    baseSystemPrompt: BASE_SYSTEM_PROMPT,
    userSystemPrompt: DEFAULT_USER_SYSTEM_PROMPT,
    baseRefinementPrompt: BASE_REFINEMENT_PROMPT,
    userRefinementPrompt: DEFAULT_USER_REFINEMENT_PROMPT,
    stageSystemPrompts: DEFAULT_STAGE_SYSTEM_PROMPTS,

    promptPresets: [...BUILTIN_PROMPT_PRESETS],
    schemaPresets: [...BUILTIN_SCHEMA_PRESETS],
    stageDefaults: DEFAULT_STAGE_DEFAULTS,
    debugMode: false,
    settingsVersion: SETTINGS_VERSION,
});

// ============================================================================
// TEMPLATE PLACEHOLDERS
// ============================================================================

/**
 * Template placeholders that can be used in prompts.
 * These are replaced at runtime with actual values.
 *
 * NOTE: We do NOT support {{user}} - the user's persona is irrelevant
 * to character card analysis. If someone uses it, it passes through unchanged.
 */
export const TEMPLATE_PLACEHOLDERS = {
    ORIGINAL_CHARACTER: '{{original_character}}',
    SCORE_RESULTS: '{{score_results}}',
    REWRITE_RESULTS: '{{rewrite_results}}',
    CURRENT_REWRITE: '{{current_rewrite}}',
    CURRENT_ANALYSIS: '{{current_analysis}}',
    ITERATION_NUMBER: '{{iteration_number}}',
    CHARACTER_NAME: '{{char_name}}',
} as const;

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const TOKEN_WARNING_THRESHOLD = 0.5;
export const TOKEN_DANGER_THRESHOLD = 0.8;

export const DEBOUNCE_DELAY = {
    SEARCH: 150,
    TOKEN_ESTIMATE: 300,
    SAVE: 500,
    VALIDATE: 500,
} as const;

export const MAX_DROPDOWN_RESULTS = 10;
export const MAX_DEBUG_LOG_ENTRIES = 100;
export const MAX_ITERATION_HISTORY = 20;
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_CONTEXT_SIZE = 8192;
