// src/generator.ts
//
// Handles LLM generation for pipeline stages and refinement.
// Supports both ST's current settings and custom API configuration.

import { getSettings, getFullSystemPrompt } from './settings';
import { debugLog, logError } from '../debug';
import type {
    StructuredOutputSchema,
    GenerationResult,
    PipelineState,
    StageName,
} from '../types';
import { buildStagePrompt, buildRefinementPrompt, getStageSchema } from './pipeline';

// ============================================================================
// API STATUS
// ============================================================================

/**
 * Check if the API is ready for generation
 */
export function isApiReady(): boolean {
    const { onlineStatus } = SillyTavern.getContext();

    // Handle various status string formats across different APIs
    // Some report uppercase, some lowercase, some might be null/undefined
    if (!onlineStatus) return false;

    const status = String(onlineStatus).toLowerCase();
    return status === 'valid'
        || status === 'connected'
        || status === 'ok'
        || status === 'ready';
}

/**
 * Get current API info for display
 */
export function getApiInfo(): { source: string; model: string; isReady: boolean } {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    if (settings.useCurrentSettings) {
        const ccs = context.chatCompletionSettings || {};
        const source = ccs.chat_completion_source || context.mainApi || 'unknown';

        // Different APIs store their model selection in different properties
        // Try them in rough order of popularity
        const model =
            ccs.openrouter_model ||
            ccs.model_openai_select ||
            ccs.model_google_select ||      // Google AI Studio / Vertex
            ccs.model_claude_select ||       // Anthropic direct
            ccs.model_mistralai_select ||
            ccs.model_cohere_select ||
            ccs.model_perplexity_select ||
            ccs.model_groq_select ||
            ccs.model_ai21_select ||
            ccs.model_deepseek_select ||
            ccs.model_custom_select ||       // Custom API
            ccs.model ||                     // Generic fallback
            context.textCompletionSettings?.model ||  // Text completion fallback
            'unknown';

        return {
            source,
            model: String(model),
            isReady: isApiReady(),
        };
    }

    return {
        source: settings.generationConfig.source,
        model: settings.generationConfig.model,
        isReady: isApiReady(),
    };
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Run generation for a pipeline stage.
 */
export async function runStageGeneration(
    state: PipelineState,
    stage: StageName,
    signal?: AbortSignal,
): Promise<GenerationResult> {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    // Pre-flight checks
    if (signal?.aborted) {
        return { success: false, error: 'Generation cancelled' };
    }

    if (!state.character) {
        return { success: false, error: 'No character selected' };
    }

    if (!isApiReady()) {
        const status = context.onlineStatus || 'unknown';
        logError('API not ready', { onlineStatus: status });
        return {
            success: false,
            error: `API is not connected (status: ${status}). Check your connection settings.`,
        };
    }

    // Build prompt - this already processes our placeholders via processPromptTemplate
    const userPrompt = buildStagePrompt(state, stage);
    if (!userPrompt) {
        return { success: false, error: 'No prompt configured for this stage' };
    }

    // Get schema if structured output is enabled
    const config = state.configs[stage];
    const jsonSchema = config.useStructuredOutput ? getStageSchema(state, stage) : null;

    // Get full system prompt for this stage
    const systemPrompt = getFullSystemPrompt(stage);

    const apiInfo = getApiInfo();
    debugLog('info', 'Starting stage generation', {
        stage,
        character: state.character.name,
        useCurrentSettings: settings.useCurrentSettings,
        useStructured: !!jsonSchema,
        schemaName: jsonSchema?.name,
        promptLength: userPrompt.length,
        systemPromptLength: systemPrompt.length,
        apiSource: apiInfo.source,
        apiModel: apiInfo.model,
    });

    const result = await executeGeneration(
        systemPrompt,
        userPrompt,
        jsonSchema,
        signal,
        settings.useCurrentSettings,
    );

    // If structured output was requested, validate the response
    if (result.success && jsonSchema) {
        return validateStructuredResponse(result.response, jsonSchema);
    }

    return result;
}

/**
 * Run refinement generation.
 */
export async function runRefinementGeneration(
    state: PipelineState,
    signal?: AbortSignal,
): Promise<GenerationResult> {
    const context = SillyTavern.getContext();
    const settings = getSettings();

    // Pre-flight checks
    if (signal?.aborted) {
        return { success: false, error: 'Generation cancelled' };
    }

    if (!state.character) {
        return { success: false, error: 'No character selected' };
    }

    if (!state.results.rewrite || !state.results.analyze) {
        return { success: false, error: 'Refinement requires both rewrite and analyze results' };
    }

    if (!isApiReady()) {
        const status = context.onlineStatus || 'unknown';
        logError('API not ready', { onlineStatus: status });
        return {
            success: false,
            error: `API is not connected (status: ${status}). Check your connection settings.`,
        };
    }

    // Build refinement prompt - already processes our placeholders
    const userPrompt = buildRefinementPrompt(state);
    if (!userPrompt) {
        return { success: false, error: 'Failed to build refinement prompt' };
    }

    // Get system prompt (use 'rewrite' stage additions for refinement)
    const systemPrompt = getFullSystemPrompt('rewrite');

    debugLog('info', 'Starting refinement generation', {
        iteration: state.iterationCount + 1,
        character: state.character.name,
        promptLength: userPrompt.length,
    });

    // Refinement doesn't use structured output
    return await executeGeneration(
        systemPrompt,
        userPrompt,
        null,
        signal,
        settings.useCurrentSettings,
    );
}

/**
 * Validate structured response and fall back gracefully if parsing fails
 */
function validateStructuredResponse(
    response: string,
    schema: StructuredOutputSchema,
): GenerationResult {
    try {
        const parsed = JSON.parse(response);

        // Basic structure validation - check required fields exist
        if (schema.value.required && Array.isArray(schema.value.required)) {
            const missing = schema.value.required.filter(
                field => !(field in parsed),
            );

            if (missing.length > 0) {
                debugLog('info', 'Structured response missing required fields, returning as unstructured', {
                    missing,
                    schemaName: schema.name,
                });
                return {
                    success: true,
                    response,
                    isStructured: false,
                };
            }
        }

        return {
            success: true,
            response,
            isStructured: true,
        };
    } catch (e) {
        debugLog('info', 'Failed to parse structured response, returning as unstructured', {
            error: (e as Error).message,
            schemaName: schema.name,
            responsePreview: response.substring(0, 200),
        });

        return {
            success: true,
            response,
            isStructured: false,
        };
    }
}

/**
 * Core generation execution
 */
async function executeGeneration(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: StructuredOutputSchema | null,
    signal: AbortSignal | undefined,
    useCurrentSettings: boolean,
): Promise<GenerationResult> {
    try {
        let response: string;

        if (useCurrentSettings) {
            response = await generateWithCurrentSettings(
                systemPrompt,
                userPrompt,
                jsonSchema,
                signal,
            );
        } else {
            response = await generateWithCustomSettings(
                systemPrompt,
                userPrompt,
                jsonSchema,
                signal,
            );
        }

        if (signal?.aborted) {
            return { success: false, error: 'Generation cancelled' };
        }

        if (!response || response.trim() === '') {
            logError('Empty response', null);
            return { success: false, error: 'Empty response from API' };
        }

        debugLog('info', 'Generation complete', {
            responseLength: response.length,
            isStructured: !!jsonSchema,
        });

        return {
            success: true,
            response,
            isStructured: !!jsonSchema,
        };
    } catch (err) {
        if ((err as Error).name === 'AbortError' || signal?.aborted) {
            debugLog('info', 'Generation aborted', null);
            return { success: false, error: 'Generation cancelled' };
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        logError('Generation exception', { message: errorMessage, error: err });

        // Provide more helpful error messages for common issues
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
            return { success: false, error: 'API authentication failed. Check your API key.' };
        }
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            return { success: false, error: 'Rate limited. Please wait and try again.' };
        }
        if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
            return { success: false, error: 'API server error. The service may be temporarily unavailable.' };
        }
        if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
            return { success: false, error: 'Request timed out. Try again or check your connection.' };
        }
        if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
            return { success: false, error: 'Network error. Check your internet connection.' };
        }

        return { success: false, error: errorMessage };
    }
}

// ============================================================================
// GENERATION METHODS
// ============================================================================

/**
 * Generate using ST's current API settings via generateRaw.
 *
 * IMPORTANT: We do NOT use substituteParams here. Our prompts are already
 * processed by processPromptTemplate which handles our placeholders.
 * Using substituteParams would incorrectly replace Ruby/Nate with
 * the active chat character/persona instead of the character being analyzed.
 */
async function generateWithCurrentSettings(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: StructuredOutputSchema | null,
    signal?: AbortSignal,
): Promise<string> {
    const { generateRaw } = SillyTavern.getContext();

    // Validate generateRaw is available
    if (typeof generateRaw !== 'function') {
        throw new Error('generateRaw not available - SillyTavern version may be incompatible');
    }

    debugLog('request', 'generateRaw request', {
        hasSchema: !!jsonSchema,
        schemaName: jsonSchema?.name,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    // Pass prompts directly - NO substituteParams
    // Our placeholders are already processed by processPromptTemplate
    const rawResponse = await generateRaw({
        prompt: userPrompt,
        systemPrompt: systemPrompt,
        jsonSchema: jsonSchema ?? undefined,
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const response = ensureString(rawResponse);

    debugLog('response', 'generateRaw response', {
        type: typeof rawResponse,
        rawType: rawResponse === null ? 'null' : rawResponse === undefined ? 'undefined' : typeof rawResponse,
        length: response.length,
        preview: response.substring(0, 200),
    });

    return response;
}

/**
 * Generate using custom API settings via ChatCompletionService.
 * This bypasses ST's default settings and uses explicit configuration.
 * Note: This is more likely to have compatibility issues with non-standard APIs.
 */
async function generateWithCustomSettings(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: StructuredOutputSchema | null,
    signal?: AbortSignal,
): Promise<string> {
    const { ChatCompletionService } = SillyTavern.getContext();
    const settings = getSettings();
    const config = settings.generationConfig;

    // Validate ChatCompletionService is available
    if (!ChatCompletionService || typeof ChatCompletionService.sendRequest !== 'function') {
        throw new Error('ChatCompletionService not available - falling back may be needed');
    }

    // Build request options - these are somewhat OpenAI-compatible
    // Other APIs may require different parameters
    const requestOptions: Record<string, unknown> = {
        stream: true,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        chat_completion_source: config.source,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
    };

    // Model parameter - some sources use different keys
    // Try to be smart about which one to use
    if (config.source === 'openrouter') {
        requestOptions.model = config.model;
    } else if (config.source === 'openai' || config.source === 'azure_openai') {
        requestOptions.model = config.model;
    } else {
        // Generic - set both in case the API needs one or the other
        requestOptions.model = config.model;
    }

    // Optional parameters - only include if non-default to avoid API issues
    if (config.frequencyPenalty !== 0) {
        requestOptions.frequency_penalty = config.frequencyPenalty;
    }
    if (config.presencePenalty !== 0) {
        requestOptions.presence_penalty = config.presencePenalty;
    }
    if (config.topP !== 1) {
        requestOptions.top_p = config.topP;
    }

    if (jsonSchema) {
        requestOptions.json_schema = jsonSchema;
    }

    debugLog('request', 'ChatCompletionService request', {
        source: config.source,
        model: config.model,
        stream: true,
        hasSchema: !!jsonSchema,
        messageCount: 2,
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const result = await ChatCompletionService.sendRequest(requestOptions);

    debugLog('response', 'ChatCompletionService result type', {
        type: typeof result,
        isFunction: typeof result === 'function',
        isGenerator: result && typeof result === 'object' && Symbol.asyncIterator in result,
        isNull: result === null,
        isUndefined: result === undefined,
    });

    let response: string;

    // Handle different response formats
    if (typeof result === 'function') {
        // Streaming generator function
        response = await consumeStreamGenerator(result, signal);
    } else if (result && typeof result === 'object') {
        const resultObj = result as Record<string, unknown>;

        // Check for error responses
        if (resultObj.error) {
            logError('API returned error in response object', result);
            const errorMsg = typeof resultObj.error === 'string'
                ? resultObj.error
                : JSON.stringify(resultObj.error);
            throw new Error(`API error: ${errorMsg}`);
        }

        // Extract content from various possible response formats
        // Type assertions needed for nested property access
        const message = resultObj.message as Record<string, unknown> | undefined;
        const choices = resultObj.choices as Array<Record<string, unknown>> | undefined;

        response = ensureString(
            resultObj.content ||
            resultObj.text ||
            message?.content ||
            (choices?.[0]?.message as Record<string, unknown> | undefined)?.content ||
            choices?.[0]?.text ||
            result,
        );
    } else if (typeof result === 'string') {
        response = result;
    } else {
        // Last resort - stringify whatever we got
        response = ensureString(result);
    }

    debugLog('response', 'Final response', {
        length: response.length,
        preview: response.substring(0, 200),
    });

    return response;
}

/**
 * Consume a streaming generator and return the final accumulated text
 */
async function consumeStreamGenerator(
    generatorFn: () => AsyncGenerator<unknown>,
    signal?: AbortSignal,
): Promise<string> {
    let finalText = '';
    let generator: AsyncGenerator<unknown> | null = null;

    try {
        generator = generatorFn();

        for await (const chunk of generator) {
            if (signal?.aborted) {
                debugLog('info', 'Stream aborted', { textSoFar: finalText.length });
                try {
                    await generator.return(undefined);
                } catch {
                    // Ignore errors during cleanup
                }
                throw new DOMException('Aborted', 'AbortError');
            }

            // Handle various chunk formats
            if (typeof chunk === 'string') {
                finalText = chunk;
            } else if (chunk && typeof chunk === 'object') {
                const chunkObj = chunk as Record<string, unknown>;

                // Accumulated text (most common)
                if (typeof chunkObj.text === 'string') {
                    finalText = chunkObj.text;
                }
                // Delta/incremental text
                else if (typeof chunkObj.delta === 'string') {
                    finalText += chunkObj.delta;
                }
                // Content field
                else if (typeof chunkObj.content === 'string') {
                    finalText = chunkObj.content;
                }

                // Check for errors in chunk
                if (chunkObj.error) {
                    const errorMsg = typeof chunkObj.error === 'string'
                        ? chunkObj.error
                        : JSON.stringify(chunkObj.error);
                    throw new Error(errorMsg);
                }
            }
        }
    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            throw err;
        }

        logError('Stream consumption error', {
            error: err,
            textSoFar: finalText.length,
        });

        // Clean up generator
        if (generator) {
            try {
                await generator.return(undefined);
            } catch {
                // Ignore errors during cleanup
            }
        }

        // Return partial response if we have any
        if (finalText) {
            debugLog('info', 'Returning partial response after stream error', {
                length: finalText.length,
            });
            return finalText;
        }

        throw err;
    }

    debugLog('info', 'Stream consumed', { finalLength: finalText.length });
    return finalText;
}

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

/**
 * Get accurate token count for a stage
 */
export async function getStageTokenCount(
    state: PipelineState,
    stage: StageName,
): Promise<{ promptTokens: number; contextSize: number; percentage: number } | null> {
    const { getTokenCountAsync, maxContext } = SillyTavern.getContext();

    if (!state.character) return null;

    // Validate getTokenCountAsync is available
    if (typeof getTokenCountAsync !== 'function') {
        debugLog('info', 'getTokenCountAsync not available', null);
        return null;
    }

    try {
        const prompt = buildStagePrompt(state, stage);
        if (!prompt) return null;

        const systemPrompt = getFullSystemPrompt(stage);
        const fullPrompt = systemPrompt + '\n\n' + prompt;
        const promptTokens = await getTokenCountAsync(fullPrompt);
        const contextSize = maxContext || 8192; // Fallback if not set
        const percentage = Math.round((promptTokens / contextSize) * 100);

        return {
            promptTokens,
            contextSize,
            percentage,
        };
    } catch (e) {
        logError('Token count failed', e);
        return null;
    }
}

/**
 * Get token count for refinement prompt
 */
export async function getRefinementTokenCount(
    state: PipelineState,
): Promise<{ promptTokens: number; contextSize: number; percentage: number } | null> {
    const { getTokenCountAsync, maxContext } = SillyTavern.getContext();

    if (!state.character || !state.results.rewrite || !state.results.analyze) return null;

    if (typeof getTokenCountAsync !== 'function') {
        debugLog('info', 'getTokenCountAsync not available', null);
        return null;
    }

    try {
        const prompt = buildRefinementPrompt(state);
        if (!prompt) return null;

        const systemPrompt = getFullSystemPrompt('rewrite');
        const fullPrompt = systemPrompt + '\n\n' + prompt;
        const promptTokens = await getTokenCountAsync(fullPrompt);
        const contextSize = maxContext || 8192;
        const percentage = Math.round((promptTokens / contextSize) * 100);

        return {
            promptTokens,
            contextSize,
            percentage,
        };
    } catch (e) {
        logError('Refinement token count failed', e);
        return null;
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Safely convert any value to a string
 */
function ensureString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        // Handle objects that might have a text/content property
        const obj = value as Record<string, unknown>;
        if (typeof obj.text === 'string') return obj.text;
        if (typeof obj.content === 'string') return obj.content;
        if (typeof obj.message === 'string') return obj.message;

        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}
