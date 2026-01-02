/* eslint-disable @typescript-eslint/no-explicit-any */
// globals.d.ts
//
// Type definitions for SillyTavern Extension API
// Based on ST API documentation v2.0 (2025-01-02)

export {};

// ============================================================================
// CHAT COMPLETION TYPES
// ============================================================================

interface ChatCompletionMessage {
    name?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface ChatCompletionPayload {
    stream?: boolean;
    messages: ChatCompletionMessage[];
    model?: string;
    chat_completion_source: string;
    max_tokens: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    min_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    custom_url?: string;
    reverse_proxy?: string;
    proxy_password?: string;
    custom_prompt_post_processing?: string;
    json_schema?: StructuredOutputSchema;
    use_sysprompt?: boolean;
    [key: string]: unknown;
}

interface ExtractedData {
    content: string;
    reasoning: string;
}

interface StreamResponse {
    text: string;
    swipes: string[];
    state: {
        reasoning?: string;
        image?: string;
    };
}

interface ProcessRequestOptions {
    presetName?: string;
    instructName?: string;
    instructSettings?: Record<string, unknown>;
}

// ============================================================================
// TEXT COMPLETION TYPES
// ============================================================================

interface TextCompletionPayload {
    stream?: boolean;
    prompt: string | ChatCompletionMessage[];
    max_tokens: number;
    api_type: string;
    api_server?: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    min_p?: number;
    rep_pen?: number;
    [key: string]: unknown;
}

// ============================================================================
// CONNECTION PROFILE TYPES
// ============================================================================

interface ConnectionProfile {
    id: string;
    mode: 'cc' | 'tc';
    exclude: string[];
    api: string;
    preset: string;
    model: string;
    proxy: string;
    'stop-strings': string;
    'start-reply-with': string;
    'reasoning-template': string;
    'prompt-post-processing': string;
    'secret-id': string;
    name: string;
}

interface CMRSSendRequestOptions {
    stream?: boolean;
    signal?: AbortSignal | null;
    extractData?: boolean;
    includePreset?: boolean;
    includeInstruct?: boolean;
    instructSettings?: Record<string, unknown>;
}

interface ApiMapEntry {
    selected: string;
    button: string;
    source: string;
}

// ============================================================================
// GENERATION TYPES
// ============================================================================

interface GenerateRawOptions {
    prompt: string | ChatCompletionMessage[];
    api?: string | null;
    instructOverride?: boolean;
    quietToLoud?: boolean;
    systemPrompt?: string;
    responseLength?: number | null;
    trimNames?: boolean;
    prefill?: string;
    jsonSchema?: StructuredOutputSchema | null;
}

// ============================================================================
// STRUCTURED OUTPUT / JSON SCHEMA
// ============================================================================

interface StructuredOutputSchema {
    name: string;
    strict?: boolean;
    value: JsonSchemaValue;
}

interface JsonSchemaValue {
    $schema?: string;
    type: string;
    properties?: Record<string, JsonSchemaValue>;
    required?: string[];
    additionalProperties?: boolean;
    items?: JsonSchemaValue | JsonSchemaValue[];
    $defs?: Record<string, JsonSchemaValue>;
    definitions?: Record<string, JsonSchemaValue>;
    anyOf?: JsonSchemaValue[];
    allOf?: JsonSchemaValue[];
    oneOf?: JsonSchemaValue[];
    enum?: unknown[];
    const?: unknown;
    format?: string;
    pattern?: string;
    description?: string;
    title?: string;
    default?: unknown;
    $ref?: string;
    minItems?: number;
    maxItems?: number;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    [key: string]: unknown;
}

// ============================================================================
// PRESET MANAGER
// ============================================================================

interface PresetListResult {
    presets: Record<string, unknown>[];
    preset_names: Record<string, string>;
    settings: Record<string, unknown>;
}

interface PresetManager {
    apiId: string;

    // Read methods
    getAllPresets(): string[];
    findPreset(name: string): Record<string, unknown> | undefined;
    getSelectedPreset(): Record<string, unknown> | undefined;
    getSelectedPresetName(): string;
    getPresetList(): PresetListResult;
    getCompletionPresetByName(name: string): Record<string, unknown> | undefined;
    getDefaultPreset(): Record<string, unknown> | undefined;
    getPresetSettings(): Record<string, unknown>;
    isKeyedApi(): boolean;
    isAdvancedFormatting(): boolean;

    // Mutation methods
    selectPreset(name: string): Promise<boolean>;
    updatePreset(): Promise<void>;
    savePresetAs(name: string): Promise<void>;
    savePreset(): Promise<void>;
    renamePreset(oldName: string, newName: string): Promise<void>;
    deletePreset(name: string): Promise<void>;
    updateList(): void;

    // Extension field methods
    readPresetExtensionField(presetName: string, fieldName: string): unknown;
    writePresetExtensionField(presetName: string, fieldName: string, value: unknown): Promise<void>;
}

// ============================================================================
// CHAT COMPLETION SETTINGS
// ============================================================================

interface ChatCompletionSettings {
    // Core settings
    chat_completion_source: string;
    openai_max_context: number;
    openai_max_tokens: number;
    stream_openai: boolean;
    bypass_status_check: boolean;

    // Sampler settings
    temp_openai: number;
    top_p_openai: number;
    top_k_openai: number;
    min_p_openai: number;
    top_a_openai: number;
    freq_pen_openai: number;
    pres_pen_openai: number;
    repetition_penalty_openai: number;

    // Per-provider model settings
    openai_model: string;
    claude_model: string;
    google_model: string;
    openrouter_model: string;
    deepseek_model: string;
    groq_model: string;
    mistralai_model: string;
    perplexity_model: string;
    cohere_model: string;
    xai_model: string;
    custom_model: string;

    // Allow dynamic access for other providers
    [key: string]: unknown;
}

// ============================================================================
// TEXT COMPLETION SETTINGS
// ============================================================================

interface TextCompletionSettings {
    preset: string;
    streaming: boolean;
    temp: number;
    top_p: number;
    top_k: number;
    min_p: number;
    rep_pen: number;
    rep_pen_range: number;
    freq_pen: number;
    presence_pen: number;
    [key: string]: unknown;
}

// ============================================================================
// SERVICES
// ============================================================================

interface ChatCompletionService {
    createRequestData(payload: Partial<ChatCompletionPayload>): ChatCompletionPayload;

    sendRequest(
        data: ChatCompletionPayload,
        extractData?: boolean,
        signal?: AbortSignal
    ): Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>;

    processRequest(
        requestData: Partial<ChatCompletionPayload>,
        options: ProcessRequestOptions,
        extractData?: boolean,
        signal?: AbortSignal
    ): Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>;

    presetToGeneratePayload(
        preset: Record<string, unknown>,
        overridePreset?: Record<string, unknown>,
        overridePayload?: Partial<ChatCompletionPayload>
    ): Promise<ChatCompletionPayload>;
}

interface TextCompletionService {
    createRequestData(payload: Partial<TextCompletionPayload>): TextCompletionPayload;

    sendRequest(
        data: TextCompletionPayload,
        extractData?: boolean,
        signal?: AbortSignal
    ): Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>;

    constructPrompt(
        messages: ChatCompletionMessage[],
        instructPreset: string | Record<string, unknown>,
        instructSettings?: Record<string, unknown>
    ): string;

    processRequest(
        requestData: Partial<TextCompletionPayload>,
        options: ProcessRequestOptions,
        extractData?: boolean,
        signal?: AbortSignal
    ): Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>;

    presetToGeneratePayload(
        preset: Record<string, unknown>,
        overridePreset?: Record<string, unknown>,
        overridePayload?: Partial<TextCompletionPayload>
    ): Promise<TextCompletionPayload>;
}

interface ConnectionManagerRequestService {
    defaultSendRequestParams: CMRSSendRequestOptions;

    getAllowedTypes(): { openai: string; textgenerationwebui: string };

    getSupportedProfiles(): ConnectionProfile[];

    getProfile(profileId: string): ConnectionProfile | undefined;

    isProfileSupported(profile: ConnectionProfile): boolean;

    validateProfile(profile: ConnectionProfile): ApiMapEntry | null;

    sendRequest(
        profileId: string,
        prompt: string | ChatCompletionMessage[],
        maxTokens: number,
        options?: Partial<CMRSSendRequestOptions>,
        overridePayload?: Record<string, unknown>
    ): Promise<ExtractedData | (() => AsyncGenerator<StreamResponse>)>;

    constructPrompt(
        prompt: string | ChatCompletionMessage[],
        profileId: string,
        instructSettings?: Record<string, unknown> | null
    ): string | ChatCompletionMessage[];

    handleDropdown(event: Event): void;
}

// ============================================================================
// POPUP TYPES
// ============================================================================

interface PopupOptions {
    wide?: boolean;
    large?: boolean;
    allowVerticalScrolling?: boolean;
    okButton?: string | boolean;
    cancelButton?: string | boolean;
    rows?: number;
    customButtons?: Array<{
        text: string;
        result: unknown;
        classes?: string[];
        action?: () => void;
        appendAtEnd?: boolean;
    }>;
    defaultResult?: unknown;
    allowHorizontalScrolling?: boolean;
    cropAspect?: number;
}

interface PopupShowHelpers {
    input(title: string, message: string, defaultValue?: string, options?: PopupOptions): Promise<string | null>;
    confirm(title: string, message: string, options?: PopupOptions): Promise<boolean>;
}

interface PopupClass {
    new (content: string, type: number, inputValue?: string, options?: PopupOptions): PopupInstance;
    show: PopupShowHelpers;
}

interface PopupInstance {
    show(): Promise<unknown>;
    complete(result: unknown): Promise<void>;
}

// ============================================================================
// EVENT SYSTEM
// ============================================================================

interface EventSourceType {
    on(event: string, callback: (...args: any[]) => void): void;
    once(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): Promise<void>;
    removeListener(event: string, callback: (...args: any[]) => void): void;
    makeLast(event: string, callback: (...args: any[]) => void): void;
    makeFirst(event: string, callback: (...args: any[]) => void): void;
}

// ============================================================================
// MAIN CONTEXT
// ============================================================================

interface SillyTavernContext {
    // ===== CORE STATE =====
    chat: any[];
    characters: any[];
    groups: any[];
    characterId: number | undefined;
    groupId: string | null;
    chatId: string | undefined;
    name1: string;
    name2: string;
    onlineStatus: string;
    maxContext: number;  // LEGACY - use chatCompletionSettings.openai_max_context for chat APIs
    mainApi: 'openai' | 'textgenerationwebui';
    chatMetadata: Record<string, any>;
    extensionSettings: Record<string, any>;

    // ===== SETTINGS OBJECTS =====
    chatCompletionSettings: ChatCompletionSettings;
    textCompletionSettings: TextCompletionSettings;
    powerUserSettings: Record<string, any>;

    // ===== EVENTS =====
    eventSource: EventSourceType;
    eventTypes: Record<string, string>;

    // ===== CORE FUNCTIONS =====
    saveSettingsDebounced(): void;
    saveMetadataDebounced(): void;
    getRequestHeaders(): Record<string, string>;
    uuidv4(): string;

    // ===== GENERATION =====
    generateRaw(options: GenerateRawOptions): Promise<string>;
    generateQuietPrompt(options: {
        quietPrompt: string;
        quietToLoud?: boolean;
        skipWIAN?: boolean;
    }): Promise<string>;
    stopGeneration(): boolean;

    // ===== TOKEN COUNTING =====
    getTokenCountAsync(text: string, padding?: number): Promise<number>;
    getTokenizerModel(): string;

    // ===== MODEL ACCESS =====
    getChatCompletionModel(): string;

    // ===== TEMPLATE/SUBSTITUTION =====
    substituteParams(text: string): string;
    getThumbnailUrl(type: string, file: string): string;

    // ===== CHARACTER OPERATIONS =====
    unshallowCharacter(characterId: number): Promise<void>;
    writeExtensionField(characterId: number, key: string, value: any): Promise<void>;

    // ===== PRESET MANAGER =====
    getPresetManager(apiId?: string): PresetManager | null;

    // ===== SERVICES =====
    ChatCompletionService: ChatCompletionService;
    TextCompletionService: TextCompletionService;
    ConnectionManagerRequestService: ConnectionManagerRequestService;

    // ===== UI =====
    Popup: PopupClass;
    POPUP_TYPE: {
        TEXT: number;
        CONFIRM: number;
        INPUT: number;
        DISPLAY: number;
        CROP: number;
    };
    POPUP_RESULT: {
        AFFIRMATIVE: number;
        NEGATIVE: number;
        CANCELLED: symbol;
    };
    renderExtensionTemplateAsync(
        extensionPath: string,
        templatePath: string,
        data?: Record<string, any>,
        sanitize?: boolean
    ): Promise<string>;
}

// ============================================================================
// LIBRARIES
// ============================================================================

interface SillyTavernLibs {
    lodash: typeof import('lodash');
    Fuse: typeof import('fuse.js');
    DOMPurify: {
        sanitize(html: string, options?: { ALLOWED_TAGS?: string[]; ALLOWED_ATTR?: string[] }): string;
    };
    moment: typeof import('moment');
    localforage: {
        getItem<T>(key: string): Promise<T | null>;
        setItem<T>(key: string, value: T): Promise<T>;
        removeItem(key: string): Promise<void>;
        keys(): Promise<string[]>;
        clear(): Promise<void>;
    };
    showdown: {
        Converter: new (options?: Record<string, unknown>) => {
            makeHtml(text: string): string;
            setOption(key: string, value: unknown): void;
        };
    };
    hljs: {
        highlight(code: string, options: { language: string }): { value: string };
        highlightAuto(code: string): { value: string; language: string };
        listLanguages(): string[];
    };
}

// ============================================================================
// GLOBAL DECLARATIONS
// ============================================================================

declare global {
    const toastr: {
        success(message: string, title?: string, options?: Record<string, unknown>): void;
        error(message: string, title?: string, options?: Record<string, unknown>): void;
        warning(message: string, title?: string, options?: Record<string, unknown>): void;
        info(message: string, title?: string, options?: Record<string, unknown>): void;
        clear(): void;
    };

    // eslint-disable-next-line no-var
    var SillyTavern: {
        getContext(): SillyTavernContext;
        libs: SillyTavernLibs;
    };

    // Re-export types for use in other files
    type STChatCompletionMessage = ChatCompletionMessage;
    type STChatCompletionPayload = ChatCompletionPayload;
    type STExtractedData = ExtractedData;
    type STStreamResponse = StreamResponse;
    type STConnectionProfile = ConnectionProfile;
    type STPresetManager = PresetManager;
    type STStructuredOutputSchema = StructuredOutputSchema;
    type STJsonSchemaValue = JsonSchemaValue;
}
