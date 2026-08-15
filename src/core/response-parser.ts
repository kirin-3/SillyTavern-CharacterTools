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
        .replace(/```(?:json)?\s*/gi, '')
        .replace(/```/g, '')
        .trim();
}

/**
 * Extract the first outermost balanced JSON object. Braces inside JSON strings
 * and escaped quote characters do not affect balancing.
 */
export function extractBalancedJson(response: string): string | null {
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
                return response.slice(start, index + 1);
            }
        }
    }

    return null;
}

/** Parse a provider response using the shared reasoning/fence/JSON repair chain. */
export function parseStructuredResponse(
    response: string,
    requiredKeys: readonly string[] = [],
): StructuredParseResult {
    const original = response.trim();
    const withoutReasoning = stripReasoningBlocks(original);
    const withoutFences = stripCodeFences(withoutReasoning);
    const extracted = extractBalancedJson(withoutFences);
    const candidate = extracted ?? withoutFences;

    let parsed: unknown;
    try {
        parsed = JSON.parse(candidate);
    } catch (error) {
        return {
            status: 'unparseable',
            data: null,
            text: response,
            missingKeys: [],
            error: error instanceof Error ? error.message : 'Invalid JSON response',
        };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            status: 'unparseable',
            data: null,
            text: response,
            missingKeys: [],
            error: 'Structured response must be a JSON object',
        };
    }

    const data = parsed as Record<string, unknown>;
    const missingKeys = requiredKeys.filter(key => !(key in data));
    if (missingKeys.length > 0) {
        return {
            status: 'unparseable',
            data: null,
            text: response,
            missingKeys,
            error: `Missing required fields: ${missingKeys.join(', ')}`,
        };
    }

    const repaired = candidate !== original;
    return {
        status: repaired ? 'repaired' : 'parsed',
        data,
        text: candidate,
        missingKeys: [],
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
