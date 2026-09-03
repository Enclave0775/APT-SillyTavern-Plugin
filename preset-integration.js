import { escapeHtml } from '../../../utils.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { resetLlmInjectorPresetSettings, setLlmInjectorPresetSettings } from './llm-injector.js';
import { t } from './i18n.js';

let isChatCompletionApiActive = null;
let setCurrentPresetRules = null;
let setCurrentPresetName = null;
let getCurrentPresetName = null;
let getOpenAiPresetManager = null;
let renderRulesLists = null;
let forceRecheck = null;
let normalizeImportedRule = null;

function initPresetIntegration(deps) {
    isChatCompletionApiActive = deps && typeof deps.isChatCompletionApiActive === "function" ? deps.isChatCompletionApiActive : null;
    setCurrentPresetRules = deps && typeof deps.setCurrentPresetRules === "function" ? deps.setCurrentPresetRules : null;
    setCurrentPresetName = deps && typeof deps.setCurrentPresetName === "function" ? deps.setCurrentPresetName : null;
    getCurrentPresetName = deps && typeof deps.getCurrentPresetName === "function" ? deps.getCurrentPresetName : null;
    getOpenAiPresetManager = deps && typeof deps.getOpenAiPresetManager === "function" ? deps.getOpenAiPresetManager : null;
    renderRulesLists = deps && typeof deps.renderRulesLists === "function" ? deps.renderRulesLists : null;
    forceRecheck = deps && typeof deps.forceRecheck === "function" ? deps.forceRecheck : null;
    normalizeImportedRule = deps && typeof deps.normalizeImportedRule === "function" ? deps.normalizeImportedRule : null;
}

async function updatePresetState() {
    if (!isChatCompletionApiActive()) {
        setCurrentPresetRules([]);
        setCurrentPresetName(null);
        resetLlmInjectorPresetSettings();
        renderRulesLists();
        return;
    }

    const presetMgr = getOpenAiPresetManager();
    if (!presetMgr) {
        setCurrentPresetRules([]);
        resetLlmInjectorPresetSettings();
        renderRulesLists();
        return;
    }

    setCurrentPresetName(presetMgr.getSelectedPresetName());
    if (!getCurrentPresetName()) {
        setCurrentPresetRules([]);
        resetLlmInjectorPresetSettings();
        renderRulesLists();
        return;
    }

    let aptExt = null;
    try {
        aptExt = presetMgr.readPresetExtensionField({
            name: getCurrentPresetName(),
            path: 'auto_prompt_toggler',
        });
    } catch (e) {
        console.warn('[APT] Could not read preset extension field:', e);
    }

    if (!aptExt) {
        setCurrentPresetRules([]);
        resetLlmInjectorPresetSettings();
        renderRulesLists();
        forceRecheck();
        return;
    }

    // Migration 1: Handle old OAI Presets where auto_prompt_toggler was directly an array of rules
    if (Array.isArray(aptExt)) {
        aptExt = { rules: aptExt };
        console.log('[APT] Migrated legacy array-based preset rules to object format.');
        try {
            await presetMgr.writePresetExtensionField({
                name: getCurrentPresetName(),
                path: 'auto_prompt_toggler',
                value: aptExt,
            });
        } catch (e) {
            console.error('[APT] Failed to save migrated preset rules:', e);
        }
    }
    // Migration 2: Handle old Profile Dictionary format (e.g. { "Profile1": [...], "Default": [...] })
    else if (aptExt && typeof aptExt === 'object' && !Array.isArray(aptExt) && aptExt.rules === undefined) {
        // If it's an object but doesn't have a 'rules' array, it might be the old profiles dictionary
        let mergedRules = [];
        for (const [profileName, profileRules] of Object.entries(aptExt)) {
            if (Array.isArray(profileRules)) {
                mergedRules = mergedRules.concat(profileRules);
            }
        }
        if (mergedRules.length > 0) {
            aptExt = { rules: mergedRules };
            console.log('[APT] Migrated legacy profile-dictionary preset rules to object format.');
            try {
                await presetMgr.writePresetExtensionField({
                    name: getCurrentPresetName(),
                    path: 'auto_prompt_toggler',
                    value: aptExt,
                });
            } catch (e) {
                console.error('[APT] Failed to save migrated preset rules:', e);
            }
        } else {
            // It's an object but no recognizable rules array could be extracted
            aptExt.rules = [];
        }
    }

    setCurrentPresetRules(Array.isArray(aptExt.rules) ? aptExt.rules : []);
    setLlmInjectorPresetSettings(aptExt.llmInjector || aptExt.llm_injector || aptExt.sceneInjector || null);
    renderRulesLists();
    forceRecheck();
}

async function onOaiPresetExportReady(preset) {
    if (preset && preset.extensions && preset.extensions.auto_prompt_toggler && preset.extensions.auto_prompt_toggler.llmInjector) {
        const llmInjector = preset.extensions.auto_prompt_toggler.llmInjector;
        if (llmInjector.baseUrl || llmInjector.apiKey) {
            const htmlMessage = `
                <h3>要一併匯出 APT 插件的 API 端點與 Key 嗎？</h3>
                <p>此提示詞預設檔包含了 <strong>LLM 場景注入</strong> 的獨立 API 端點或 Key。</p>
                <p style="font-size: 0.8em; color: gray;">如果您準備分享此設定檔，建議不要匯出 API 資訊，以免您的 API Key 外洩。</p>
            `;
            const confirmResult = await callGenericPopup(htmlMessage, POPUP_TYPE.CONFIRM, '', {
                okButton: '保留 API 資訊',
                cancelButton: '移除 API 資訊'
            });

            if (!confirmResult) {
                delete preset.extensions.auto_prompt_toggler.llmInjector.baseUrl;
                delete preset.extensions.auto_prompt_toggler.llmInjector.apiKey;
                toastr.info('已在匯出時移除 APT 的 API 端點與 Key', 'Auto Prompt Toggler');
            }
        }
    }
}

async function onOaiPresetImportReady(result) {
    // result is { data: object; presetName: string }
    if (result && result.data && result.data.extensions && result.data.extensions.auto_prompt_toggler) {
        let aptData = result.data.extensions.auto_prompt_toggler;
        let importedRules = [];
        let hasLlmInjector = false;

        if (Array.isArray(aptData)) {
            importedRules = aptData;
        } else if (aptData && typeof aptData === 'object') {
            hasLlmInjector = !!aptData.llmInjector || !!aptData.llm_injector || !!aptData.sceneInjector;
            if (aptData.rules && Array.isArray(aptData.rules)) {
                importedRules = aptData.rules;
            } else {
                // Extract from old profile dictionary
                for (const [key, profileRules] of Object.entries(aptData)) {
                    if (key !== 'llmInjector' && key !== 'llm_injector' && key !== 'sceneInjector' && Array.isArray(profileRules)) {
                        importedRules = importedRules.concat(profileRules);
                    }
                }
            }
        }

        importedRules = importedRules.map(normalizeImportedRule).filter(Boolean);
        const preservedAptData = aptData && typeof aptData === 'object' && !Array.isArray(aptData) ? { ...aptData } : {};

        if (importedRules.length > 0) {
            const presetName = result.presetName || 'Imported Preset';

            // 彈出確認視窗，讓使用者知道裡面有規則並詢問是否保留
            const htmlMessage = `
                <h3>此預設檔 (Preset) 包含 APT 規則。</h3>
                <p>您是否要將這些規則匯入並綁定至 <strong>${escapeHtml(presetName)}</strong>？</p>
                <p style="font-size: 0.8em; color: gray;">如果您選擇取消，預設檔仍會匯入，但 APT 規則將會被捨棄。</p>
            `;

            const confirmResult = await callGenericPopup(htmlMessage, POPUP_TYPE.CONFIRM, '', {
                okButton: t('keep_rules'),
                cancelButton: t('discard_rules')
            });

            if (confirmResult) {
                // 標準化為新格式，確保 SillyTavern 存檔時是正確的格式
                preservedAptData.rules = importedRules;
                result.data.extensions.auto_prompt_toggler = preservedAptData;
                toastr.success(`已從預設檔匯入 ${importedRules.length} 條 APT 規則${hasLlmInjector ? '與提示詞設置' : ''}`, 'Auto Prompt Toggler');
            } else {
                // 使用者選擇捨棄規則
                if (hasLlmInjector) {
                    preservedAptData.rules = [];
                    result.data.extensions.auto_prompt_toggler = preservedAptData;
                    toastr.info('已捨棄預設檔附帶的 APT 規則，但保留了提示詞設置', 'Auto Prompt Toggler');
                } else {
                    delete result.data.extensions.auto_prompt_toggler;
                    toastr.info('已捨棄預設檔附帶的 APT 規則', 'Auto Prompt Toggler');
                }
            }
        } else {
            // 若規則解析失敗或為 0 條
            if (hasLlmInjector) {
                preservedAptData.rules = [];
                result.data.extensions.auto_prompt_toggler = preservedAptData;
            } else {
                delete result.data.extensions.auto_prompt_toggler;
            }
        }
    }
}

export {
    initPresetIntegration,
    updatePresetState,
    onOaiPresetExportReady,
    onOaiPresetImportReady,
};

