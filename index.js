import { chat, eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { download, getFileText, getSortableDelay, escapeHtml } from '../../../utils.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const SETTINGS_KEY = 'auto_prompt_toggler';
const SETTINGS_KEY_PROFILES = 'auto_prompt_toggler_profiles';
const SETTINGS_KEY_PROFILE = 'auto_prompt_toggler_current_profile';

let chatObserver = null;
let lastMessageId = null;
let triggeredRules = new Set();
let processTimeout = null;

function getRules() {
    return extension_settings[SETTINGS_KEY] || [];
}

function getProfiles() {
    return extension_settings[SETTINGS_KEY_PROFILES] || {};
}

function getCurrentProfileName() {
    return extension_settings[SETTINGS_KEY_PROFILE] || 'Default';
}

function setCurrentProfileName(name) {
    const profiles = getProfiles();
    if (!profiles[name]) return;
    
    extension_settings[SETTINGS_KEY_PROFILE] = name;
    extension_settings[SETTINGS_KEY] = profiles[name];
    saveSettingsDebounced();
}

function saveRules(rules) {
    extension_settings[SETTINGS_KEY] = rules;
    
    // Sync to profile
    const current = extension_settings[SETTINGS_KEY_PROFILE] || 'Default';
    if (!extension_settings[SETTINGS_KEY_PROFILES]) {
        extension_settings[SETTINGS_KEY_PROFILES] = {};
    }
    extension_settings[SETTINGS_KEY_PROFILES][current] = rules;

    saveSettingsDebounced();
}

function renderProfileSelect() {
    const select = $('#apt_profile_select');
    select.empty();
    const profiles = getProfiles();
    const current = getCurrentProfileName();
    
    Object.keys(profiles).sort().forEach(name => {
        const option = $('<option>').val(name).text(name);
        if (name === current) option.prop('selected', true);
        select.append(option);
    });
}

function getAvailablePrompts() {
    if (!promptManager) return [];
    
    // Get the authoritative order list directly from PromptManager
    // This ensures we ONLY get prompts that are actually in the current order
    let activeOrder = [];
    try {
        if (typeof promptManager.getPromptOrderForCharacter === 'function') {
            activeOrder = promptManager.getPromptOrderForCharacter(promptManager.activeCharacter);
        } else {
            // Fallback for older versions if method missing (unlikely)
            console.warn('APT: getPromptOrderForCharacter not found');
            return [];
        }
    } catch (e) {
        console.error("APT: Failed to get prompt order", e);
        return [];
    }
    
    if (!activeOrder || !Array.isArray(activeOrder)) return [];
    
    // Map order entries to prompt objects
    const result = activeOrder.map(entry => {
        if (!entry || !entry.identifier) return null;
        // Strictly follow PromptManager logic: only include prompts that define a valid object.
        // If getPromptById returns null (definition missing), we should exclude it too.
        return promptManager.getPromptById(entry.identifier);
    });
    
    // Filter out nulls
    return result.filter(p => p !== null);
}

async function openEditor(ruleIndex = -1) {
    const rules = getRules();
    const rule = ruleIndex >= 0 ? rules[ruleIndex] : { action: 'enable', enabled: true, promptIds: [] };
    
    // Migration for old rules
    if (rule.promptId && !rule.promptIds) {
        rule.promptIds = [rule.promptId];
    }
    
    const editorTemplate = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'editor');
    const editorHtml = $(editorTemplate);
    
    // Populate editor fields
    editorHtml.find('#apt_editor_trigger').val(rule.trigger || '');
    editorHtml.find('#apt_editor_action').val(rule.action || 'enable');
    
    // Migration logic for inverseOnNoMatch
    let inverse = rule.inverseOnNoMatch || false;
    
    // If undefined, try to migrate from older settings
    if (typeof rule.inverseOnNoMatch === 'undefined') {
        if (rule.noMatchAction) {
             if ((rule.action === 'enable' && rule.noMatchAction === 'disable') ||
                 (rule.action === 'disable' && rule.noMatchAction === 'enable') ||
                 (rule.action === 'toggle' && rule.noMatchAction === 'toggle')) {
                     inverse = true;
             }
        } else if (rule.closeOnNoMatch) {
             // Old checkbox "Close on no match" implies inverse for 'enable' action
             // But if action was 'disable', close on no match meant 'disable' too (always disable).
             // However, strictly speaking "Inverse" is cleaner. 
             // Let's assume user wants 'enable' -> 'disable' behavior mainly.
             if (rule.action === 'enable') inverse = true;
        }
    }
    
    editorHtml.find('#apt_editor_inverse_on_no_match').prop('checked', inverse);
    
    const promptList = editorHtml.find('#apt_editor_prompt_list');
    const prompts = getAvailablePrompts();
    prompts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Debug info
    const charId = promptManager?.activeCharacter?.id ?? 'unknown';
    console.log(`[APT] Editor opened. Active Character ID: ${charId}. Found ${prompts.length} prompts.`);
    editorHtml.find('.apt-prompt-list').after(`<div style="font-size: 0.8em; color: gray; margin-top: 5px;">Active CharID: ${charId} | Prompts: ${prompts.length}</div>`);
    
    prompts.forEach(p => {
        const isSelected = rule.promptIds && rule.promptIds.includes(p.identifier);
        // Clean identifier for ID usage
        const cleanId = p.identifier.replace(/[^a-zA-Z0-9-_]/g, '_');
        const uniqueId = `apt_prompt_${cleanId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Robust display name: prefer name, fallback to identifier. Handle whitespace-only names.
        let displayName = p.name;
        if (!displayName || (typeof displayName === 'string' && displayName.trim() === '')) {
            displayName = p.identifier;
        }

        // Skip invalid prompts that would result in blank entries
        if (!displayName || (typeof displayName === 'string' && displayName.trim() === '')) {
            return;
        }

        const item = $(`
            <div class="apt-prompt-item">
                <input type="checkbox" id="${uniqueId}" value="${escapeHtml(p.identifier)}" ${isSelected ? 'checked' : ''}>
                <label for="${uniqueId}" title="${escapeHtml(p.identifier)}">
                    ${escapeHtml(displayName)}
                </label>
            </div>
        `);
        promptList.append(item);
    });
    
    // Show popup
    const popupResult = await callGenericPopup(editorHtml, POPUP_TYPE.CONFIRM, '', { 
        okButton: '儲存', 
        cancelButton: '取消' 
    });
    
    if (popupResult) {
        const newTrigger = editorHtml.find('#apt_editor_trigger').val();
        // Collect checked values
        const newPromptIds = editorHtml.find('#apt_editor_prompt_list input:checked').map((_, el) => $(el).val()).get();
        const newAction = editorHtml.find('#apt_editor_action').val();
        const newInverse = editorHtml.find('#apt_editor_inverse_on_no_match').prop('checked');
        
        if (newPromptIds && newPromptIds.length > 0) {
            const newRule = { 
                trigger: newTrigger, 
                promptIds: newPromptIds, 
                action: newAction,
                inverseOnNoMatch: newInverse,
                enabled: rule.enabled ?? true
            };
            if (ruleIndex >= 0) {
                rules[ruleIndex] = newRule;
            } else {
                rules.push(newRule);
            }
            saveRules(rules);
            renderRulesList();
        }
    }
}

function renderRulesList() {
    const list = $('#auto_prompt_toggler_rules_list');
    list.empty();
    const rules = getRules();

    if (rules.length === 0) {
        list.html('<div class="apt-no-rules">暫無規則</div>');
        return;
    }

    // Get template content from DOM
    // Note: In settings.html we appended the template to #extensions_settings (via append(settingsHtml))
    // But renderExtensionTemplateAsync returns a string/element.
    // We need to find the template in the document.
    // Since settings.html content is appended to the settings area, the template should be there.
    let templateContent = $('#auto_prompt_toggler_rule_item_template').html();
    
    rules.forEach((rule, index) => {
        if (typeof rule.enabled === 'undefined') {
            rule.enabled = true;
        }

        const item = $(templateContent);
        item.data('rule', rule);
        item.attr('data-id', index);
        
        // Populate checkbox
        item.find('.apt-rule-enable').prop('checked', rule.enabled).on('change', function() {
            rule.enabled = $(this).prop('checked');
            saveRules(rules);
        });

        // Populate summary
        let promptNames = [];
        if (rule.promptIds && Array.isArray(rule.promptIds)) {
            promptNames = rule.promptIds.map(id => {
                const prompt = getAvailablePrompts().find(p => p.identifier === id);
                return prompt ? (prompt.name || prompt.identifier) : id;
            });
        } else if (rule.promptId) {
            // Backward compatibility
            const prompt = getAvailablePrompts().find(p => p.identifier === rule.promptId);
            promptNames = [prompt ? (prompt.name || prompt.identifier) : rule.promptId];
        }

        const actionText = {
            'enable': '開啟',
            'disable': '關閉',
            'toggle': '切換'
        }[rule.action] || rule.action;

        let promptDisplay = '';
        if (promptNames.length > 1) {
            promptDisplay = ` ${promptNames.length} 個提示詞`;
        } else {
            promptDisplay = promptNames.join(', ');
        }

        const summaryText = `${rule.trigger || '(無觸發條件)'} ➜ ${promptDisplay} (${actionText})`;
        item.find('.apt-rule-summary').text(summaryText);
        
        // Full text in title for hover
        const titleText = `${rule.trigger || '(無觸發條件)'} ➜ ${promptNames.join(', ')} (${actionText})`;
        item.find('.apt-rule-summary').attr('title', titleText);
        
        // Buttons
        item.find('.rule-edit').on('click', (e) => {
            e.stopPropagation();
            openEditor(index);
        });

        item.find('.rule-duplicate').on('click', (e) => {
            e.stopPropagation();
            const newRule = JSON.parse(JSON.stringify(rule));
            rules.splice(index + 1, 0, newRule);
            saveRules(rules);
            renderRulesList();
        });
        
        item.find('.rule-delete').on('click', (e) => {
            e.stopPropagation();
            if (confirm(`確定要刪除規則 "${summaryText}" 嗎?`)) {
                rules.splice(index, 1);
                saveRules(rules);
                renderRulesList();
            }
        });

        item.find('.rule-export').on('click', (e) => {
            e.stopPropagation();
            const json = JSON.stringify([rule], null, 4);
            download(json, `auto_prompt_toggler_rule_${index}.json`, 'application/json');
        });
        
        list.append(item);
    });
}

function debouncedProcessText(text) {
    if (processTimeout) clearTimeout(processTimeout);
    processTimeout = setTimeout(() => {
        processText(text);
    }, 200);
}

function processText(text) {
    const currentRules = getRules();
    let changed = false;

    currentRules.forEach((rule, index) => {
        if (rule.enabled === false) return;
        if (!rule.trigger || (!rule.promptId && (!rule.promptIds || rule.promptIds.length === 0))) return;
        
        try {
            const regex = new RegExp(rule.trigger, 'i');
            const isMatch = regex.test(text);
            const targetIds = rule.promptIds || [rule.promptId];

            if (isMatch) {
                if (triggeredRules.has(index)) return; // Already triggered

                triggeredRules.add(index);
                
                if (!promptManager) return;

                targetIds.forEach(pId => {
                    const entry = promptManager.getPromptOrderEntry(promptManager.activeCharacter, pId);
                    
                    if (entry) {
                        const prompt = promptManager.getPromptById(pId);
                        
                        let newState = entry.enabled;
                        let shouldChange = false;

                        if (rule.action === 'enable' && !entry.enabled) {
                            newState = true;
                            shouldChange = true;
                        } else if (rule.action === 'disable' && entry.enabled) {
                            newState = false;
                            shouldChange = true;
                        } else if (rule.action === 'toggle') {
                            newState = !entry.enabled;
                            shouldChange = true;
                        }

                        if (shouldChange) {
                            entry.enabled = newState;
                            changed = true;
                            const status = newState ? '開啟' : '關閉';
                            toastr.info(`${status}提示詞: ${prompt.name}`, 'Auto Prompt Toggler');
                        }
                    }
                });
            } else {
                // No match
                let noMatchAction = 'none';
                
                if (rule.inverseOnNoMatch) {
                    if (rule.action === 'enable') noMatchAction = 'disable';
                    else if (rule.action === 'disable') noMatchAction = 'enable';
                    else if (rule.action === 'toggle') noMatchAction = 'toggle';
                } else if (rule.noMatchAction) {
                    noMatchAction = rule.noMatchAction;
                } else if (rule.closeOnNoMatch) {
                    noMatchAction = 'disable';
                }
                
                if (noMatchAction !== 'none') {
                    // Reset trigger state if it was previously triggered
                    if (triggeredRules.has(index)) {
                        triggeredRules.delete(index);
                    }

                    if (!promptManager) return;

                    targetIds.forEach(pId => {
                        const entry = promptManager.getPromptOrderEntry(promptManager.activeCharacter, pId);
                        
                        if (entry) {
                            let shouldChange = false;
                            let newState = entry.enabled;
                            
                            if (noMatchAction === 'enable' && !entry.enabled) {
                                newState = true;
                                shouldChange = true;
                            } else if (noMatchAction === 'disable' && entry.enabled) {
                                newState = false;
                                shouldChange = true;
                            }
                            
                            if (shouldChange) {
                                entry.enabled = newState;
                                changed = true;
                            }
                        }
                    });
                }
            }
        } catch (e) {
            console.error('[AutoPromptToggler] Error processing rule:', e);
        }
    });

    if (changed) {
        promptManager.saveServiceSettings();
        promptManager.render();
    }
}

function initObserver() {
    const chatContainer = document.querySelector('#chat');
    if (!chatContainer) {
        setTimeout(initObserver, 1000);
        return;
    }

    if (chatObserver) chatObserver.disconnect();

    chatObserver = new MutationObserver((mutations) => {
        const messages = chatContainer.querySelectorAll('.mes');
        if (messages.length === 0) return;
        
        const lastMessageDiv = messages[messages.length - 1];
        
        if (lastMessageDiv.classList.contains('is_user')) return;

        const msgIndex = messages.length - 1;
        const currentMsgId = `msg-${msgIndex}`;

        if (currentMsgId !== lastMessageId) {
            lastMessageId = currentMsgId;
            triggeredRules.clear();
        }

        const textDiv = lastMessageDiv.querySelector('.mes_text');
        if (textDiv) {
            const text = textDiv.innerText || textDiv.textContent;
            debouncedProcessText(text);
        }
    });

    chatObserver.observe(chatContainer, { 
        childList: true, 
        subtree: true, 
        characterData: true 
    });
    
    console.log("[AutoPromptToggler] Chat observer initialized.");
}

jQuery(async () => {
    if (!extension_settings[SETTINGS_KEY]) {
        extension_settings[SETTINGS_KEY] = [];
    }

    const settingsHtml = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'settings');
    $('#extensions_settings').append(settingsHtml);

    // Profile Management Init
    if (!extension_settings[SETTINGS_KEY_PROFILES]) {
        extension_settings[SETTINGS_KEY_PROFILES] = {
            'Default': extension_settings[SETTINGS_KEY] || []
        };
        extension_settings[SETTINGS_KEY_PROFILE] = 'Default';
        saveSettingsDebounced();
    }
    
    renderProfileSelect();

    $('#apt_profile_select').on('change', function() {
        const newProfile = $(this).val();
        setCurrentProfileName(newProfile);
        renderRulesList();
    });

    $('#apt_profile_new').on('click', () => {
        const name = prompt('請輸入新設定檔名稱 (Enter new profile name):');
        if (name && name.trim()) {
            const cleanName = name.trim();
            const profiles = getProfiles();
            if (profiles[cleanName]) {
                toastr.error('設定檔名稱已存在');
                return;
            }
            // Create new profile (empty)
            extension_settings[SETTINGS_KEY_PROFILES][cleanName] = [];
            setCurrentProfileName(cleanName);
            renderProfileSelect();
            renderRulesList();
            toastr.success(`已建立設定檔: ${cleanName}`);
        }
    });

    $('#apt_profile_rename').on('click', () => {
        const current = getCurrentProfileName();
        const newName = prompt(`重新命名設定檔 "${current}" 為:`, current);
        if (newName && newName.trim() && newName !== current) {
            const cleanName = newName.trim();
            const profiles = getProfiles();
            if (profiles[cleanName]) {
                toastr.error('設定檔名稱已存在');
                return;
            }
            profiles[cleanName] = profiles[current];
            delete profiles[current];
            extension_settings[SETTINGS_KEY_PROFILES] = profiles;
            extension_settings[SETTINGS_KEY_PROFILE] = cleanName;
            saveSettingsDebounced();
            
            renderProfileSelect();
            toastr.success(`已重新命名為: ${cleanName}`);
        }
    });

    $('#apt_profile_delete').on('click', () => {
        const current = getCurrentProfileName();
        const profiles = getProfiles();
        const keys = Object.keys(profiles);
        
        if (keys.length <= 1) {
            toastr.error('無法刪除最後一個設定檔');
            return;
        }
        
        if (confirm(`確定要刪除設定檔 "${current}" 嗎?`)) {
            delete profiles[current];
            extension_settings[SETTINGS_KEY_PROFILES] = profiles;
            const next = Object.keys(profiles)[0];
            setCurrentProfileName(next);
            renderProfileSelect();
            renderRulesList();
            toastr.info(`已刪除設定檔: ${current}`);
        }
    });

    $('#apt_profile_export').on('click', () => {
        const rules = getRules();
        const currentProfile = getCurrentProfileName();
        const json = JSON.stringify(rules, null, 4);
        download(json, `auto_prompt_toggler_${currentProfile}.json`, 'application/json');
    });

    $('#apt_profile_import').on('click', () => {
        $('#apt_profile_import_file').trigger('click');
    });

    $('#apt_profile_import_file').on('change', async function() {
        const file = this.files[0];
        if (!file) return;

        try {
            const text = await getFileText(file);
            const rules = JSON.parse(text);
            
            if (Array.isArray(rules)) {
                let defaultName = file.name.replace(/\.json$/i, '');
                defaultName = defaultName.replace(/^auto_prompt_toggler_/, '');
                
                const name = prompt('請輸入匯入的設定檔名稱 (Enter imported profile name):', defaultName);
                
                if (name && name.trim()) {
                    const cleanName = name.trim();
                    const profiles = getProfiles();
                    
                    if (profiles[cleanName]) {
                        if (!confirm(`設定檔 "${cleanName}" 已存在。是否覆蓋?`)) {
                            this.value = '';
                            return;
                        }
                    }

                    rules.forEach(r => {
                        if (typeof r.enabled === 'undefined') r.enabled = true;
                    });
                    
                    if (!extension_settings[SETTINGS_KEY_PROFILES]) {
                        extension_settings[SETTINGS_KEY_PROFILES] = {};
                    }
                    extension_settings[SETTINGS_KEY_PROFILES][cleanName] = rules;
                    setCurrentProfileName(cleanName);
                    renderProfileSelect();
                    renderRulesList();
                    toastr.success(`已匯入設定檔: ${cleanName}`);
                }
            } else {
                toastr.error('無效的規則檔案', 'Auto Prompt Toggler');
            }
        } catch (e) {
            console.error(e);
            toastr.error('匯入失敗: ' + e.message, 'Auto Prompt Toggler');
        }
        
        this.value = ''; 
    });

    $('#auto_prompt_toggler_add_rule').on('click', () => {
        openEditor();
    });

    $('#auto_prompt_toggler_export').on('click', () => {
        const rules = getRules();
        const currentProfile = getCurrentProfileName();
        const json = JSON.stringify(rules, null, 4);
        download(json, `auto_prompt_toggler_${currentProfile}.json`, 'application/json');
    });

    $('#auto_prompt_toggler_import').on('click', () => {
        $('#auto_prompt_toggler_import_file').trigger('click');
    });

    $('#auto_prompt_toggler_clear').on('click', () => {
        if (confirm('確定要清空所有規則嗎?')) {
            saveRules([]);
            renderRulesList();
            toastr.info('已清空所有規則', 'Auto Prompt Toggler');
        }
    });

    $('#auto_prompt_toggler_import_file').on('change', async function() {
        const file = this.files[0];
        if (!file) return;

        try {
            const text = await getFileText(file);
            const rules = JSON.parse(text);
            
            if (Array.isArray(rules)) {
                rules.forEach(r => {
                    if (typeof r.enabled === 'undefined') r.enabled = true;
                });
                
                // Append or Replace? Usually import implies append, but user might want replace.
                // CSTT appends dictionaries.
                // Let's append to existing rules.
                const currentRules = getRules();
                const newRules = [...currentRules, ...rules];
                
                saveRules(newRules);
                renderRulesList();
                toastr.success(`匯入成功，新增 ${rules.length} 條規則`, 'Auto Prompt Toggler');
            } else {
                toastr.error('無效的規則檔案', 'Auto Prompt Toggler');
            }
        } catch (e) {
            console.error(e);
            toastr.error('匯入失敗: ' + e.message, 'Auto Prompt Toggler');
        }
        
        this.value = ''; 
    });

    renderRulesList();
    initObserver();
});
