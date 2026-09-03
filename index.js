import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { download, getFileText, escapeHtml } from '../../../utils.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { initLlmInjector, renderLlmInjectorSettings, bindLlmInjectorSettings, onGenerationAfterCommandsForLlmInjector, cleanupLlmInjectorText } from './llm-injector.js';
import { initI18n, t, getLanguage, setLanguage, applyLanguageToSettings } from './i18n.js';
import { initSettingsStore, getGlobalProfiles, getCurrentGlobalProfileName, setCurrentGlobalProfileName, getGlobalRules, isChatCompletionApiActive, getOpenAiPresetManager, getCurrentPresetName, setCurrentPresetName, getCurrentPresetRules, setCurrentPresetRules, saveGlobalRules, savePresetRules, getNotificationsEnabled, setNotificationsEnabled, SETTINGS_KEY_GLOBAL, SETTINGS_KEY_GLOBAL_PROFILE } from './settings-store.js';
import { initRulesEngine, forceRecheck, debouncedProcessText, clearRuleCaches, getRuleIncludeTriggers, getRuleExcludeTriggers, getRuleTriggerMode, getRuleConditionSummary, normalizeImportedRule, getAllRulesWithMeta, getRulePromptIds, onMessageSentDelay, onMessageDeletedForApt, onMessageEditedForApt, getLastRuleDebugState } from './rules-engine.js';
import { initUi, openEditor, renderRulesLists, renderGlobalProfileSelect, renderControlledPromptSearch, renderRuleDebugStatus } from './ui.js';
import { initPresetIntegration, updatePresetState, onOaiPresetExportReady, onOaiPresetImportReady } from './preset-integration.js';

let chatObserver = null;

function sanitizeFileNamePart(value, fallback = 'rules') {
    return String(value || fallback).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || fallback;
}

function initObserver() {
    const chatContainer = document.querySelector('#chat');
    if (!chatContainer) {
        setTimeout(initObserver, 1000);
        return;
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutations) => {
        debouncedProcessText();
    });

    chatObserver.observe(chatContainer, { 
        childList: true,
        subtree: false,
        characterData: false
    });
    
    console.log("[AutoPromptToggler] Chat observer initialized.");
}


// 供事件綁定的共用邏輯 (匯入/匯出)
function handleImportEvent(fileInputId, ruleType) {
    $(`#${fileInputId}`).on('change', async function() {
        const file = this.files[0];
        if (!file) return;

        try {
            const text = await getFileText(file);
            let importedData = JSON.parse(text);
            let rulesToImport = [];

            // Case 1: Simple array of rules (Standard format)
            if (Array.isArray(importedData)) {
                rulesToImport = importedData;
            } 
            // Case 2: Object containing a rules array
            else if (importedData && Array.isArray(importedData.rules)) {
                rulesToImport = importedData.rules;
            }
            // Case 3: Old profile dictionary format (e.g. { "Profile1": [...], "Profile2": [...] })
            else if (importedData && typeof importedData === 'object') {
                for (const profileRules of Object.values(importedData)) {
                    if (Array.isArray(profileRules)) {
                        rulesToImport = rulesToImport.concat(profileRules);
                    }
                }
            }
            
            rulesToImport = rulesToImport.map(normalizeImportedRule).filter(Boolean);
            
            if (rulesToImport.length > 0) {
                if (ruleType === 'global') {
                    const currentRules = getGlobalRules();
                    saveGlobalRules([...currentRules, ...rulesToImport]);
                } else {
                    setCurrentPresetRules([...getCurrentPresetRules(), ...rulesToImport]);
                    savePresetRules();
                }
                
                renderRulesLists();
                toastr.success(`匯入成功，新增 ${rulesToImport.length} 條 ${ruleType === 'global' ? '全域' : ' Preset '} 規則`, 'Auto Prompt Toggler');
            } else {
                toastr.error('無效的規則檔案或檔案為空', 'Auto Prompt Toggler');
            }
        } catch (e) {
            console.error(e);
            toastr.error('匯入失敗: ' + e.message, 'Auto Prompt Toggler');
        }
        
        this.value = ''; 
    });
}

jQuery(async () => {
    // Migration: Migrate old single list to global rules if they exist and global is empty
    if (extension_settings['auto_prompt_toggler'] && !extension_settings[SETTINGS_KEY_GLOBAL]) {
        extension_settings[SETTINGS_KEY_GLOBAL] = extension_settings['auto_prompt_toggler'];
        console.log('[APT] Migrated old rules to global rules.');
    }
    
    // Clear out old data properties after migration to save space
    delete extension_settings['auto_prompt_toggler'];
    delete extension_settings['auto_prompt_toggler_profiles'];
    delete extension_settings['auto_prompt_toggler_current_profile'];

    if (!extension_settings[SETTINGS_KEY_GLOBAL]) {
        extension_settings[SETTINGS_KEY_GLOBAL] = { 'Default': [] };
        extension_settings[SETTINGS_KEY_GLOBAL_PROFILE] = 'Default';
        saveSettingsDebounced();
    }

    const settingsHtml = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'settings');
    $('#extensions_settings').append(settingsHtml);
    initI18n({ onLanguageChanged: renderRulesLists });
    initSettingsStore({ forceRecheck, clearRuleCaches });
    initRulesEngine({
        isChatCompletionApiActive,
        getGlobalRules,
        getCurrentGlobalProfileName,
        getCurrentPresetName,
        getCurrentPresetRules,
        getNotificationsEnabled,
        renderRuleDebugStatus,
    });
    initUi({
        getAllRulesWithMeta,
        getRulePromptIds,
        getRuleConditionSummary,
        getRuleTriggerMode,
        getRuleIncludeTriggers,
        getRuleExcludeTriggers,
        getLastRuleDebugState,
        isChatCompletionApiActive,
        getGlobalRules,
        getCurrentPresetRules,
        getGlobalProfiles,
        getCurrentGlobalProfileName,
        saveGlobalRules,
        savePresetRules,
    });
    $('#apt_language_select').off('change.apt_i18n').val(getLanguage()).on('change.apt_i18n', function() {
        setLanguage($(this).val());
    });
    applyLanguageToSettings();

    // Notifications Init
    $('#apt_enable_notifications').off('change.apt_notifications').prop('checked', getNotificationsEnabled()).on('change.apt_notifications', function() {
        setNotificationsEnabled($(this).prop('checked'));
    });

    initLlmInjector({
        forceRecheck,
        getOpenAiPresetManager,
        isChatCompletionApiActive,
        getCurrentPresetName,
        getCurrentPresetRules,
        getNotificationsEnabled,
    });

    initPresetIntegration({
        isChatCompletionApiActive,
        setCurrentPresetRules,
        setCurrentPresetName,
        getCurrentPresetName,
        getOpenAiPresetManager,
        renderRulesLists,
        forceRecheck,
        normalizeImportedRule,
    });

    renderLlmInjectorSettings();
    bindLlmInjectorSettings();

    $('#apt_controlled_prompt_search').off('input.apt_controlled').on('input.apt_controlled', () => renderControlledPromptSearch());

    // Ensure events are only bound once per reload by removing old handlers
    $(document).off('click.apt_global');
    $(document).off('change.apt_global');

    // Global Profile Management using event delegation for safety during re-renders
    $(document).on('change.apt_global', '#apt_global_profile_select', function() {
        setCurrentGlobalProfileName($(this).val());
        renderRulesLists();
    });

    $(document).on('click.apt_global', '#apt_global_profile_add', async () => {
        // Create an HTML element to be passed to callGenericPopup
        const popupContent = $(`
            <div>
                <h3>新增全域設定檔</h3>
                <input type="text" id="apt_new_profile_name" class="text_pole" placeholder="輸入設定檔名稱" style="width: 100%;">
            </div>
        `);
        
        const result = await callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, '', { okButton: t('create'), cancelButton: t('cancel') });
        
        if (result) {
            // Must fetch value from the popupContent object itself since it might be detached from DOM
            const name = popupContent.find('#apt_new_profile_name').val();
            if (name && name.trim()) {
                const cleanName = name.trim();
                const profiles = getGlobalProfiles();
                if (profiles[cleanName]) {
                    toastr.error('設定檔名稱已存在');
                    return;
                }
                profiles[cleanName] = [];
                extension_settings[SETTINGS_KEY_GLOBAL] = profiles;
                setCurrentGlobalProfileName(cleanName);
                renderGlobalProfileSelect();
                renderRulesLists();
                toastr.success(`已建立設定檔: ${cleanName}`);
            }
        }
    });

    $(document).on('click.apt_global', '#apt_global_profile_rename', async () => {
        const current = getCurrentGlobalProfileName();
        const popupContent = $(`
            <div>
                <h3>重新命名設定檔</h3>
                <input type="text" id="apt_rename_profile_name" class="text_pole" value="${escapeHtml(current)}" style="width: 100%;">
            </div>
        `);

        const result = await callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, '', { okButton: t('save'), cancelButton: t('cancel') });
        
        if (result) {
            const newName = popupContent.find('#apt_rename_profile_name').val();
            if (newName && newName.trim() && newName !== current) {
                const cleanName = newName.trim();
                const profiles = getGlobalProfiles();
                if (profiles[cleanName]) {
                    toastr.error('設定檔名稱已存在');
                    return;
                }
                profiles[cleanName] = profiles[current];
                delete profiles[current];
                extension_settings[SETTINGS_KEY_GLOBAL] = profiles;
                setCurrentGlobalProfileName(cleanName);
                renderGlobalProfileSelect();
                renderRulesLists();
                toastr.success(`已重新命名為: ${cleanName}`);
            }
        }
    });

    $(document).on('click.apt_global', '#apt_global_profile_delete', async () => {
        const current = getCurrentGlobalProfileName();
        const profiles = getGlobalProfiles();
        const keys = Object.keys(profiles);
        
        if (keys.length <= 1) {
            toastr.error('無法刪除最後一個設定檔');
            return;
        }
        
        const confirmResult = await callGenericPopup(
            `確定要刪除設定檔 <strong>${escapeHtml(current)}</strong> 嗎?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: t('delete'), cancelButton: t('cancel') }
        );
        if (confirmResult) {
            delete profiles[current];
            extension_settings[SETTINGS_KEY_GLOBAL] = profiles;
            const next = Object.keys(profiles)[0];
            setCurrentGlobalProfileName(next);
            renderGlobalProfileSelect();
            renderRulesLists();
            toastr.info(`已刪除設定檔: ${current}`);
        }
    });

    // Global Buttons
    $(document).on('click.apt_global', '#apt_global_add_rule', () => openEditor('global'));
    $(document).on('click.apt_global', '#apt_global_export', () => {
        const rules = getGlobalRules();
        const currentProfile = getCurrentGlobalProfileName();
        const json = JSON.stringify(rules, null, 4);
        download(json, `auto_prompt_toggler_global_${sanitizeFileNamePart(currentProfile)}.json`, 'application/json');
    });
    $(document).on('click.apt_global', '#apt_global_import', () => {
        $('#apt_import_file_input').off('change'); // Remove previous handlers
        handleImportEvent('apt_import_file_input', 'global');
        $('#apt_import_file_input').trigger('click');
    });
    $(document).on('click.apt_global', '#apt_global_clear', async () => {
        const confirmResult = await callGenericPopup(
            `確定要清空設定檔 <strong>${escapeHtml(getCurrentGlobalProfileName())}</strong> 的所有規則嗎?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: t('clear'), cancelButton: t('cancel') }
        );
        if (confirmResult) {
            saveGlobalRules([]);
            renderRulesLists();
            toastr.info('已清空全域規則', 'Auto Prompt Toggler');
        }
    });

    // Preset Buttons
    $(document).off('click.apt_preset');
    $(document).on('click.apt_preset', '#apt_preset_add_rule', () => openEditor('preset'));
    $(document).on('click.apt_preset', '#apt_preset_export', () => {
        const json = JSON.stringify(getCurrentPresetRules(), null, 4);
        download(json, `auto_prompt_toggler_preset_${sanitizeFileNamePart(getCurrentPresetName(), 'preset')}.json`, 'application/json');
    });
    $(document).on('click.apt_preset', '#apt_preset_import', () => {
        $('#apt_import_file_input').off('change'); // Remove previous handlers
        handleImportEvent('apt_import_file_input', 'preset');
        $('#apt_import_file_input').trigger('click');
    });
    $(document).on('click.apt_preset', '#apt_preset_clear', async () => {
        const confirmResult = await callGenericPopup(
            `確定要清空當前 Preset <strong>${escapeHtml(getCurrentPresetName())}</strong> 的所有規則嗎?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: t('clear'), cancelButton: t('cancel') }
        );
        if (confirmResult) {
            setCurrentPresetRules([]);
            savePresetRules();
            renderRulesLists();
            toastr.info('已清空 Preset 規則', 'Auto Prompt Toggler');
        }
    });

    // Global Profile Management Setup
    renderGlobalProfileSelect();

    // Init Initial State
    await updatePresetState();

    // Hook into Preset events for sync
    if (typeof eventSource !== 'undefined') {
        eventSource.on(event_types.MAIN_API_CHANGED, () => {
            updatePresetState();
        });
        
        eventSource.on(event_types.PRESET_CHANGED, () => {
            updatePresetState();
        });

        if (event_types.GENERATION_AFTER_COMMANDS) {
            eventSource.on(event_types.GENERATION_AFTER_COMMANDS, onGenerationAfterCommandsForLlmInjector);
        }
        if (event_types.MESSAGE_SENT) {
            eventSource.on(event_types.MESSAGE_SENT, onMessageSentDelay);
        }
        if (event_types.MESSAGE_DELETED) {
            eventSource.on(event_types.MESSAGE_DELETED, onMessageDeletedForApt);
        }
        if (event_types.MESSAGE_EDITED) {
            eventSource.on(event_types.MESSAGE_EDITED, onMessageEditedForApt);
        }
        if (event_types.CHAT_COMPLETION_PROMPT_READY) {
            eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, cleanupLlmInjectorText);
        }
        
        // 整合至聊天補全預設設定檔 (OAI Preset) 的匯入偵測
        // 註: 目前 SillyTavern 只有針對 OpenAI API 提供 IMPORT_READY 攔截點
        if (event_types.OAI_PRESET_EXPORT_READY) {
            eventSource.on(event_types.OAI_PRESET_EXPORT_READY, onOaiPresetExportReady);
        }

        if (event_types.OAI_PRESET_IMPORT_READY) {
            eventSource.on(event_types.OAI_PRESET_IMPORT_READY, onOaiPresetImportReady);
        }
    }

    initObserver();
});
