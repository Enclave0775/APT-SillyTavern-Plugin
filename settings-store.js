import { main_api, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { getPresetManager } from '../../../preset-manager.js';

const SETTINGS_KEY_GLOBAL = 'auto_prompt_toggler_global'; // Now a dictionary: { "ProfileName": [rules], ... }
const SETTINGS_KEY_GLOBAL_PROFILE = 'auto_prompt_toggler_global_current_profile';
const SETTINGS_KEY_NOTIFICATIONS = 'auto_prompt_toggler_notifications';

// Preset rules state
let currentPresetName = null;
let currentPresetRules = [];

let forceRecheck = null;
let clearRuleCaches = null;

function initSettingsStore(deps) {
    forceRecheck = (deps && typeof deps.forceRecheck === "function") ? deps.forceRecheck : null;
    clearRuleCaches = (deps && typeof deps.clearRuleCaches === "function") ? deps.clearRuleCaches : null;
}

function getGlobalProfiles() {
    if (!extension_settings[SETTINGS_KEY_GLOBAL] || typeof extension_settings[SETTINGS_KEY_GLOBAL] !== 'object' || Array.isArray(extension_settings[SETTINGS_KEY_GLOBAL])) {
        // Migration from single array global to profiles dict
        const oldRules = Array.isArray(extension_settings[SETTINGS_KEY_GLOBAL]) ? extension_settings[SETTINGS_KEY_GLOBAL] : [];
        extension_settings[SETTINGS_KEY_GLOBAL] = { 'Default': oldRules };
        extension_settings[SETTINGS_KEY_GLOBAL_PROFILE] = 'Default';
        saveSettingsDebounced();
    }
    return extension_settings[SETTINGS_KEY_GLOBAL];
}

function getCurrentGlobalProfileName() {
    const profiles = getGlobalProfiles();
    let current = extension_settings[SETTINGS_KEY_GLOBAL_PROFILE];
    if (!current || !profiles[current]) {
        current = Object.keys(profiles)[0] || 'Default';
        extension_settings[SETTINGS_KEY_GLOBAL_PROFILE] = current;
        if (!profiles[current]) profiles[current] = [];
        saveSettingsDebounced();
    }
    return current;
}

function setCurrentGlobalProfileName(name) {
    extension_settings[SETTINGS_KEY_GLOBAL_PROFILE] = name;
    saveSettingsDebounced();
    if (forceRecheck) forceRecheck();
}

function getGlobalRules() {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    return profiles[current] || [];
}

function isChatCompletionApiActive() {
    return typeof main_api === 'undefined' || main_api === 'openai';
}

function getOpenAiPresetManager() {
    try {
        return getPresetManager('openai') || getPresetManager();
    } catch (e) {
        console.warn('[APT] Could not get OpenAI preset manager:', e);
        return null;
    }
}

function saveGlobalRules(rules) {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    profiles[current] = rules;
    extension_settings[SETTINGS_KEY_GLOBAL] = profiles;
    if (clearRuleCaches) clearRuleCaches();
    saveSettingsDebounced();
    if (forceRecheck) forceRecheck();
}

async function savePresetRules() {
    const presetMgr = getOpenAiPresetManager();
    if (!presetMgr) return;
    
    currentPresetName = presetMgr.getSelectedPresetName();
    if (!currentPresetName) return;

    try {
        let aptExt = null;
        try {
            aptExt = presetMgr.readPresetExtensionField({
                name: currentPresetName,
                path: 'auto_prompt_toggler',
            });
        } catch (e) {
            console.warn('[APT] Could not read preset extension field before saving rules:', e);
        }

        const nextExt = aptExt && typeof aptExt === 'object' && !Array.isArray(aptExt) ? { ...aptExt } : {};
        nextExt.rules = currentPresetRules;

        await presetMgr.writePresetExtensionField({
            name: currentPresetName,
            path: 'auto_prompt_toggler',
            value: nextExt,
        });
        console.log('[APT] Preset rules saved to file successfully.');
        if (clearRuleCaches) clearRuleCaches();
        if (forceRecheck) forceRecheck();
    } catch (e) {
        console.error('[APT] Error saving preset rules to file:', e);
    }
}

function getNotificationsEnabled() {
    const val = extension_settings[SETTINGS_KEY_NOTIFICATIONS];
    return (typeof val === 'undefined') ? true : val;
}

function setNotificationsEnabled(enabled) {
    extension_settings[SETTINGS_KEY_NOTIFICATIONS] = enabled;
    saveSettingsDebounced();
}

function getCurrentPresetName() {
    return currentPresetName;
}

function setCurrentPresetName(name) {
    currentPresetName = name;
}

function getCurrentPresetRules() {
    return currentPresetRules;
}

function setCurrentPresetRules(rules) {
    currentPresetRules = rules;
}

export {
    initSettingsStore,
    getGlobalProfiles,
    getCurrentGlobalProfileName,
    setCurrentGlobalProfileName,
    getGlobalRules,
    isChatCompletionApiActive,
    getOpenAiPresetManager,
    getCurrentPresetName,
    setCurrentPresetName,
    getCurrentPresetRules,
    setCurrentPresetRules,
    saveGlobalRules,
    savePresetRules,
    getNotificationsEnabled,
    setNotificationsEnabled,
    SETTINGS_KEY_GLOBAL,
    SETTINGS_KEY_GLOBAL_PROFILE,
};
