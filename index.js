import { chat, eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { download, getFileText, getSortableDelay } from '../../../utils.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const SETTINGS_KEY = 'auto_prompt_toggler';

let chatObserver = null;
let lastMessageId = null;
let triggeredRules = new Set();
let processTimeout = null;

function getRules() {
    return extension_settings[SETTINGS_KEY] || [];
}

function saveRules(rules) {
    extension_settings[SETTINGS_KEY] = rules;
    saveSettingsDebounced();
}

function getAvailablePrompts() {
    if (!promptManager || !promptManager.serviceSettings || !promptManager.serviceSettings.prompts) {
        return [];
    }
    return promptManager.serviceSettings.prompts;
}

async function openEditor(ruleIndex = -1) {
    const rules = getRules();
    const rule = ruleIndex >= 0 ? rules[ruleIndex] : { action: 'enable', enabled: true };
    
    const editorTemplate = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'editor');
    const editorHtml = $(editorTemplate);
    
    // Populate editor fields
    editorHtml.find('#apt_editor_trigger').val(rule.trigger || '');
    editorHtml.find('#apt_editor_action').val(rule.action || 'enable');
    
    const promptSelect = editorHtml.find('#apt_editor_prompt_id');
    const prompts = getAvailablePrompts();
    prompts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    prompts.forEach(p => {
        promptSelect.append(new Option(p.name || p.identifier, p.identifier, false, p.identifier === rule.promptId));
    });
    
    // Show popup
    const popupResult = await callGenericPopup(editorHtml, POPUP_TYPE.CONFIRM, '', { 
        okButton: '儲存', 
        cancelButton: '取消' 
    });
    
    if (popupResult) {
        const newTrigger = editorHtml.find('#apt_editor_trigger').val();
        const newPromptId = editorHtml.find('#apt_editor_prompt_id').val();
        const newAction = editorHtml.find('#apt_editor_action').val();
        
        if (newPromptId) {
            const newRule = { 
                trigger: newTrigger, 
                promptId: newPromptId, 
                action: newAction,
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
        const prompt = getAvailablePrompts().find(p => p.identifier === rule.promptId);
        const promptName = prompt ? (prompt.name || prompt.identifier) : rule.promptId;
        const actionText = {
            'enable': '開啟',
            'disable': '關閉',
            'toggle': '切換'
        }[rule.action] || rule.action;

        const summaryText = `${rule.trigger || '(無觸發條件)'} ➜ ${promptName} (${actionText})`;
        item.find('.apt-rule-summary').text(summaryText);
        item.find('.apt-rule-summary').attr('title', summaryText);
        
        // Buttons
        item.find('.rule-edit').on('click', (e) => {
            e.stopPropagation();
            openEditor(index);
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
        if (!rule.trigger || !rule.promptId) return;
        if (triggeredRules.has(index)) return; 

        try {
            const regex = new RegExp(rule.trigger, 'i');
            if (regex.test(text)) {
                triggeredRules.add(index);
                
                if (!promptManager) return;
                const entry = promptManager.getPromptOrderEntry(promptManager.activeCharacter, rule.promptId);
                
                if (entry) {
                    const prompt = promptManager.getPromptById(rule.promptId);
                    
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

    $('#auto_prompt_toggler_add_rule').on('click', () => {
        openEditor();
    });

    $('#auto_prompt_toggler_export').on('click', () => {
        const rules = getRules();
        const json = JSON.stringify(rules, null, 4);
        download(json, 'auto_prompt_toggler_rules.json', 'application/json');
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
