import { renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { download, escapeHtml } from '../../../utils.js';
import { t, fmt, applyLanguageToSettings, localizeEditor } from './i18n.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { normalizeTriggerList } from './rules-engine.js';

let isChatCompletionApiActive = null;
let getGlobalRules = null;
let getCurrentPresetRules = null;
let getGlobalProfiles = null;
let getCurrentGlobalProfileName = null;
let saveGlobalRules = null;
let savePresetRules = null;
let getAllRulesWithMeta = null;
let getRulePromptIds = null;
let getRuleConditionSummary = null;
let getRuleTriggerMode = null;
let getRuleIncludeTriggers = null;
let getRuleExcludeTriggers = null;
let getLastRuleDebugState = null;

function initUi(deps) {
    isChatCompletionApiActive = deps && typeof deps.isChatCompletionApiActive === "function" ? deps.isChatCompletionApiActive : null;
    getGlobalRules = deps && typeof deps.getGlobalRules === "function" ? deps.getGlobalRules : null;
    getCurrentPresetRules = deps && typeof deps.getCurrentPresetRules === "function" ? deps.getCurrentPresetRules : null;
    getGlobalProfiles = deps && typeof deps.getGlobalProfiles === "function" ? deps.getGlobalProfiles : null;
    getCurrentGlobalProfileName = deps && typeof deps.getCurrentGlobalProfileName === "function" ? deps.getCurrentGlobalProfileName : null;
    saveGlobalRules = deps && typeof deps.saveGlobalRules === "function" ? deps.saveGlobalRules : null;
    savePresetRules = deps && typeof deps.savePresetRules === "function" ? deps.savePresetRules : null;
    getAllRulesWithMeta = deps && typeof deps.getAllRulesWithMeta === "function" ? deps.getAllRulesWithMeta : null;
    getRulePromptIds = deps && typeof deps.getRulePromptIds === "function" ? deps.getRulePromptIds : null;
    getRuleConditionSummary = deps && typeof deps.getRuleConditionSummary === "function" ? deps.getRuleConditionSummary : null;
    getRuleTriggerMode = deps && typeof deps.getRuleTriggerMode === "function" ? deps.getRuleTriggerMode : null;
    getRuleIncludeTriggers = deps && typeof deps.getRuleIncludeTriggers === "function" ? deps.getRuleIncludeTriggers : null;
    getRuleExcludeTriggers = deps && typeof deps.getRuleExcludeTriggers === "function" ? deps.getRuleExcludeTriggers : null;
    getLastRuleDebugState = deps && typeof deps.getLastRuleDebugState === "function" ? deps.getLastRuleDebugState : null;
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
    
    if (!activeOrder || !Array.isArray(activeOrder) || activeOrder.length === 0) {
        const prompts = promptManager?.serviceSettings?.prompts;
        return Array.isArray(prompts) ? prompts.filter(p => p && p.identifier) : [];
    }
    
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

function collectControlledPromptRows() {
    const promptsById = new Map(getAvailablePrompts().map(prompt => [prompt.identifier, prompt]));
    const rowsByPromptId = new Map();

    for (const meta of getAllRulesWithMeta()) {
        const { rule } = meta;
        const { matchIds, noMatchIds } = getRulePromptIds(rule);
        const ruleName = rule.name || getRuleConditionSummary(rule);
        const append = (promptId, behavior) => {
            if (!promptId) return;
            const prompt = promptsById.get(promptId) || promptManager?.getPromptById?.(promptId) || { identifier: promptId, name: promptId };
            if (!rowsByPromptId.has(promptId)) {
                rowsByPromptId.set(promptId, {
                    promptId,
                    promptName: prompt?.name || promptId,
                    controls: [],
                });
            }
            rowsByPromptId.get(promptId).controls.push({
                scopeLabel: meta.scopeLabel,
                ruleName,
                behavior,
                enabled: rule.enabled !== false,
            });
        };

        matchIds.forEach(promptId => append(promptId, t('match_header')));
        noMatchIds.forEach(promptId => append(promptId, t('nomatch_header')));
    }

    return [...rowsByPromptId.values()].sort((a, b) => a.promptName.localeCompare(b.promptName));
}

function renderControlledPromptSearch() {
    const container = $('#apt_controlled_prompt_results');
    if (!container.length) return;

    const searchTerm = String($('#apt_controlled_prompt_search').val() || '').trim().toLowerCase();
    const rows = collectControlledPromptRows().filter(row => {
        if (!searchTerm) return true;
        const haystack = [
            row.promptId,
            row.promptName,
            ...row.controls.flatMap(control => [control.scopeLabel, control.ruleName, control.behavior]),
        ].join(' ').toLowerCase();
        return haystack.includes(searchTerm);
    });

    container.empty();
    if (rows.length === 0) {
        container.append(`<div class="apt-no-rules">${escapeHtml(t('controlled_search_empty'))}</div>`);
        return;
    }

    for (const row of rows) {
        const controlsHtml = row.controls.map(control => `
            <div class="apt-controlled-control ${control.enabled ? '' : 'apt-controlled-disabled'}">
                <span class="apt-controlled-scope">${escapeHtml(control.scopeLabel)}</span>
                <span>${escapeHtml(control.ruleName)}</span>
                <span class="apt-controlled-behavior">${escapeHtml(control.behavior)}</span>
                ${control.enabled ? '' : '<span class="apt-controlled-off">OFF</span>'}
            </div>
        `).join('');

        container.append(`
            <div class="apt-controlled-row">
                <div class="apt-controlled-title" title="${escapeHtml(row.promptId)}">${escapeHtml(row.promptName)}</div>
                <div class="apt-controlled-id">${escapeHtml(row.promptId)}</div>
                <div class="apt-controlled-controls"><strong>${escapeHtml(t('controlled_by'))}:</strong>${controlsHtml}</div>
            </div>
        `);
    }
}

function getRuleDebugStatusClass(record) {
    if (record.invalid) return 'apt-rule-debug-invalid';
    return record.matched ? 'apt-rule-debug-match' : 'apt-rule-debug-nomatch';
}

function renderRuleDebugStatus() {
    const panel = $('#apt_rule_debug_panel');
    if (!panel.length) return;

    panel.empty();
    if (!getLastRuleDebugState()) {
        panel.append(`<div class="apt-rule-debug-empty">${escapeHtml(t('debug_empty'))}</div>`);
        return;
    }

    const state = getLastRuleDebugState();
    panel.append(`
        <div class="apt-rule-debug-meta">
            <div><strong>${t('debug_checked_at')}</strong>${escapeHtml(state.checkedAt || '')}</div>
            <div>${escapeHtml(fmt(t('debug_meta_line'), Number(state.messageCount || 0), Number(state.evaluatedCount || 0), Number(state.matchedCount || 0), Number(state.changedCount || 0)))}</div>
            ${state.note ? `<div>${escapeHtml(state.note)}</div>` : ''}
        </div>
    `);

    const matchedRules = (state.rules || []).filter(record => record.matched || record.invalid);
    panel.append(`<div class="apt-rule-debug-section"><strong>${escapeHtml(t('debug_match_section'))}</strong></div>`);
    if (matchedRules.length === 0) {
        panel.append(`<div class="apt-rule-debug-empty">${escapeHtml(t('debug_no_match'))}</div>`);
    } else {
        matchedRules.forEach(record => {
            const statusText = record.invalid ? t('debug_invalid_status') : t('debug_matched_status');
            panel.append(`
                <div class="apt-rule-debug-row ${getRuleDebugStatusClass(record)}">
                    <div><strong>${escapeHtml(statusText)}</strong>｜${escapeHtml(record.scopeLabel)}｜${escapeHtml(record.ruleName)}</div>
                    <div class="apt-rule-debug-small">${t('debug_condition')}${escapeHtml(record.conditionSummary)}</div>
                    ${record.matchedText ? `<div class="apt-rule-debug-small">${escapeHtml(t('debug_matched_text'))}${escapeHtml(record.matchedText)}</div>` : ''}
                </div>
            `);
        });
    }

    panel.append(`<div class="apt-rule-debug-section"><strong>${escapeHtml(t('debug_prompt_section'))}</strong></div>`);
    const actions = state.promptActions || [];
    if (actions.length === 0) {
        panel.append(`<div class="apt-rule-debug-empty">${escapeHtml(t('debug_no_prompt_actions'))}</div>`);
    } else {
        actions.forEach(action => {
            const stateClass = action.targetState ? 'apt-rule-debug-prompt-on' : 'apt-rule-debug-prompt-off';
            const stateText = action.targetState ? 'ON' : 'OFF';
            const changedText = action.changed ? t('debug_changed') : t('debug_already_state');
            panel.append(`
                <div class="apt-rule-debug-row">
                    <div><span class="${stateClass}">${stateText}</span>｜${escapeHtml(action.promptName)} <span class="apt-rule-debug-small">(${escapeHtml(action.promptId)})</span></div>
                    <div class="apt-rule-debug-small">${escapeHtml(changedText)}${escapeHtml(t('debug_source'))}${escapeHtml(action.sourceRule || '')}</div>
                </div>
            `);
        });
    }
}

async function openEditor(ruleType = 'global', ruleIndex = -1) {
    if (!isChatCompletionApiActive()) {
        toastr.warning(t('editor_only_cc_warning'), 'Auto Prompt Toggler');
        return;
    }

    const rules = ruleType === 'global' ? getGlobalRules() : getCurrentPresetRules();
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
    localizeEditor(editorHtml);
    
    // Populate editor fields
    editorHtml.find('#apt_editor_rule_name').val(rule.name || '');
    editorHtml.find('#apt_editor_source').val(rule.source || 'display');
    editorHtml.find('#apt_editor_target').val(rule.target || 'ai_output');
    editorHtml.find('#apt_editor_trigger_mode').val(getRuleTriggerMode(rule));
    editorHtml.find('#apt_editor_trigger').val(getRuleIncludeTriggers(rule).join('\n'));
    editorHtml.find('#apt_editor_exclude_trigger').val(getRuleExcludeTriggers(rule).join('\n'));
    editorHtml.find('#apt_editor_depth').val(rule.depth !== undefined ? rule.depth : 1);
    
    const listUnselected = editorHtml.find('#apt_editor_prompt_unselected');
    const listMatch = editorHtml.find('#apt_editor_prompt_match');
    const listNoMatch = editorHtml.find('#apt_editor_prompt_nomatch');
    const prompts = getAvailablePrompts();

    const charId = promptManager?.activeCharacter?.id ?? 'unknown';
    console.log(`[APT] Editor opened. Active Character ID: ${charId}. Found ${prompts.length} prompts.`);
    
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
        okButton: t('save'), 
        cancelButton: t('cancel'),
        wide: true 
    });
    
    if (popupResult) {
        const newRuleName = editorHtml.find('#apt_editor_rule_name').val().trim();
        const newSource = editorHtml.find('#apt_editor_source').val();
        const newTarget = editorHtml.find('#apt_editor_target').val();
        const newTriggerMode = editorHtml.find('#apt_editor_trigger_mode').val() === 'all' ? 'all' : 'any';
        const newTriggers = normalizeTriggerList(editorHtml.find('#apt_editor_trigger').val());
        const newExcludeTriggers = normalizeTriggerList(editorHtml.find('#apt_editor_exclude_trigger').val());
        const parsedDepth = parseInt(editorHtml.find('#apt_editor_depth').val() || '1', 10);
        const newDepth = Number.isFinite(parsedDepth) && parsedDepth >= 0 ? parsedDepth : 1;
        
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
                triggerMode: newTriggerMode,
                triggers: newTriggers,
                trigger: newTriggers.join('\n'),
                excludeTriggers: newExcludeTriggers,
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
            toastr.warning(t('editor_no_target_warning'), 'Auto Prompt Toggler');
        }
    }
}

function renderSingleList(rules, listElementId, ruleType) {
    const list = $(`#${listElementId}`);
    list.empty();
    const promptsById = new Map(getAvailablePrompts().map(prompt => [prompt.identifier, prompt]));

    if (rules.length === 0) {
        list.html(`<div class="apt-no-rules">${ruleType === 'global' ? t('no_global_rules') : t('no_preset_rules')}</div>`);
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
                const prompt = promptsById.get(id);
                return prompt ? (prompt.name || prompt.identifier) : id;
            });
        }
        
        let noMatchNames = [];
        if (rule.noMatchPromptIds && Array.isArray(rule.noMatchPromptIds)) {
            noMatchNames = rule.noMatchPromptIds.map(id => {
                const prompt = promptsById.get(id);
                return prompt ? (prompt.name || prompt.identifier) : id;
            });
        }

        let promptDisplay = '';
        const totalCount = matchNames.length + noMatchNames.length;
        if (totalCount > 1) {
            promptDisplay = fmt(t('summary_controls_n'), totalCount);
        } else if (matchNames.length === 1) {
            promptDisplay = fmt(t('summary_match_one'), matchNames[0]);
        } else if (noMatchNames.length === 1) {
            promptDisplay = fmt(t('summary_nomatch_one'), noMatchNames[0]);
        }

        const sourceText = rule.source === 'raw' ? t('tag_raw') : '';
        let targetText = '';
        if (rule.target === 'user_input') targetText = '[User] ';
        else if (rule.target === 'both') targetText = t('tag_both');
        
        let depthText = '';
        if (rule.depth !== undefined) {
            depthText = rule.depth === 0 ? t('tag_all_messages') : (rule.depth === 1 ? '' : fmt(t('tag_recent_n'), rule.depth));
        }
        
        const conditionSummary = getRuleConditionSummary(rule);
        const generatedSummaryText = `${targetText}${sourceText}${depthText}${conditionSummary} ➜ ${promptDisplay}`;
        const displayText = rule.name ? rule.name : generatedSummaryText;
        
        item.find('.apt-rule-summary').text(displayText);
        
        let detailsStr = `${t('details_header')}[${rule.target || 'ai_output'}][${rule.source || 'display'}]${depthText} ${conditionSummary}\n`;
        if (matchNames.length > 0) detailsStr += `\n${t('details_match')}\n- ${matchNames.join('\n- ')}`;
        if (noMatchNames.length > 0) detailsStr += `\n\n${t('details_nomatch')}\n- ${noMatchNames.join('\n- ')}`;

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
            if (confirm(fmt(t('confirm_delete_rule'), displayText))) {
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
            moveBtn.attr('title', t('move_to_preset'));
        } else {
            moveBtn.addClass('fa-solid fa-sliders');
            moveBtn.attr('title', t('move_to_global'));
        }

        moveBtn.on('click', (e) => {
            e.stopPropagation();
            const targetType = ruleType === 'global' ? 'Preset' : t('scope_global');
            if (confirm(fmt(t('confirm_move_rule'), targetType))) {
                if (ruleType === 'global') {
                    // Global -> Preset
                    getCurrentPresetRules().push(rule);
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
                toastr.success(fmt(t('moved_toast'), targetType));
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
    renderSingleList(getCurrentPresetRules(), 'apt_preset_rules_list', 'preset');
    renderControlledPromptSearch();
    renderRuleDebugStatus();
    applyLanguageToSettings();
}

export {
    initUi,
    openEditor,
    renderRulesLists,
    renderGlobalProfileSelect,
    renderControlledPromptSearch,
    renderRuleDebugStatus,
};
