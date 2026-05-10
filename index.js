import { chat, eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { download, getFileText, getSortableDelay, escapeHtml } from '../../../utils.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { getPresetManager } from '../../../preset-manager.js';

const SETTINGS_KEY_GLOBAL = 'auto_prompt_toggler_global'; // Now a dictionary: { "ProfileName": [rules], ... }
const SETTINGS_KEY_GLOBAL_PROFILE = 'auto_prompt_toggler_global_current_profile';
const SETTINGS_KEY_NOTIFICATIONS = 'auto_prompt_toggler_notifications';

let chatObserver = null;
let lastMessageId = null;
let triggeredRules = new Set(); // Store string ID (e.g. "global_0", "preset_1")
let processTimeout = null;

// Preset rules state
let currentPresetName = null;
let currentPresetRules = [];

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
}

function getGlobalRules() {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    return profiles[current] || [];
}

function forceRecheck() {
    lastMessageId = null;
    triggeredRules.clear();
    
    // Get recent messages from DOM to re-trigger the check
    const chatContainer = document.querySelector('#chat');
    if (!chatContainer) return;
    const messages = chatContainer.querySelectorAll('.mes');
    if (messages.length === 0) return;
    
    const recentMessages = [];
    const allRules = [
        ...getGlobalRules(),
        ...currentPresetRules
    ];
    
    let maxDepth = 1;
    let checkAll = false;
    for (const rule of allRules) {
        if (rule.depth === 0) checkAll = true;
        if (rule.depth > maxDepth) maxDepth = rule.depth;
    }
    
    const countToProcess = checkAll ? messages.length : Math.min(messages.length, maxDepth);
    for (let i = messages.length - countToProcess; i < messages.length; i++) {
        const msgDiv = messages[i];
        const chatMsg = (typeof chat !== 'undefined' && Array.isArray(chat) && i < chat.length) ? chat[i] : null;
        recentMessages.push(extractMessageData(msgDiv, chatMsg));
    }
    
    debouncedProcessText(recentMessages);
}

function saveGlobalRules(rules) {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    profiles[current] = rules;
    extension_settings[SETTINGS_KEY_GLOBAL] = profiles;
    saveSettingsDebounced();
    forceRecheck();
}

async function savePresetRules() {
    const presetMgr = getPresetManager();
    if (!presetMgr) return;
    
    currentPresetName = presetMgr.getSelectedPresetName();
    if (!currentPresetName) return;

        try {
            await presetMgr.writePresetExtensionField({
                name: currentPresetName,
                path: 'auto_prompt_toggler',
                value: { rules: currentPresetRules },
            });
            console.log('[APT] Preset rules saved to file successfully.');
            forceRecheck();
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

async function openEditor(ruleType = 'global', ruleIndex = -1) {
    const rules = ruleType === 'global' ? getGlobalRules() : currentPresetRules;
    // Support new structure (matchPromptIds, noMatchPromptIds) alongside fallback to old promptIds
    const rule = ruleIndex >= 0 ? rules[ruleIndex] : { enabled: true, matchPromptIds: [], noMatchPromptIds: [] };
    
    // Migration for old rules
    if (rule.promptId && !rule.promptIds) {
        rule.promptIds = [rule.promptId];
    }
    // If old promptIds exists but matchPromptIds doesn't, migrate them
    if (rule.promptIds && !rule.matchPromptIds) {
        rule.matchPromptIds = [...rule.promptIds];
        // If it had inverseOnNoMatch, they should probably also be toggled off when not matched
        // But in the new system, we just map old logic to the match list.
        // The new system inherently handles: match -> enable match list, disable noMatch list.
    }
    if (!rule.matchPromptIds) rule.matchPromptIds = [];
    if (!rule.noMatchPromptIds) rule.noMatchPromptIds = [];
    
    const editorTemplate = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'editor');
    const editorHtml = $(editorTemplate);
    
    // Populate editor fields
    editorHtml.find('#apt_editor_rule_name').val(rule.name || '');
    editorHtml.find('#apt_editor_source').val(rule.source || 'display');
    editorHtml.find('#apt_editor_target').val(rule.target || 'ai_output');
    editorHtml.find('#apt_editor_trigger').val(rule.trigger || '');
    editorHtml.find('#apt_editor_depth').val(rule.depth !== undefined ? rule.depth : 1);
    
    const listUnselected = editorHtml.find('#apt_editor_prompt_unselected');
    const listMatch = editorHtml.find('#apt_editor_prompt_match');
    const listNoMatch = editorHtml.find('#apt_editor_prompt_nomatch');
    const prompts = getAvailablePrompts();

    // Debug info
    const charId = promptManager?.activeCharacter?.id ?? 'unknown';
    console.log(`[APT] Editor opened. Active Character ID: ${charId}. Found ${prompts.length} prompts.`);
    editorHtml.find('.apt-dual-list-container').after(`<div style="font-size: 0.8em; color: gray; margin-top: 5px;">Active CharID: ${charId} | Prompts: ${prompts.length}</div>`);
    
    // Categorize prompts
    const matchPrompts = [];
    const noMatchPrompts = [];
    const unselectedPrompts = [];

    prompts.forEach(p => {
        // Robust display name: prefer name, fallback to identifier. Handle whitespace-only names.
        let displayName = p.name;
        if (!displayName || (typeof displayName === 'string' && displayName.trim() === '')) {
            displayName = p.identifier;
        }

        // Skip invalid prompts that would result in blank entries
        if (!displayName || (typeof displayName === 'string' && displayName.trim() === '')) {
            return;
        }

        const isMatch = rule.matchPromptIds && rule.matchPromptIds.includes(p.identifier);
        const isNoMatch = rule.noMatchPromptIds && rule.noMatchPromptIds.includes(p.identifier);
        
        const itemObj = { id: p.identifier, name: displayName };

        if (isMatch) {
            matchPrompts.push(itemObj);
        } else if (isNoMatch) {
            noMatchPrompts.push(itemObj);
        } else {
            unselectedPrompts.push(itemObj);
        }
    });

    // Sort unselected alphabetically
    unselectedPrompts.sort((a, b) => a.name.localeCompare(b.name));
    
    // Sort matches based on the order in rule.matchPromptIds
    if (rule.matchPromptIds) {
        matchPrompts.sort((a, b) => {
            const indexA = rule.matchPromptIds.indexOf(a.id);
            const indexB = rule.matchPromptIds.indexOf(b.id);
            return (indexA !== -1 ? indexA : 999) - (indexB !== -1 ? indexB : 999);
        });
    }
    
    if (rule.noMatchPromptIds) {
        noMatchPrompts.sort((a, b) => {
            const indexA = rule.noMatchPromptIds.indexOf(a.id);
            const indexB = rule.noMatchPromptIds.indexOf(b.id);
            return (indexA !== -1 ? indexA : 999) - (indexB !== -1 ? indexB : 999);
        });
    }

    // Generate list items
    const createListItem = (item) => {
        const searchText = (item.id + " " + item.name).toLowerCase();
        return $(`<li class="apt-sortable-item" data-id="${escapeHtml(item.id)}" data-search="${escapeHtml(searchText)}" title="${escapeHtml(item.id)}">
                    <i class="fa-solid fa-grip-lines" style="margin-right: 8px; color: gray;"></i>
                    <span>${escapeHtml(item.name)}</span>
                  </li>`);
    };

    unselectedPrompts.forEach(p => listUnselected.append(createListItem(p)));
    matchPrompts.forEach(p => listMatch.append(createListItem(p)));
    noMatchPrompts.forEach(p => listNoMatch.append(createListItem(p)));

    // Initialize Drag and Drop using jQuery UI Sortable (Native in SillyTavern)
    if ($.fn.sortable) {
        editorHtml.find('.apt-sortable-list').sortable({
            connectWith: '.apt-sortable-list',
            placeholder: 'apt-sortable-ghost',
            tolerance: 'pointer',
            cursor: 'grabbing',
            // 重要：只允許拖曳「沒有被隱藏」的項目，減少拖曳時的卡頓
            items: 'li:not(.apt-search-hidden)',
            revert: 150,
            start: function(e, ui) {
                ui.placeholder.height(ui.item.height());
            }
        }).disableSelection();
    } else {
        console.warn('[APT] jQuery UI sortable not found. Fallback to click to move.');
        // Basic fallback if sortable is missing
        editorHtml.on('click', '.apt-sortable-item', function() {
            const parentId = $(this).parent().attr('id');
            if (parentId === 'apt_editor_prompt_unselected') {
                listMatch.append(this);
            } else {
                listUnselected.append(this);
            }
        });
    }

    // Search functionality with debounce, applied to all three lists using data-search and CSS classes for extreme performance
    let searchTimeout = null;
    editorHtml.find('#apt_editor_prompt_search').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        
        if (searchTimeout) clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(() => {
            // If empty, quickly remove class from all
            if (!searchTerm) {
                editorHtml.find('.apt-search-hidden').removeClass('apt-search-hidden');
                return;
            }

            editorHtml.find('.apt-sortable-list .apt-sortable-item').each(function() {
                // Use pre-cached lowercase text from data-search attribute
                const text = this.getAttribute('data-search') || "";
                if (text.indexOf(searchTerm) !== -1) {
                    this.classList.remove('apt-search-hidden');
                } else {
                    this.classList.add('apt-search-hidden');
                }
            });

            // 重要：搜尋過濾後，強制重新計算 sortable 的佈局快取，否則拖曳隱藏項目會卡頓
            if ($.fn.sortable) {
                editorHtml.find('.apt-sortable-list').sortable('refresh');
            }

        }, 150); // Reduced debounce time since parsing is now much faster
    });
    
    // Show popup
    // Important: Use a larger popup to accommodate the dual lists
    const popupResult = await callGenericPopup(editorHtml, POPUP_TYPE.CONFIRM, '', { 
        okButton: '儲存', 
        cancelButton: '取消',
        wide: true 
    });
    
    if (popupResult) {
        const newRuleName = editorHtml.find('#apt_editor_rule_name').val().trim();
        const newSource = editorHtml.find('#apt_editor_source').val();
        const newTarget = editorHtml.find('#apt_editor_target').val();
        const newTrigger = editorHtml.find('#apt_editor_trigger').val();
        const newDepth = parseInt(editorHtml.find('#apt_editor_depth').val() || '1', 10);
        
        // Collect checked values directly from the DOM order of the selected lists
        const newMatchPromptIds = [];
        editorHtml.find('#apt_editor_prompt_match .apt-sortable-item').each(function() {
            newMatchPromptIds.push($(this).attr('data-id'));
        });
        
        const newNoMatchPromptIds = [];
        editorHtml.find('#apt_editor_prompt_nomatch .apt-sortable-item').each(function() {
            newNoMatchPromptIds.push($(this).attr('data-id'));
        });
        
        if (newMatchPromptIds.length > 0 || newNoMatchPromptIds.length > 0) {
            const newRule = { 
                name: newRuleName,
                source: newSource,
                target: newTarget,
                trigger: newTrigger, 
                depth: newDepth,
                matchPromptIds: newMatchPromptIds,
                noMatchPromptIds: newNoMatchPromptIds,
                enabled: rule.enabled ?? true
            };
            if (ruleIndex >= 0) {
                rules[ruleIndex] = newRule;
            } else {
                rules.push(newRule);
            }
            if (ruleType === 'global') {
                saveGlobalRules(rules);
            } else {
                savePresetRules();
            }
            renderRulesLists();
        } else {
            toastr.warning('必須至少在一個觸發條件中選擇目標提示詞', 'Auto Prompt Toggler');
        }
    }
}

function renderSingleList(rules, listElementId, ruleType) {
    const list = $(`#${listElementId}`);
    list.empty();

    if (rules.length === 0) {
        list.html(`<div class="apt-no-rules">暫無${ruleType === 'global' ? '全域' : ' Preset '}規則</div>`);
        return;
    }

    let templateContent = $('#auto_prompt_toggler_rule_item_template').html();
    
    rules.forEach((rule, index) => {
        if (typeof rule.enabled === 'undefined') {
            rule.enabled = true;
        }

        const item = $(templateContent);
        item.data('rule', rule);
        item.attr('data-id', index);
        
        item.find('.apt-rule-enable').prop('checked', rule.enabled).on('change', function() {
            rule.enabled = $(this).prop('checked');
            if (ruleType === 'global') saveGlobalRules(rules);
            else savePresetRules();
        });

        let matchNames = [];
        if (rule.matchPromptIds && Array.isArray(rule.matchPromptIds)) {
            matchNames = rule.matchPromptIds.map(id => {
                const prompt = getAvailablePrompts().find(p => p.identifier === id);
                return prompt ? (prompt.name || prompt.identifier) : id;
            });
        }
        
        let noMatchNames = [];
        if (rule.noMatchPromptIds && Array.isArray(rule.noMatchPromptIds)) {
            noMatchNames = rule.noMatchPromptIds.map(id => {
                const prompt = getAvailablePrompts().find(p => p.identifier === id);
                return prompt ? (prompt.name || prompt.identifier) : id;
            });
        }

        let promptDisplay = '';
        const totalCount = matchNames.length + noMatchNames.length;
        if (totalCount > 1) {
            promptDisplay = `控制 ${totalCount} 個提示詞`;
        } else if (matchNames.length === 1) {
            promptDisplay = `(符合) ${matchNames[0]}`;
        } else if (noMatchNames.length === 1) {
            promptDisplay = `(不符) ${noMatchNames[0]}`;
        }

        const sourceText = rule.source === 'raw' ? '[原始] ' : '';
        let targetText = '';
        if (rule.target === 'user_input') targetText = '[User] ';
        else if (rule.target === 'both') targetText = '[兩者] ';
        
        let depthText = '';
        if (rule.depth !== undefined) {
            depthText = rule.depth === 0 ? '[全部訊息] ' : (rule.depth === 1 ? '' : `[前 ${rule.depth} 則] `);
        }
        
        const generatedSummaryText = `${targetText}${sourceText}${depthText}${rule.trigger || '(無觸發條件)'} ➜ ${promptDisplay}`;
        const displayText = rule.name ? rule.name : generatedSummaryText;
        
        item.find('.apt-rule-summary').text(displayText);
        
        let detailsStr = `詳細條件: [${rule.target || 'ai_output'}][${rule.source || 'display'}]${depthText} ${rule.trigger || '(無觸發條件)'}\n`;
        if (matchNames.length > 0) detailsStr += `\n[符合時開啟, 不符時關閉]:\n- ${matchNames.join('\n- ')}`;
        if (noMatchNames.length > 0) detailsStr += `\n\n[不符時開啟, 符合時關閉]:\n- ${noMatchNames.join('\n- ')}`;

        const titleText = rule.name ? `${rule.name}\n\n${detailsStr}` : detailsStr;
        item.find('.apt-rule-summary').attr('title', titleText.trim());
        
        item.find('.rule-edit').on('click', (e) => {
            e.stopPropagation();
            openEditor(ruleType, index);
        });

        item.find('.rule-duplicate').on('click', (e) => {
            e.stopPropagation();
            const newRule = JSON.parse(JSON.stringify(rule));
            rules.splice(index + 1, 0, newRule);
            if (ruleType === 'global') saveGlobalRules(rules);
            else savePresetRules();
            renderRulesLists();
        });
        
        item.find('.rule-delete').on('click', (e) => {
            e.stopPropagation();
            if (confirm(`確定要刪除規則 "${displayText}" 嗎?`)) {
                rules.splice(index, 1);
                if (ruleType === 'global') saveGlobalRules(rules);
                else savePresetRules();
                renderRulesLists();
            }
        });

        item.find('.rule-export').on('click', (e) => {
            e.stopPropagation();
            const json = JSON.stringify([rule], null, 4);
            download(json, `auto_prompt_toggler_${ruleType}_rule_${index}.json`, 'application/json');
        });

        // 根據 ruleType 決定移動按鈕的圖標
        const moveBtn = item.find('.rule-move');
        if (ruleType === 'global') {
            moveBtn.addClass('fa-solid fa-globe');
            moveBtn.attr('title', '移動至 Preset');
        } else {
            moveBtn.addClass('fa-solid fa-sliders');
            moveBtn.attr('title', '移動至全域');
        }

        moveBtn.on('click', (e) => {
            e.stopPropagation();
            const targetType = ruleType === 'global' ? 'Preset' : '全域';
            if (confirm(`確定要將此規則移動到 ${targetType} 嗎?`)) {
                if (ruleType === 'global') {
                    // Global -> Preset
                    currentPresetRules.push(rule);
                    rules.splice(index, 1);
                    saveGlobalRules(rules);
                    savePresetRules();
                } else {
                    // Preset -> Global
                    const globalRules = getGlobalRules();
                    globalRules.push(rule);
                    rules.splice(index, 1);
                    saveGlobalRules(globalRules);
                    savePresetRules();
                }
                renderRulesLists();
                toastr.success(`已移動至 ${targetType}`);
            }
        });
        
        list.append(item);
    });
}

function renderGlobalProfileSelect() {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    const select = $('#apt_global_profile_select');
    
    select.empty();
    Object.keys(profiles).forEach(name => {
        select.append($('<option>', {
            value: name,
            text: name,
            selected: name === current
        }));
    });
}

function renderRulesLists() {
    renderSingleList(getGlobalRules(), 'apt_global_rules_list', 'global');
    renderSingleList(currentPresetRules, 'apt_preset_rules_list', 'preset');
}

function debouncedProcessText(recentMessages) {
    if (processTimeout) clearTimeout(processTimeout);
    processTimeout = setTimeout(() => {
        processText(recentMessages);
    }, 200);
}

function processText(recentMessages) {
    const allRules = [
        ...getGlobalRules().map((r, i) => ({...r, id: `global_${i}`})),
        ...currentPresetRules.map((r, i) => ({...r, id: `preset_${i}`}))
    ];
    let changed = false;

    allRules.forEach((rule) => {
        const ruleId = rule.id;
        if (rule.enabled === false) return;
        if (!rule.trigger) return; // trigger must exist
        
        // Fallback for old rule structure
        const matchIds = rule.matchPromptIds || rule.promptIds || [rule.promptId].filter(Boolean);
        const noMatchIds = rule.noMatchPromptIds || [];
        
        if (matchIds.length === 0 && noMatchIds.length === 0) return;

        // Determine how many messages to check based on rule depth
        const depth = rule.depth !== undefined ? rule.depth : 1;
        
        // Filter messages based on depth
        let messagesToCheck = recentMessages;
        if (depth > 0) {
            messagesToCheck = recentMessages.slice(-depth);
        } // if depth is 0, check all recentMessages
        
        // Check if any message in the depth range matches
        let isMatch = false;
        const target = rule.target || 'ai_output';

        for (const msg of messagesToCheck) {
            // Strict matching based on target setting
            if (target === 'ai_output' && msg.type !== 'ai') continue;
            if (target === 'user_input' && msg.type !== 'user') continue;
            // 'both' targets AI and User, but usually excludes System
            if (target === 'both' && (msg.type !== 'ai' && msg.type !== 'user')) continue;

            const textToUse = (rule.source === 'raw') ? (msg.rawText || '') : msg.displayText;
            try {
                const regex = new RegExp(rule.trigger, 'i');
                if (regex.test(textToUse)) {
                    isMatch = true;
                    break; // Found a match, no need to check older messages for this rule
                }
            } catch (e) {
                console.error('[AutoPromptToggler] Error processing regex:', e);
            }
        }

        try {
            if (!promptManager) return;
            
            // Core Logic for new structure:
            // If match: turn ON matchIds, turn OFF noMatchIds
            // If NOT match: turn OFF matchIds, turn ON noMatchIds

            // Execute State Changes
            const applyChanges = (ids, targetState) => {
                ids.forEach(pId => {
                    const entry = promptManager.getPromptOrderEntry(promptManager.activeCharacter, pId);
                    if (entry) {
                        if (entry.enabled !== targetState) {
                            entry.enabled = targetState;
                            changed = true;
                            
                            if (getNotificationsEnabled() && targetState === true) {
                                const prompt = promptManager.getPromptById(pId);
                                toastr.info(`開啟提示詞: ${prompt.name}`, 'Auto Prompt Toggler');
                            }
                        }
                    }
                });
            };

            if (isMatch) {
                applyChanges(matchIds, true);
                applyChanges(noMatchIds, false);
            } else {
                applyChanges(matchIds, false);
                applyChanges(noMatchIds, true);
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

function extractMessageData(msgDiv, chatMsg) {
    let isUser = false;
    let isSystem = false;
    let rawText = '';

    if (chatMsg) {
        isUser = chatMsg.is_user;
        isSystem = chatMsg.is_system;
        rawText = chatMsg.mes || '';
        if (chatMsg.mes_reasoning) {
            rawText = chatMsg.mes_reasoning + '\n' + rawText;
        }
    } else if (msgDiv) {
        // Fallback to DOM if chat array is not available
        isUser = msgDiv.classList.contains('is_user');
        isSystem = msgDiv.getAttribute('is_system') === 'true';
    }

    let type = 'ai';
    if (isUser) type = 'user';
    else if (isSystem) type = 'system';

    let displayText = '';
    if (msgDiv) {
        const textDiv = msgDiv.querySelector('.mes_text');
        const reasoningDiv = msgDiv.querySelector('.mes_reasoning');
        if (reasoningDiv) {
            displayText += (reasoningDiv.textContent || reasoningDiv.innerText) + '\n';
        }
        if (textDiv) {
            displayText += textDiv.textContent || textDiv.innerText;
        }
    }

    return { type, rawText, displayText };
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
        
        const msgIndex = messages.length - 1;
        const currentMsgId = `msg-${msgIndex}`;

        const recentMessages = [];
        
        const allRules = [
            ...getGlobalRules(),
            ...currentPresetRules
        ];
        
        let maxDepth = 1;
        let checkAll = false;
        
        for (const rule of allRules) {
            if (rule.depth === 0) checkAll = true;
            if (rule.depth > maxDepth) maxDepth = rule.depth;
        }
        
        const countToProcess = checkAll ? messages.length : Math.min(messages.length, maxDepth);
        
        for (let i = messages.length - countToProcess; i < messages.length; i++) {
            const msgDiv = messages[i];
            const chatMsg = (typeof chat !== 'undefined' && Array.isArray(chat) && i < chat.length) ? chat[i] : null;
            const msgData = extractMessageData(msgDiv, chatMsg);
            recentMessages.push(msgData);
        }

        if (currentMsgId !== lastMessageId) {
            lastMessageId = currentMsgId;
            triggeredRules.clear();
        }

        debouncedProcessText(recentMessages);
    });

    chatObserver.observe(chatContainer, { 
        childList: true, 
        subtree: true, 
        characterData: true 
    });
    
    console.log("[AutoPromptToggler] Chat observer initialized.");
}

function updatePresetState() {
    const presetMgr = getPresetManager();
    if (!presetMgr) {
        currentPresetRules = [];
        renderRulesLists();
        return;
    }
    
    currentPresetName = presetMgr.getSelectedPresetName();
    if (!currentPresetName) {
        currentPresetRules = [];
        renderRulesLists();
        return;
    }
    
    let aptExt = null;
    try {
        aptExt = presetMgr.readPresetExtensionField({
            name: currentPresetName,
            path: 'auto_prompt_toggler',
        });
    } catch (e) {
        console.warn('[APT] Could not read preset extension field:', e);
    }
    
    if (!aptExt) {
        currentPresetRules = [];
        renderRulesLists();
        forceRecheck();
        return;
    }

    // Migration 1: Handle old OAI Presets where auto_prompt_toggler was directly an array of rules
    if (Array.isArray(aptExt)) {
        aptExt = { rules: aptExt };
        console.log('[APT] Migrated legacy array-based preset rules to object format.');
        presetMgr.writePresetExtensionField({
            name: currentPresetName,
            path: 'auto_prompt_toggler',
            value: aptExt,
        });
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
            presetMgr.writePresetExtensionField({
                name: currentPresetName,
                path: 'auto_prompt_toggler',
                value: aptExt,
            });
        } else {
            // It's an object but no recognizable rules array could be extracted
            aptExt.rules = [];
        }
    }
    
    currentPresetRules = aptExt.rules || [];
    renderRulesLists();
    forceRecheck();
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
            
            if (rulesToImport.length > 0) {
                // Sanitize and ensure enabled property
                rulesToImport.forEach(r => {
                    if (typeof r.enabled === 'undefined') r.enabled = true;
                });
                
                if (ruleType === 'global') {
                    const currentRules = getGlobalRules();
                    saveGlobalRules([...currentRules, ...rulesToImport]);
                } else {
                    currentPresetRules = [...currentPresetRules, ...rulesToImport];
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
        extension_settings[SETTINGS_KEY_GLOBAL] = [];
    }

    const settingsHtml = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'settings');
    $('#extensions_settings').append(settingsHtml);

    // Notifications Init
    $('#apt_enable_notifications').prop('checked', getNotificationsEnabled()).on('change', function() {
        setNotificationsEnabled($(this).prop('checked'));
    });

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
        
        const result = await callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, '', { okButton: '建立', cancelButton: '取消' });
        
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

        const result = await callGenericPopup(popupContent, POPUP_TYPE.CONFIRM, '', { okButton: '儲存', cancelButton: '取消' });
        
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
            { okButton: '刪除', cancelButton: '取消' }
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
        download(json, `auto_prompt_toggler_global_${currentProfile}.json`, 'application/json');
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
            { okButton: '清空', cancelButton: '取消' }
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
        const json = JSON.stringify(currentPresetRules, null, 4);
        download(json, `auto_prompt_toggler_preset_${currentPresetName}.json`, 'application/json');
    });
    $(document).on('click.apt_preset', '#apt_preset_import', () => {
        $('#apt_import_file_input').off('change'); // Remove previous handlers
        handleImportEvent('apt_import_file_input', 'preset');
        $('#apt_import_file_input').trigger('click');
    });
    $(document).on('click.apt_preset', '#apt_preset_clear', async () => {
        const confirmResult = await callGenericPopup(
            `確定要清空當前 Preset <strong>${escapeHtml(currentPresetName)}</strong> 的所有規則嗎?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: '清空', cancelButton: '取消' }
        );
        if (confirmResult) {
            currentPresetRules = [];
            savePresetRules();
            renderRulesLists();
            toastr.info('已清空 Preset 規則', 'Auto Prompt Toggler');
        }
    });

    // Global Profile Management Setup
    renderGlobalProfileSelect();

    // Init Initial State
    updatePresetState();

    // Hook into Preset events for sync
    if (typeof eventSource !== 'undefined') {
        eventSource.on(event_types.MAIN_API_CHANGED, () => {
            updatePresetState();
        });
        
        eventSource.on(event_types.PRESET_CHANGED, () => {
            updatePresetState();
        });
        
        // 整合至聊天補全預設設定檔 (OAI Preset) 的匯入偵測
        // 註: 目前 SillyTavern 只有針對 OpenAI API 提供 IMPORT_READY 攔截點
        eventSource.on(event_types.OAI_PRESET_IMPORT_READY, async (result) => {
            // result is { data: object; presetName: string }
            if (result && result.data && result.data.extensions && result.data.extensions.auto_prompt_toggler) {
                let aptData = result.data.extensions.auto_prompt_toggler;
                let importedRules = [];
                
                if (Array.isArray(aptData)) {
                    importedRules = aptData;
                } else if (aptData && aptData.rules && Array.isArray(aptData.rules)) {
                    importedRules = aptData.rules;
                } else if (aptData && typeof aptData === 'object') {
                    // Extract from old profile dictionary
                    for (const profileRules of Object.values(aptData)) {
                        if (Array.isArray(profileRules)) {
                            importedRules = importedRules.concat(profileRules);
                        }
                    }
                }
                
                if (importedRules.length > 0) {
                    const presetName = result.presetName || 'Imported Preset';
                    
                    // 彈出確認視窗，讓使用者知道裡面有規則並詢問是否保留
                    const htmlMessage = `
                        <h3>此預設檔 (Preset) 包含 APT 規則。</h3>
                        <p>您是否要將這些規則匯入並綁定至 <strong>${escapeHtml(presetName)}</strong>？</p>
                        <p style="font-size: 0.8em; color: gray;">如果您選擇取消，預設檔仍會匯入，但 APT 規則將會被捨棄。</p>
                    `;
                    
                    const confirmResult = await callGenericPopup(htmlMessage, POPUP_TYPE.CONFIRM, '', { 
                        okButton: '保留規則', 
                        cancelButton: '捨棄規則' 
                    });
                    
                    if (confirmResult) {
                        // 標準化為新格式，確保 SillyTavern 存檔時是正確的格式
                        result.data.extensions.auto_prompt_toggler = { rules: importedRules };
                        toastr.success(`已從預設檔匯入 ${importedRules.length} 條 APT 規則`, 'Auto Prompt Toggler');
                    } else {
                        // 使用者選擇捨棄，我們將資料從 result.data 移除，這樣存檔時就不會有規則
                        delete result.data.extensions.auto_prompt_toggler;
                        toastr.info('已捨棄預設檔附帶的 APT 規則', 'Auto Prompt Toggler');
                    }
                } else {
                    // 若規則解析失敗或為 0 條，清除殘留
                    delete result.data.extensions.auto_prompt_toggler;
                }
            }
        });
    }

    initObserver();
});
