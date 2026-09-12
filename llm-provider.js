// Pure LLM client for the APT scene injector.
// No DOM/UI dependencies: provider detection, model listing, template rendering, and generation.
import { chat, generateRaw, getRequestHeaders, main_api } from '../../../../script.js';
import { model_list, oai_settings } from '../../../openai.js';
import { t } from './i18n.js';

// Kept in sync with DEFAULT_LLM_INJECTOR_SETTINGS.responseLength; used only as a fallback.
const DEFAULT_RESPONSE_LENGTH = 80;

const LLM_INJECTOR_MODEL_SETTING_KEYS = {
    openai: 'openai_model',
    claude: 'claude_model',
    makersuite: 'google_model',
    vertexai: 'vertexai_model',
    openrouter: 'openrouter_model',
    ai21: 'ai21_model',
    mistralai: 'mistralai_model',
    custom: 'custom_model',
    cohere: 'cohere_model',
    perplexity: 'perplexity_model',
    groq: 'groq_model',
    siliconflow: 'siliconflow_model',
    electronhub: 'electronhub_model',
    chutes: 'chutes_model',
    nanogpt: 'nanogpt_model',
    deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model',
    xai: 'xai_model',
    pollinations: 'pollinations_model',
    cometapi: 'cometapi_model',
    moonshot: 'moonshot_model',
    fireworks: 'fireworks_model',
    azure_openai: 'azure_openai_model',
    zai: 'zai_model',
};

function trimLlmInjectorBaseUrl(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function getLlmInjectorProvider(settings = {}) {
    const provider = String(settings?.provider || '').trim();
    if (provider) return provider;
    return trimLlmInjectorBaseUrl(settings?.baseUrl) || String(settings?.apiKey || '').trim() ? 'openai_compatible' : 'sillytavern';
}

function getLlmInjectorSource(settings = {}) {
    return String(settings.api || '').trim() || oai_settings?.chat_completion_source || main_api;
}

function hasDirectLlmInjectorConnection(settings) {
    const provider = getLlmInjectorProvider(settings);
    const apiKey = String(settings?.apiKey || '').trim();
    if (provider === 'google_ai_studio') return !!apiKey;
    if (provider === 'openai_compatible') return !!apiKey && !!trimLlmInjectorBaseUrl(settings?.baseUrl);
    return false;
}

function getGoogleAiStudioBaseUrl(settings) {
    return trimLlmInjectorBaseUrl(settings?.baseUrl) || 'https://generativelanguage.googleapis.com/v1beta';
}

function getDirectLlmInjectorHeaders(settings) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${String(settings.apiKey || '').trim()}`,
    };

    const source = getLlmInjectorSource(settings);
    if (source === 'openrouter' || trimLlmInjectorBaseUrl(settings.baseUrl).includes('openrouter.ai')) {
        headers['HTTP-Referer'] = location.origin;
        headers['X-Title'] = 'SillyTavern APT Scene Injector';
    }

    return headers;
}

function formatRecentMessagesForLlmInjector(limit) {
    if (!Array.isArray(chat) || limit <= 0) return '';
    return chat.slice(-limit).map((message) => {
        const role = message?.is_user ? 'User' : (message?.is_system ? 'System' : 'Assistant');
        return `${role}: ${String(message?.mes || '').trim()}`;
    }).filter(Boolean).join('\n');
}

function applyLlmInjectorTemplate(template, values) {
    let resultText = String(template || '');

    // 替換 {{random::a,b,c}}
    resultText = resultText.replace(/\{\{\s*random::(.*?)\}\}/ig, (_, optionsStr) => {
        const options = optionsStr.split(',').map(s => s.trim());
        return options[Math.floor(Math.random() * options.length)] || '';
    });

    // 替換 {{roll 1d100}}
    resultText = resultText.replace(/\{\{\s*roll\s+(\d+)d(\d+)\s*\}\}/ig, (_, diceStr, sidesStr) => {
        const dice = Math.max(1, parseInt(diceStr, 10) || 1);
        const sides = Math.max(1, parseInt(sidesStr, 10) || 20);
        let total = 0;
        for (let i = 0; i < dice; i++) {
            total += Math.floor(Math.random() * sides) + 1;
        }
        return total.toString();
    });

    // 替換 {{userInput}}, {{recentMessages}}, {{result}}
    resultText = resultText.replace(/\{\{\s*(userInput|recentMessages|result)\s*\}\}/g, (_, key) => values[key] ?? '');

    return resultText;
}

function normalizeLlmInjectorResult(text) {
    const normalized = String(text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n')
        .replace(/^[-*"'`\s]+|[-*"'`\s]+$/g, '');

    return normalized.slice(0, 1000);
}

function getLlmInjectorModelSettingKeys(api) {
    const source = String(api || '').trim();
    if (!source) return [];
    const key = LLM_INJECTOR_MODEL_SETTING_KEYS[source];
    if (key) return [key];
    // Dynamic fallback: most chat completion sources follow the `${source}_model` naming convention.
    const dynamicKey = `${source}_model`;
    if (oai_settings && Object.prototype.hasOwnProperty.call(oai_settings, dynamicKey)) {
        return [dynamicKey];
    }
    return [];
}

function getLlmInjectorStatusRequestBody(source) {
    const data = {
        reverse_proxy: oai_settings.reverse_proxy,
        proxy_password: oai_settings.proxy_password,
        chat_completion_source: source,
    };

    if (source === 'custom') {
        data.custom_url = oai_settings.custom_url;
        data.custom_include_headers = oai_settings.custom_include_headers;
    }

    if (source === 'azure_openai') {
        data.azure_base_url = oai_settings.azure_base_url;
        data.azure_deployment_name = oai_settings.azure_deployment_name;
        data.azure_api_version = oai_settings.azure_api_version;
    }

    if (source === 'siliconflow') {
        data.siliconflow_endpoint = oai_settings.siliconflow_endpoint;
    }

    return data;
}

function normalizeLlmInjectorModelList(models) {
    return [...new Set((Array.isArray(models) ? models : [])
        .map(model => typeof model === 'string' ? model : model?.id)
        .filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b)));
}


async function fetchLlmInjectorModels(settings) {
    if (hasDirectLlmInjectorConnection(settings)) {
        if (getLlmInjectorProvider(settings) === 'google_ai_studio') {
            const baseUrl = getGoogleAiStudioBaseUrl(settings);
            // Send the API key via header instead of URL query to avoid leaking it in logs/history.
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { 'x-goog-api-key': String(settings.apiKey || '').trim() },
                cache: 'no-cache',
            });
            if (!response.ok) throw new Error(await response.text().catch(() => '') || response.statusText || `HTTP ${response.status}`);
            const data = await response.json();
            const googleModels = normalizeLlmInjectorModelList((data?.models || []).map(model => String(model?.name || model?.id || '').replace(/^models\//, '')));
            if (googleModels.length > 0) return googleModels;
            throw new Error(t('llm_provider_err_no_models_google'));
        }

        const baseUrl = trimLlmInjectorBaseUrl(settings.baseUrl);
        const response = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: getDirectLlmInjectorHeaders(settings),
            cache: 'no-cache',
        });

        if (!response.ok) {
            throw new Error(response.statusText || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const directModels = normalizeLlmInjectorModelList(data?.data || data?.models || data);
        if (directModels.length > 0) return directModels;
        throw new Error(t('llm_provider_err_no_models_custom'));
    }

    const source = getLlmInjectorSource(settings);
    const response = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(getLlmInjectorStatusRequestBody(source)),
        cache: 'no-cache',
    });

    if (!response.ok) {
        throw new Error(response.statusText || `HTTP ${response.status}`);
    }

    const responseData = await response.json();
    if (responseData?.error) {
        throw new Error(responseData.error.message || responseData.error || t('llm_provider_err_backend'));
    }

    const fetchedModels = normalizeLlmInjectorModelList(responseData?.data);
    if (fetchedModels.length > 0) {
        return fetchedModels;
    }

    const fallbackModels = normalizeLlmInjectorModelList(model_list);
    if (fallbackModels.length > 0) {
        return fallbackModels;
    }

    throw new Error(t('llm_provider_err_no_model_list'));
}


async function generateGoogleAiStudioLlmInjector(settings, prompt) {
    const model = String(settings.model || '').trim();
    if (!model) throw new Error(t('llm_provider_err_model_required_google'));

    const baseUrl = getGoogleAiStudioBaseUrl(settings);
    const contents = [];

    const messages = Array.isArray(settings.customMessages) ? settings.customMessages : [];
    // Fallback if customMessages array is somehow missing
    if (messages.length === 0) {
        if (settings.customAi1) messages.push({ role: 'assistant', content: settings.customAi1 });
        if (settings.customSys1) messages.push({ role: 'system', content: settings.customSys1 });
        if (settings.customAi2) messages.push({ role: 'assistant', content: settings.customAi2 });
        if (settings.customSys2) messages.push({ role: 'system', content: settings.customSys2 });
        if (settings.customAi3) messages.push({ role: 'assistant', content: settings.customAi3 });
    }

    for (const msg of messages) {
        if (!msg.content) continue;
        let role = msg.role;
        // Map roles for Google API
        if (role === 'system') role = 'user'; // System usually mapped to user in old gemini mapping without instructions, or use systemInstruction
        if (role === 'assistant') role = 'model';
        if (role === 'user') role = 'user';

        contents.push({ role, parts: [{ text: String(msg.content) }] });
    }

    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const body = {
        contents: contents,
        generationConfig: {
            maxOutputTokens: Number(settings.responseLength) || DEFAULT_RESPONSE_LENGTH,
            temperature: 0,
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }
        ],
    };
    if (settings.systemPrompt) {
        body.systemInstruction = { parts: [{ text: String(settings.systemPrompt) }] };
    }

    const endpoint = settings.useStreaming ? 'streamGenerateContent?alt=sse' : 'generateContent';

    // Send the API key via header instead of URL query to avoid leaking it in logs/history.
    const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': String(settings.apiKey || '').trim(),
        },
        body: JSON.stringify(body),
        cache: 'no-cache',
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || response.statusText || `HTTP ${response.status}`);
    }

    if (settings.useStreaming) {
        return await readSseStreamContent(response, data =>
            data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('') || '');
    } else {
        const data = await response.json();
        const content = data?.candidates?.[0]?.content?.parts?.map(part => part?.text || '').join('') || '';
        return content;
    }
}


/**
 * Reads an SSE (text/event-stream) response and accumulates content extracted by the provided callback.
 * Buffers incomplete lines across chunks to avoid dropping data when a JSON payload is split between reads.
 * @param {Response} response Fetch response with a readable body
 * @param {(data: any) => string} extractText Callback to extract text from each parsed SSE JSON payload
 * @returns {Promise<string>} The accumulated content
 */
async function readSseStreamContent(response, extractText) {
    let content = '';
    let buffer = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    const processLine = (line) => {
        const trimmed = line.replace(/\r$/, '');
        if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') return;
        try {
            const data = JSON.parse(trimmed.slice(6));
            content += extractText(data) || '';
        } catch (e) {
            // Leave a trace for debugging instead of failing silently
            console.debug('[APT] Skipped unparsable SSE line:', trimmed.slice(0, 200), e);
        }
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer for the next chunk
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            processLine(line);
        }
    }

    // Flush any remaining buffered data
    buffer += decoder.decode();
    if (buffer) {
        processLine(buffer);
    }

    return content;
}


async function generateDirectLlmInjector(settings, prompt) {
    if (getLlmInjectorProvider(settings) === 'google_ai_studio') {
        return generateGoogleAiStudioLlmInjector(settings, prompt);
    }

    const baseUrl = trimLlmInjectorBaseUrl(settings.baseUrl);
    const model = String(settings.model || '').trim();
    if (!model) {
        throw new Error(t('llm_provider_err_model_required_openai'));
    }

    const requestMessages = [];
    if (settings.systemPrompt) {
        requestMessages.push({ role: 'system', content: String(settings.systemPrompt) });
    }

    const customMessages = Array.isArray(settings.customMessages) ? settings.customMessages : [];
    // Fallback if customMessages array is somehow missing
    if (customMessages.length === 0) {
        if (settings.customAi1) customMessages.push({ role: 'assistant', content: settings.customAi1 });
        if (settings.customSys1) customMessages.push({ role: 'system', content: settings.customSys1 });
        if (settings.customAi2) customMessages.push({ role: 'assistant', content: settings.customAi2 });
        if (settings.customSys2) customMessages.push({ role: 'system', content: settings.customSys2 });
        if (settings.customAi3) customMessages.push({ role: 'assistant', content: settings.customAi3 });
    }

    for (const msg of customMessages) {
        if (msg.content) {
            requestMessages.push({ role: msg.role || 'system', content: String(msg.content) });
        }
    }

    requestMessages.push({ role: 'user', content: prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: getDirectLlmInjectorHeaders(settings),
        body: JSON.stringify({
            model,
            messages: requestMessages,
            max_tokens: Number(settings.responseLength) || DEFAULT_RESPONSE_LENGTH,
            temperature: 0,
            stream: !!settings.useStreaming,
        }),
        cache: 'no-cache',
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || response.statusText || `HTTP ${response.status}`);
    }

    if (settings.useStreaming) {
        return await readSseStreamContent(response, data => data?.choices?.[0]?.delta?.content || '');
    } else {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.output_text ?? '';
        return content;
    }
}


async function generateRawForLlmInjector(settings, prompt) {
    if (hasDirectLlmInjectorConnection(settings)) {
        return generateDirectLlmInjector(settings, prompt);
    }

    const api = String(settings.api || '').trim();
    const model = String(settings.model || '').trim();
    const modelSettingKeys = model ? getLlmInjectorModelSettingKeys(api || oai_settings?.chat_completion_source || main_api) : [];
    const previousValues = new Map();

    try {
        for (const key of modelSettingKeys) {
            previousValues.set(key, oai_settings?.[key]);
            oai_settings[key] = model;
        }

        return await generateRaw({
            prompt,
            api: api || null,
            systemPrompt: settings.systemPrompt || '',
            responseLength: Number(settings.responseLength) || DEFAULT_RESPONSE_LENGTH,
        });
    } finally {
        for (const [key, value] of previousValues.entries()) {
            oai_settings[key] = value;
        }
    }
}

export {
    trimLlmInjectorBaseUrl,
    getLlmInjectorProvider,
    getLlmInjectorSource,
    hasDirectLlmInjectorConnection,
    getGoogleAiStudioBaseUrl,
    getDirectLlmInjectorHeaders,
    formatRecentMessagesForLlmInjector,
    applyLlmInjectorTemplate,
    normalizeLlmInjectorResult,
    getLlmInjectorModelSettingKeys,
    getLlmInjectorStatusRequestBody,
    normalizeLlmInjectorModelList,
    fetchLlmInjectorModels,
    generateGoogleAiStudioLlmInjector,
    readSseStreamContent,
    generateDirectLlmInjector,
    generateRawForLlmInjector,
};

