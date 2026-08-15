export type StructuredParseStatus = 'parsed' | 'repaired' | 'unparseable';

export type StructuredParseResult =
    | {
        status: 'parsed' | 'repaired';
        data: Record<string, unknown>;
        text: string;
        missingKeys: [];
    }
    | {
        status: 'unparseable';
        data: null;
        text: string;
        missingKeys: string[];
        error: string;
    };

const REASONING_TAGS = ['think', 'thinking', 'reasoning'] as const;
const MAX_JSON_CANDIDATES = 16;

/** Remove inline model reasoning while retaining the answer content. */
export function stripReasoningBlocks(response: string): string {
    let cleaned = response;

    for (const tag of REASONING_TAGS) {
        const completeBlock = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
        cleaned = cleaned.replace(completeBlock, '');
    }

    const leadingTag = cleaned.match(/^\s*<(think|thinking|reasoning)\b[^>]*>/i);
    if (!leadingTag) {
        return cleaned.trim();
    }

    const afterTag = cleaned.slice(leadingTag[0].length);
    for (let index = afterTag.indexOf('{'); index >= 0; index = afterTag.indexOf('{', index + 1)) {
        const candidate = extractBalancedJson(afterTag.slice(index));
        if (!candidate) continue;

        try {
            JSON.parse(candidate);
            return afterTag.slice(index).trim();
        } catch {
            // A reasoning trace can contain braces. Keep looking for the payload.
        }
    }

    return '';
}

/** Remove JSON or bare Markdown fence markers without changing their contents. */
export function stripCodeFences(response: string): string {
    return response
        .replace(/^\s*```(?:json)?[^\S\r\n]*(?:\r?\n)?/i, '')
        .replace(/(?:\r?\n)?[^\S\r\n]*```\s*$/, '')
        .trim();
}

/** Yield outermost balanced JSON objects in document order. */
function* iterateBalancedJson(response: string): Generator<string> {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < response.length; index++) {
        const character = response[index];

        if (start < 0) {
            if (character === '{') {
                start = index;
                depth = 1;
                inString = false;
                escaped = false;
            }
            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }

        if (character === '"') {
            inString = true;
        } else if (character === '{') {
            depth++;
        } else if (character === '}') {
            depth--;
            if (depth === 0) {
                yield response.slice(start, index + 1);
                start = -1;
            }
        }
    }
}

/**
 * Extract the first outermost balanced JSON object. Braces inside JSON strings
 * and escaped quote characters do not affect balancing.
 */
export function extractBalancedJson(response: string): string | null {
    return iterateBalancedJson(response).next().value ?? null;
}

/** Parse a provider response using the shared reasoning/fence/JSON repair chain. */
export function parseStructuredResponse(
    response: string,
    requiredKeys: readonly string[] = [],
): StructuredParseResult {
    const original = response.trim();
    const withoutReasoning = stripReasoningBlocks(original);
    let candidateCount = 0;
    let foundCandidate = false;
    let reachedCandidateLimit = false;
    let bestMissingKeys: string[] | null = null;
    let lastParseError = 'No balanced JSON object found';

    const tryCandidates = (text: string): StructuredParseResult | null => {
        for (const candidate of iterateBalancedJson(text)) {
            foundCandidate = true;
            if (candidateCount >= MAX_JSON_CANDIDATES) {
                reachedCandidateLimit = true;
                break;
            }
            candidateCount++;

            let parsed: unknown;
            try {
                parsed = JSON.parse(candidate);
            } catch (error) {
                lastParseError = error instanceof Error ? error.message : 'Invalid JSON response';
                continue;
            }

            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                lastParseError = 'Structured response must be a JSON object';
                continue;
            }

            const data = parsed as Record<string, unknown>;
            const missingKeys = requiredKeys.filter(key => !(key in data));
            if (missingKeys.length > 0) {
                if (bestMissingKeys === null || missingKeys.length < bestMissingKeys.length) {
                    bestMissingKeys = missingKeys;
                }
                continue;
            }

            return {
                status: candidate === original ? 'parsed' : 'repaired',
                data,
                text: candidate,
                missingKeys: [],
            };
        }
        return null;
    };

    let result = tryCandidates(withoutReasoning);
    if (result) return result;

    if (!foundCandidate) {
        result = tryCandidates(stripCodeFences(withoutReasoning));
        if (result) return result;
    }

    const diagnosticMissingKeys = bestMissingKeys as string[] | null;
    if (diagnosticMissingKeys) {
        return {
            status: 'unparseable',
            data: null,
            text: response,
            missingKeys: diagnosticMissingKeys,
            error: `Missing required fields: ${diagnosticMissingKeys.join(', ')}`,
        };
    }

    return {
        status: 'unparseable',
        data: null,
        text: response,
        missingKeys: [],
        error: reachedCandidateLimit
            ? `No valid structured response found in the first ${MAX_JSON_CANDIDATES} JSON objects`
            : lastParseError,
    };
}

export type ResponseVerdict = 'accept' | 'needs_refinement' | 'regression' | 'indeterminate';

/** Prefer the parsed verdict enum; use whole-token text heuristics only when parsing fails. */
export function extractVerdictFromResponse(response: string): ResponseVerdict {
    const parsed = parseStructuredResponse(response);
    if (parsed.status !== 'unparseable') {
        switch (parsed.data.verdict) {
            case 'ACCEPT': return 'accept';
            case 'NEEDS_REFINEMENT': return 'needs_refinement';
            case 'REGRESSION': return 'regression';
            default: return 'indeterminate';
        }
    }

    const verdicts = new Set<ResponseVerdict>();
    if (/\bACCEPT\b/i.test(response)) verdicts.add('accept');
    if (/\bREGRESSION\b/i.test(response) || /\b(?:STEP\s+BACKWARD|WORSE\s+THAN)\b/i.test(response)) {
        verdicts.add('regression');
    }
    if (/\bNEEDS(?:_|\s)+(?:REFINEMENT|WORK)\b/i.test(response)) {
        verdicts.add('needs_refinement');
    }

    return verdicts.size === 1 ? [...verdicts][0] : 'indeterminate';
}
