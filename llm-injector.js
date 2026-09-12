// LLM scene injector + customMessages module.
// Loaded by index.js; dependencies injected via initLlmInjector() to avoid circular imports.
import { saveSettingsDebounced, stopGeneration, activateSendButtons, setGenerationProgress } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { escapeHtml } from '../../../utils.js';
import { getLlmInjectorProvider, fetchLlmInjectorModels, formatRecentMessagesForLlmInjector, applyLlmInjectorTemplate, normalizeLlmInjectorResult, generateRawForLlmInjector } from './llm-provider.js';
import { t, fmt } from './i18n.js';

const SETTINGS_KEY_LLM_INJECTOR = 'auto_prompt_toggler_llm_injector';

const DEFAULT_LLM_INJECTOR_SETTINGS = {
    enabled: false,
    provider: 'sillytavern',
    api: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    modelOptions: [],
    responseLength: 80,
    includeRecentMessages: 6,
    includeUserInput: true,
    customField1: '',
    customField2: '',
    customMessages: [],
    systemPrompt: t('llm_default_prompt_system'),
    promptTemplate: t('llm_default_prompt_user'),
    injectionTemplate: '\n\n[APT_SCENE: {{result}}]',
    cleanupRegex: '<scene>.*?<\\/scene>\\n*|<cot_flags>.*?<\\/cot_flags>\\n*',
    useStreaming: false,
};

function getLocalizedDefaultLlmInjectorSettings() {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_LLM_INJECTOR_SETTINGS));
    defaults.systemPrompt = t('llm_default_prompt_system');
    defaults.promptTemplate = t('llm_default_prompt_user');
    return defaults;
}

let llmInjectorBusy = false;
let needsDelayAfterInjection = false;

let currentPresetLlmInjectorSettings = null;

// Dependencies injected by index.js (avoids circular imports).
let bridge = {
    forceRecheck: () => {},
    getOpenAiPresetManager: () => null,
    isChatCompletionApiActive: () => false,
    getCurrentPresetName: () => null,
    getCurrentPresetRules: () => [],
    getNotificationsEnabled: () => false,
};

function initLlmInjector(deps) {
    bridge = {
        forceRecheck: deps.forceRecheck,
        getOpenAiPresetManager: deps.getOpenAiPresetManager,
        isChatCompletionApiActive: deps.isChatCompletionApiActive,
        getCurrentPresetName: deps.getCurrentPresetName,
        getCurrentPresetRules: deps.getCurrentPresetRules,
        getNotificationsEnabled: deps.getNotificationsEnabled,
    };
}

// --- moved from index.js ---
function getLlmInjectorSettings() {
    const current = extension_settings[SETTINGS_KEY_LLM_INJECTOR];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
        extension_settings[SETTINGS_KEY_LLM_INJECTOR] = getLocalizedDefaultLlmInjectorSettings();
        saveSettingsDebounced();
    } else {
        const migratedProvider = current.provider || (current.baseUrl || current.apiKey ? 'openai_compatible' : DEFAULT_LLM_INJECTOR_SETTINGS.provider);
        extension_settings[SETTINGS_KEY_LLM_INJECTOR] = {
            ...DEFAULT_LLM_INJECTOR_SETTINGS,
            ...current,
            provider: migratedProvider,
        };
    }
    return extension_settings[SETTINGS_KEY_LLM_INJECTOR];
}

function normalizeLlmInjectorSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;

    const migratedProvider = settings.provider || (settings.baseUrl || settings.apiKey ? 'openai_compatible' : undefined);
    return {
        ...settings,
        ...(migratedProvider ? { provider: migratedProvider } : {}),
    };
}

function getEffectiveLlmInjectorSettings() {
    const globalSettings = getLlmInjectorSettings();
    const presetSettings = normalizeLlmInjectorSettings(currentPresetLlmInjectorSettings);
    if (!presetSettings) return globalSettings;

    return {
        ...globalSettings,
        ...presetSettings,
    };
}

function shouldSaveLlmInjectorSettingsToPreset() {
    return bridge.isChatCompletionApiActive()
        && !!bridge.getCurrentPresetName()
        && !!currentPresetLlmInjectorSettings
        && typeof currentPresetLlmInjectorSettings === 'object'
        && !Array.isArray(currentPresetLlmInjectorSettings);
}

async function savePresetLlmInjectorSettings(settings) {
    const presetMgr = bridge.getOpenAiPresetManager();
    if (!presetMgr || !bridge.getCurrentPresetName()) return;

    try {
        let aptExt = null;
        try {
            aptExt = presetMgr.readPresetExtensionField({
                name: bridge.getCurrentPresetName(),
                path: 'auto_prompt_toggler',
            });
        } catch (e) {
            console.warn('[APT] Could not read preset extension field before saving LLM injector settings:', e);
        }

        const nextExt = aptExt && typeof aptExt === 'object' && !Array.isArray(aptExt) ? { ...aptExt } : {};
        nextExt.rules = bridge.getCurrentPresetRules();
        nextExt.llmInjector = settings;

        await presetMgr.writePresetExtensionField({
            name: bridge.getCurrentPresetName(),
            path: 'auto_prompt_toggler',
            value: nextExt,
        });
    } catch (e) {
        console.error('[APT] Error saving preset LLM injector settings to file:', e);
        toastr.error(t('llm_save_preset_failed'), 'Auto Prompt Toggler');
    }
}

function saveLlmInjectorSettings(patch = {}) {
    if (shouldSaveLlmInjectorSettingsToPreset()) {
        currentPresetLlmInjectorSettings = {
            ...getEffectiveLlmInjectorSettings(),
            ...patch,
        };
        savePresetLlmInjectorSettings(currentPresetLlmInjectorSettings);
        return;
    }

    extension_settings[SETTINGS_KEY_LLM_INJECTOR] = {
        ...getLlmInjectorSettings(),
        ...patch,
    };
    saveSettingsDebounced();
}

function renderLlmInjectorSettings() {
    const settings = getEffectiveLlmInjectorSettings();
    $('#apt_llm_injector_enabled').prop('checked', !!settings.enabled);
    const provider = settings.provider || (settings.baseUrl || settings.apiKey ? 'openai_compatible' : 'sillytavern');
    $('#apt_llm_injector_provider').val(provider);
    $('#apt_llm_injector_api').val(settings.api || '');
    $('#apt_llm_injector_base_url').val(settings.baseUrl || '');
    $('#apt_llm_injector_api_key').val(settings.apiKey || '');
    $('#apt_llm_injector_model').val(settings.model || '');
    renderLlmInjectorModelOptions(settings.modelOptions || [], settings.model || '');
    $('#apt_llm_injector_response_length').val(settings.responseLength ?? DEFAULT_LLM_INJECTOR_SETTINGS.responseLength);
    $('#apt_llm_injector_recent_count').val(settings.includeRecentMessages ?? DEFAULT_LLM_INJECTOR_SETTINGS.includeRecentMessages);
    $('#apt_llm_injector_include_user').prop('checked', settings.includeUserInput !== false);
    $('#apt_llm_injector_use_streaming').prop('checked', !!settings.useStreaming);
    $('#apt_llm_injector_injection_template').val(settings.injectionTemplate || DEFAULT_LLM_INJECTOR_SETTINGS.injectionTemplate);
    $('#apt_llm_injector_cleanup_regex').val(settings.cleanupRegex || DEFAULT_LLM_INJECTOR_SETTINGS.cleanupRegex);
    updateLlmInjectorProviderUi();
    
    renderCustomMessagesUI();
}

function renderCustomMessagesUI() {
    const container = $('#apt_llm_injector_custom_messages_container');
    if (!container.length) return;
    container.empty();

    const settings = getEffectiveLlmInjectorSettings();
    const messages = Array.isArray(settings.customMessages) ? settings.customMessages : [];
    
    // Fallback: migrate old custom fields and standalone prompts to the new format if the new array is empty
    if (messages.length === 0) {
        if (settings.systemPrompt) messages.push({ role: 'system', content: settings.systemPrompt });
        if (settings.promptTemplate) messages.push({ role: 'user', content: settings.promptTemplate });
        if (settings.customAi1) messages.push({ role: 'assistant', content: settings.customAi1 });
        if (settings.customSys1) messages.push({ role: 'system', content: settings.customSys1 });
        if (settings.customAi2) messages.push({ role: 'assistant', content: settings.customAi2 });
        if (settings.customSys2) messages.push({ role: 'system', content: settings.customSys2 });
        if (settings.customAi3) messages.push({ role: 'assistant', content: settings.customAi3 });
    }

    const template = $('#apt_llm_injector_custom_message_template').html();
    messages.forEach((msg, index) => {
        const item = $(template);
        const roleSelect = item.find('.apt-custom-message-role');
        roleSelect.val(msg.role || 'system');
        roleSelect.find('option[value="system"]').text(t('role_system'));
        roleSelect.find('option[value="user"]').text(t('role_user'));
        roleSelect.find('option[value="assistant"]').text(t('role_assistant'));
        item.find('.apt-custom-message-content').val(msg.content || '');
        item.find('.apt-custom-message-delete').attr('title', t('delete'));
        
        item.find('.apt-custom-message-delete').on('click', function() {
            $(this).closest('.apt-custom-message-item').remove();
            saveCustomMessages();
        });

        item.find('.apt-custom-message-role, .apt-custom-message-content').on('change input', function() {
            saveCustomMessages();
        });
        
        container.append(item);
    });

    if ($.fn.sortable) {
        if (container.data('ui-sortable')) {
            container.sortable('destroy');
        }
        container.sortable({
            handle: '.apt-custom-message-handle',
            tolerance: 'pointer',
            update: function() {
                saveCustomMessages();
            }
        });
    }
}

function saveCustomMessages() {
    const container = $('#apt_llm_injector_custom_messages_container');
    const messages = [];
    container.find('.apt-custom-message-item').each(function() {
        const role = $(this).find('.apt-custom-message-role').val();
        const content = $(this).find('.apt-custom-message-content').val();
        if (role && content) {
            messages.push({ role, content });
        }
    });
    saveLlmInjectorSettings({ customMessages: messages });
}

function renderLlmInjectorModelOptions(models = [], selectedModel = '') {
    const select = $('#apt_llm_injector_model_select');
    if (!select.length) return;

    select.empty();
    select.append(new Option(models.length ? t('llm_model_select_choose') : t('llm_model_select_empty'), ''));

    const uniqueModels = [...new Set((Array.isArray(models) ? models : [])
        .map(model => typeof model === 'string' ? model : model?.id)
        .filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b)));

    for (const id of uniqueModels) {
        select.append(new Option(id, id));
    }

    if (selectedModel && uniqueModels.includes(selectedModel)) {
        select.val(selectedModel);
    } else {
        select.val('');
    }
}

function bindLlmInjectorSettings() {
    const bindSave = (selector, getter) => {
        $(selector).off('change.apt_llm input.apt_llm').on('change.apt_llm input.apt_llm', function() {
            saveLlmInjectorSettings(getter($(this)));
        });
    };

    bindSave('#apt_llm_injector_enabled', el => ({ enabled: el.prop('checked') }));
    bindSave('#apt_llm_injector_provider', el => {
        const provider = String(el.val() || 'sillytavern');
        const patch = { provider };
        if (provider === 'google_ai_studio' && !String($('#apt_llm_injector_base_url').val() || '').trim()) {
            patch.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        }
        saveLlmInjectorSettings(patch);
        if (patch.baseUrl) $('#apt_llm_injector_base_url').val(patch.baseUrl);
        updateLlmInjectorProviderUi();
        return {};
    });
    bindSave('#apt_llm_injector_api', el => ({ api: String(el.val() || '').trim() }));
    bindSave('#apt_llm_injector_base_url', el => ({ baseUrl: String(el.val() || '').trim() }));
    bindSave('#apt_llm_injector_api_key', el => ({ apiKey: String(el.val() || '').trim() }));
    bindSave('#apt_llm_injector_model', el => ({ model: String(el.val() || '').trim() }));
    bindSave('#apt_llm_injector_response_length', el => ({ responseLength: Math.max(1, Number.parseInt(el.val(), 10) || DEFAULT_LLM_INJECTOR_SETTINGS.responseLength) }));
    bindSave('#apt_llm_injector_recent_count', el => ({ includeRecentMessages: Math.max(0, Number.parseInt(el.val(), 10) || 0) }));
    bindSave('#apt_llm_injector_include_user', el => ({ includeUserInput: el.prop('checked') }));
    bindSave('#apt_llm_injector_use_streaming', el => ({ useStreaming: el.prop('checked') }));
    
    $('#apt_llm_injector_add_custom_message').off('click.apt_llm').on('click.apt_llm', function() {
        const settings = getEffectiveLlmInjectorSettings();
        const messages = Array.isArray(settings.customMessages) ? [...settings.customMessages] : [];
        messages.push({ role: 'system', content: '' });
        saveLlmInjectorSettings({ customMessages: messages });
        renderCustomMessagesUI();
    });
    bindSave('#apt_llm_injector_injection_template', el => ({ injectionTemplate: String(el.val() || '') }));
    bindSave('#apt_llm_injector_cleanup_regex', el => ({ cleanupRegex: String(el.val() || '') }));

    $('#apt_llm_injector_model_select').off('change.apt_llm').on('change.apt_llm', function() {
        const model = String($(this).val() || '').trim();
        if (!model) return;
        $('#apt_llm_injector_model').val(model).trigger('input');
        saveLlmInjectorSettings({ model });
    });

    $('#apt_llm_injector_fetch_models').off('click.apt_llm').on('click.apt_llm', async () => {
        const button = $('#apt_llm_injector_fetch_models');
        button.prop('disabled', true).text(t('llm_fetching'));
        try {
            const models = await fetchLlmInjectorModels(getEffectiveLlmInjectorSettings());
            saveLlmInjectorSettings({ modelOptions: models });
            renderLlmInjectorModelOptions(models, getEffectiveLlmInjectorSettings().model || '');
            toastr.success(fmt(t('llm_fetched_models'), models.length), 'Auto Prompt Toggler');
        } catch (e) {
            console.error('[APT] Failed to fetch LLM injector models:', e);
            toastr.error(fmt(t('llm_fetch_failed'), e.message || e), 'Auto Prompt Toggler');
        } finally {
            button.prop('disabled', false).text(t('llm_fetch_models'));
        }
    });

    $('#apt_llm_injector_reset').off('click.apt_llm').on('click.apt_llm', () => {
        if (shouldSaveLlmInjectorSettingsToPreset()) {
            currentPresetLlmInjectorSettings = getLocalizedDefaultLlmInjectorSettings();
            savePresetLlmInjectorSettings(currentPresetLlmInjectorSettings);
            renderLlmInjectorSettings();
            toastr.info(t('llm_reset_preset_done'), 'Auto Prompt Toggler');
            return;
        }

        extension_settings[SETTINGS_KEY_LLM_INJECTOR] = getLocalizedDefaultLlmInjectorSettings();
        saveSettingsDebounced();
        renderLlmInjectorSettings();
        toastr.info(t('llm_reset_done'), 'Auto Prompt Toggler');
    });
}

function updateLlmInjectorProviderUi() {
    const settings = getEffectiveLlmInjectorSettings();
    const provider = String($('#apt_llm_injector_provider').val() || '').trim() || getLlmInjectorProvider(settings);
    const direct = provider !== 'sillytavern';
    const google = provider === 'google_ai_studio';
    $('.apt-llm-provider-api-row').toggle(provider === 'sillytavern');
    $('.apt-llm-base-url-row').toggle(direct);
    $('.apt-llm-api-key-row').toggle(direct);
    $('.apt-llm-streaming-row').toggle(direct);
    $('#apt_llm_injector_base_url').attr('placeholder', google
        ? t('llm_base_url_ph_google')
        : t('llm_base_url_ph_openai'));
    $('#apt_llm_injector_model').attr('placeholder', google
        ? t('llm_model_ph_google')
        : t('llm_model_ph_openai'));
}

async function onGenerationAfterCommandsForLlmInjector(type, generationOptions = {}, dryRun = false) {
    // Create a deep copy of settings so we don't accidentally mutate the saved templates
    const baseSettings = getEffectiveLlmInjectorSettings();
    const settings = { ...baseSettings };
    if (Array.isArray(settings.customMessages)) {
        settings.customMessages = settings.customMessages.map(msg => ({ ...msg }));
    }

    if (!settings.enabled || dryRun || llmInjectorBusy) return;
    if (type && ![undefined, 'normal'].includes(type)) return;
    if (generationOptions?.automatic_trigger || generationOptions?.quiet_prompt || generationOptions?.depth) return;

    const textarea = $('#send_textarea');
    if (!textarea.length) return;

    const userInput = String(textarea.val() || '');
    if (settings.includeUserInput !== false && !userInput.trim()) return;
    if (userInput.includes('[APT_SCENE:')) return;

    llmInjectorBusy = true;
    const toast = toastr.info(t('llm_judging'), 'Auto Prompt Toggler');
    let injectSuccess = false;
    try {
        const templateValues = {
            userInput,
            recentMessages: formatRecentMessagesForLlmInjector(Number(settings.includeRecentMessages) || 0),
            result: ''
        };

        // 替換 Custom Messages 裡的變數
        if (Array.isArray(settings.customMessages)) {
            settings.customMessages = settings.customMessages.map(msg => ({
                role: msg.role,
                content: applyLlmInjectorTemplate(msg.content, templateValues)
            }));
        } else {
             // 備用防呆：如果完全沒設定，至少給個基本的提示詞
             settings.customMessages = [
                 { role: 'system', content: applyLlmInjectorTemplate(t('llm_default_prompt_system'), templateValues) },
                 { role: 'user', content: applyLlmInjectorTemplate(t('llm_default_prompt_user'), templateValues) }
             ];
        }

        // 把最後一個 user 訊息抽出來當作主要 prompt，以符合原本 generateRawForLlmInjector 的簽章
        let prompt = '';
        const lastUserIndex = settings.customMessages.findLastIndex(msg => msg.role === 'user');
        if (lastUserIndex !== -1) {
             prompt = settings.customMessages[lastUserIndex].content;
             settings.customMessages.splice(lastUserIndex, 1);
        }

        const rawResult = await generateRawForLlmInjector(settings, prompt);
        const result = normalizeLlmInjectorResult(rawResult);
        
        // 更新 UI Log
        const logPanel = $('#apt_llm_log_panel');
        if (logPanel.length) {
            logPanel.empty();
            let logHtml = `<div style="color: var(--SmartThemeQuoteColor); margin-bottom: 8px;">[${new Date().toLocaleTimeString()}] ${escapeHtml(t('llm_log_executed'))}</div>`;
            logHtml += `<div><strong>${escapeHtml(t('llm_log_sent_order'))}</strong></div>`;
            settings.customMessages.forEach((msg, idx) => {
                logHtml += `<div style="margin-top: 4px; padding-left: 8px; border-left: 2px solid gray;">[${msg.role}]<br>${escapeHtml(msg.content)}</div>`;
            });
            logHtml += `<div style="margin-top: 4px; padding-left: 8px; border-left: 2px solid gray;">[user (Main Prompt)]<br>${escapeHtml(prompt)}</div>`;
            logHtml += `<div style="margin-top: 8px;"><strong>${escapeHtml(t('llm_log_raw_reply'))}</strong><br><span style="color: var(--smart-theme-color);">${escapeHtml(rawResult)}</span></div>`;
            logHtml += `<div style="margin-top: 8px;"><strong>${escapeHtml(t('llm_log_parsed_label'))}</strong><br><span style="color: var(--smart-theme-color);">${escapeHtml(result || t('llm_log_empty_value'))}</span></div>`;
            logPanel.html(logHtml);
        }

        if (!result) {
            throw new Error(t('llm_empty_result_aborted'));
        }

        templateValues.result = result;
        const injection = applyLlmInjectorTemplate(settings.injectionTemplate, templateValues);
        textarea.val(`${userInput}${injection}`)[0].dispatchEvent(new Event('input', { bubbles: true }));
        
        if (logPanel.length) {
             logPanel.append(`<div style="margin-top: 8px;"><strong>${escapeHtml(t('llm_log_final_injection'))}</strong><br><span style="color: var(--smart-theme-color);">${escapeHtml(injection)}</span></div>`);
        }

        if (bridge.getNotificationsEnabled()) toastr.success(fmt(t('llm_scene_result'), result), 'Auto Prompt Toggler');
        bridge.forceRecheck();
        injectSuccess = true;
    } catch (e) {
        console.error('[APT] LLM scene injector failed:', e);
        toastr.error(fmt(t('llm_injection_failed'), e.message || e), 'Auto Prompt Toggler');
        
        // Stop generation if LLM injector fails (including empty response)
        if (typeof stopGeneration === 'function') {
            stopGeneration();
            // Fallback: unlock the send UI and reset generation progress after stopping.
            // (SillyTavern's unblock helper is not exported, so use its public parts.)
            if (typeof activateSendButtons === 'function') activateSendButtons();
            if (typeof setGenerationProgress === 'function') setGenerationProgress(0);
        }
    } finally {
        toastr.clear(toast);
        llmInjectorBusy = false;
        if (injectSuccess) {
            needsDelayAfterInjection = true;
        }
    }
}

function cleanupLlmInjectorText(eventData) {
    // 檢查是否有傳入有效的 eventData 以及聊天陣列
    const promptContent = eventData?.chat;
    if (!promptContent || !Array.isArray(promptContent)) return;

    const settings = getEffectiveLlmInjectorSettings();
    if (!settings || !settings.cleanupRegex) return;

    try {
        const regexLines = settings.cleanupRegex.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (regexLines.length === 0) return;

        // 將陣列裡的每一行作為獨立的正則表達式來處理
        for (const regexStr of regexLines) {
            try {
                const regex = new RegExp(regexStr, 'g');
                // 對所有提示詞區塊進行正則替換
                for (let i = 0; i < promptContent.length; i++) {
                    if (typeof promptContent[i] === 'string') {
                        promptContent[i] = promptContent[i].replace(regex, '');
                    } else if (promptContent[i] && typeof promptContent[i].text === 'string') {
                        // 支援具有 text 屬性的物件格式
                        promptContent[i].text = promptContent[i].text.replace(regex, '');
                    } else if (promptContent[i] && typeof promptContent[i].content === 'string') {
                        // 支援 OpenAI 格式
                        promptContent[i].content = promptContent[i].content.replace(regex, '');
                    }
                }
            } catch (err) {
                console.warn(`[Auto Prompt Toggler] Invalid regex in cleanup settings: ${regexStr}`, err);
            }
        }
    } catch (e) {
        console.error("[Auto Prompt Toggler] Error in cleanupLlmInjectorText:", e);
    }
}

function resetLlmInjectorPresetSettings() {
    currentPresetLlmInjectorSettings = null;
    renderLlmInjectorSettings();
}

function setLlmInjectorPresetSettings(raw) {
    currentPresetLlmInjectorSettings = normalizeLlmInjectorSettings(raw);
    renderLlmInjectorSettings();
}

function getNeedsDelayAfterInjection() {
    return needsDelayAfterInjection;
}

function resetNeedsDelayAfterInjection() {
    needsDelayAfterInjection = false;
}

export {
    initLlmInjector,
    renderLlmInjectorSettings,
    bindLlmInjectorSettings,
    onGenerationAfterCommandsForLlmInjector,
    cleanupLlmInjectorText,
    resetLlmInjectorPresetSettings,
    setLlmInjectorPresetSettings,
    getNeedsDelayAfterInjection,
    resetNeedsDelayAfterInjection,
};
