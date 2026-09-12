import { chat } from '../../../../script.js';
import { promptManager } from '../../../openai.js';
import { getNeedsDelayAfterInjection, resetNeedsDelayAfterInjection } from './llm-injector.js';
import { t, fmt } from './i18n.js';

let processTimeout = null;
let lastRuleDebugState = null;
const regexCache = new Map();
const invalidRegexWarnings = new Set();

let isChatCompletionApiActive = null;
let getGlobalRules = null;
let getCurrentGlobalProfileName = null;
let getCurrentPresetName = null;
let getCurrentPresetRules = null;
let getNotificationsEnabled = null;
let renderRuleDebugStatus = null;

function initRulesEngine(deps) {
    isChatCompletionApiActive = deps && typeof deps.isChatCompletionApiActive === "function" ? deps.isChatCompletionApiActive : null;
    getGlobalRules = deps && typeof deps.getGlobalRules === "function" ? deps.getGlobalRules : null;
    getCurrentGlobalProfileName = deps && typeof deps.getCurrentGlobalProfileName === "function" ? deps.getCurrentGlobalProfileName : null;
    getCurrentPresetName = deps && typeof deps.getCurrentPresetName === "function" ? deps.getCurrentPresetName : null;
    getCurrentPresetRules = deps && typeof deps.getCurrentPresetRules === "function" ? deps.getCurrentPresetRules : null;
    getNotificationsEnabled = deps && typeof deps.getNotificationsEnabled === "function" ? deps.getNotificationsEnabled : null;
    renderRuleDebugStatus = deps && typeof deps.renderRuleDebugStatus === "function" ? deps.renderRuleDebugStatus : null;
}

function forceRecheck() {
    debouncedProcessText();
}

function getMessagesByMesId() {
    const chatContainer = document.querySelector('#chat');
    const messages = chatContainer ? Array.from(chatContainer.querySelectorAll('.mes')) : [];
    const byMesId = new Map();

    messages.forEach((msgDiv, domIndex) => {
        const mesId = Number(msgDiv?.getAttribute?.('mesid'));
        if (Number.isInteger(mesId) && mesId >= 0) {
            byMesId.set(mesId, msgDiv);
        } else {
            byMesId.set(`dom-${domIndex}`, msgDiv);
        }
    });

    return { messages, byMesId };
}

function getChatMessageForElement(msgDiv, fallbackIndex = -1) {
    if (typeof chat === 'undefined' || !Array.isArray(chat)) return null;

    const mesId = Number(msgDiv?.getAttribute?.('mesid'));
    if (Number.isInteger(mesId) && mesId >= 0 && mesId < chat.length) {
        return chat[mesId];
    }

    return fallbackIndex >= 0 && fallbackIndex < chat.length ? chat[fallbackIndex] : null;
}

function getRuleDepthRange(allRules) {
    let maxDepth = 1;
    let checkAll = false;

    for (const rule of allRules) {
        if (rule?.enabled === false) continue;

        const depth = Number.parseInt(rule?.depth, 10);
        if (depth === 0) {
            checkAll = true;
        } else if (Number.isFinite(depth) && depth > maxDepth) {
            maxDepth = depth;
        }
    }

    return { maxDepth, checkAll };
}

function collectRecentMessagesForRules(allRules) {
    const { maxDepth, checkAll } = getRuleDepthRange(allRules);
    const { messages, byMesId } = getMessagesByMesId();
    const recentMessages = [];

    // Prefer SillyTavern's authoritative chat array. DOM may be virtualized and only contain
    // the visible tail, so using DOM length/index can miss older messages or map to chat[0..n].
    if (typeof chat !== 'undefined' && Array.isArray(chat) && chat.length > 0) {
        const countToProcess = checkAll ? chat.length : Math.min(chat.length, maxDepth);
        const startIndex = chat.length - countToProcess;

        for (let chatIndex = startIndex; chatIndex < chat.length; chatIndex++) {
            const chatMsg = chat[chatIndex];
            const msgDiv = byMesId.get(chatIndex) || null;
            recentMessages.push(extractMessageData(msgDiv, chatMsg));
        }

        return recentMessages;
    }

    // Fallback for contexts where chat is unavailable: use currently rendered DOM messages.
    const countToProcess = checkAll ? messages.length : Math.min(messages.length, maxDepth);
    for (let i = messages.length - countToProcess; i < messages.length; i++) {
        const msgDiv = messages[i];
        const chatMsg = getChatMessageForElement(msgDiv, i);
        recentMessages.push(extractMessageData(msgDiv, chatMsg));
    }

    return recentMessages;
}

function clearRuleCaches() {
    regexCache.clear();
    invalidRegexWarnings.clear();
}

function getCompiledRegex(trigger, ruleId, flags = 'i') {
    const cacheKey = `${flags}\u0000${trigger}`;
    const warningKey = `${ruleId}\u0000${trigger}`;
    if (regexCache.has(cacheKey)) {
        return regexCache.get(cacheKey);
    }

    try {
        const regex = new RegExp(trigger, flags);
        regexCache.set(cacheKey, regex);
        return regex;
    } catch (e) {
        if (!invalidRegexWarnings.has(warningKey)) {
            invalidRegexWarnings.add(warningKey);
            console.error(`[AutoPromptToggler] Invalid regex in rule ${ruleId}:`, trigger, e);
            toastr?.error?.(fmt(t('regex_invalid_skipped'), ruleId), 'Auto Prompt Toggler');
        }
        regexCache.set(cacheKey, null);
        return null;
    }
}

function normalizeTriggerList(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item ?? '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    }
    return [];
}

function getRuleIncludeTriggers(rule) {
    const triggers = normalizeTriggerList(rule.triggers);
    if (triggers.length > 0) return triggers;
    return normalizeTriggerList(rule.trigger);
}

function getRuleExcludeTriggers(rule) {
    return normalizeTriggerList(rule.excludeTriggers);
}

function getRuleTriggerMode(rule) {
    return rule.triggerMode === 'all' ? 'all' : 'any';
}

function testRegexList(triggers, text, ruleId) {
    for (const trigger of triggers) {
        const regex = getCompiledRegex(trigger, ruleId);
        if (!regex) return null;
        regex.lastIndex = 0;
        if (!regex.test(text)) return false;
    }
    return true;
}

function doesMessageMatchRuleText(rule, textToUse, ruleId) {
    const includeTriggers = getRuleIncludeTriggers(rule);
    if (includeTriggers.length === 0) return false;

    const excludeTriggers = getRuleExcludeTriggers(rule);
    for (const excludeTrigger of excludeTriggers) {
        const regex = getCompiledRegex(excludeTrigger, `${ruleId}_exclude`);
        if (!regex) return null;
        regex.lastIndex = 0;
        if (regex.test(textToUse)) return false;
    }

    if (getRuleTriggerMode(rule) === 'all') {
        return testRegexList(includeTriggers, textToUse, ruleId);
    }

    for (const trigger of includeTriggers) {
        const regex = getCompiledRegex(trigger, ruleId);
        if (!regex) return null;
        regex.lastIndex = 0;
        if (regex.test(textToUse)) return true;
    }

    return false;
}

function getRuleConditionSummary(rule) {
    const includeTriggers = getRuleIncludeTriggers(rule);
    const excludeTriggers = getRuleExcludeTriggers(rule);
    const modeText = getRuleTriggerMode(rule) === 'all' ? 'AND' : 'OR';
    let summary = includeTriggers.length > 0 ? includeTriggers.join(` ${modeText} `) : t('no_trigger_condition');
    if (excludeTriggers.length > 0) {
        summary += ` / NOT (${excludeTriggers.join(' OR ')})`;
    }
    return summary;
}

function normalizeImportedRule(rule) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;

    const normalized = { ...rule };
    if (typeof normalized.enabled === 'undefined') normalized.enabled = true;
    normalized.enabled = normalized.enabled !== false;

    if (normalized.promptId && !Array.isArray(normalized.promptIds)) {
        normalized.promptIds = [normalized.promptId];
    }
    if (!Array.isArray(normalized.matchPromptIds) && Array.isArray(normalized.promptIds)) {
        normalized.matchPromptIds = [...normalized.promptIds];
    }

    normalized.matchPromptIds = Array.isArray(normalized.matchPromptIds)
        ? normalized.matchPromptIds.filter(id => typeof id === 'string' && id.trim())
        : [];
    normalized.noMatchPromptIds = Array.isArray(normalized.noMatchPromptIds)
        ? normalized.noMatchPromptIds.filter(id => typeof id === 'string' && id.trim())
        : [];

    if (normalized.matchPromptIds.length === 0 && normalized.noMatchPromptIds.length === 0) return null;

    normalized.name = typeof normalized.name === 'string' ? normalized.name : '';
    normalized.source = normalized.source === 'raw' ? 'raw' : 'display';
    normalized.target = ['ai_output', 'user_input', 'both'].includes(normalized.target) ? normalized.target : 'ai_output';
    if (Array.isArray(normalized.triggers)) {
        normalized.triggers = normalizeTriggerList(normalized.triggers);
    } else if (typeof normalized.trigger === 'string') {
        normalized.triggers = normalizeTriggerList(normalized.trigger);
    } else {
        normalized.triggers = [];
    }
    normalized.trigger = normalized.triggers.join('\n');
    normalized.triggerMode = normalized.triggerMode === 'all' ? 'all' : 'any';
    normalized.excludeTriggers = normalizeTriggerList(normalized.excludeTriggers);

    const depth = Number.parseInt(normalized.depth, 10);
    normalized.depth = Number.isFinite(depth) && depth >= 0 ? depth : 1;

    delete normalized.promptId;
    delete normalized.promptIds;
    return normalized;
}

// 立即(同步)執行規則判定並套用提示詞開關。
// 用於 MESSAGE_SENT：此時新訊息已 push 進 chat 陣列 (sendMessageAsUser 在 emit 前先 push)，

// 立即(同步)執行規則判定並套用提示詞開關。
// 用於 MESSAGE_SENT：此時新訊息已 push 進 chat 陣列 (sendMessageAsUser 在 emit 前先 push)，
// 因此可以保證「先觸發正則打開開關 → 再生成正文」的順序，不再與生成流程賽跑。
function applyRulesNow() {
    if (!isChatCompletionApiActive()) return;

    if (processTimeout) {
        clearTimeout(processTimeout);
        processTimeout = null;
    }

    const allRules = [
        ...getGlobalRules(),
        ...getCurrentPresetRules()
    ];

    const recentMessages = collectRecentMessagesForRules(allRules);
    processText(recentMessages);
}

async function onMessageSentDelay() {
    // 訊息已進入 chat 陣列，立刻同步處理規則開關，
    // 確保在 sendMessageAsUser 完成、正文開始生成之前完成切換。
    applyRulesNow();

    if (getNeedsDelayAfterInjection()) {
        resetNeedsDelayAfterInjection();
        // Delay to allow APT and other regex plugins to process the injected text after it is sent
        // but before generating the LLM response
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// 重新生成 (regenerate) / 刪除訊息：MESSAGE_DELETED 在 emit 前就已把訊息
// 從 chat 陣列移除 (Generate 中先 chat.length-- 再 emit)，因此同步重算規則
// 可保證「先開關 → 再生成正文」，不再與 MutationObserver + debounce 賽跑。
function onMessageDeletedForApt() {
    applyRulesNow();
}

// 編輯訊息後同步重算規則，讓開關狀態即時跟上編輯內容。
function onMessageEditedForApt() {
    applyRulesNow();
}

function getPromptOrderEntrySafe(promptId) {
    if (!promptManager || !promptId) return null;

    try {
        const activeEntry = promptManager.getPromptOrderEntry?.(promptManager.activeCharacter, promptId);
        if (activeEntry) return activeEntry;
    } catch (e) {
        console.warn('[APT] Failed to get active prompt order entry:', e);
    }

    const promptOrders = promptManager?.serviceSettings?.prompt_order;
    if (!Array.isArray(promptOrders)) return null;

    for (const promptList of promptOrders) {
        const entry = Array.isArray(promptList?.order) ? promptList.order.find(item => item?.identifier === promptId) : null;
        if (entry) return entry;
    }

    return null;
}

function getAllRulesWithMeta() {
    return [
        ...getGlobalRules().map((rule, index) => ({ rule, id: `global_${index}`, scope: 'global', scopeLabel: `Global:${getCurrentGlobalProfileName()}`, index, scopePriority: 0 })),
        ...getCurrentPresetRules().map((rule, index) => ({ rule, id: `preset_${index}`, scope: 'preset', scopeLabel: `Preset:${getCurrentPresetName() || ''}`, index, scopePriority: 1 })),
    ];
}

function getRulePromptIds(rule) {
    const matchIds = Array.isArray(rule.matchPromptIds) ? rule.matchPromptIds : (Array.isArray(rule.promptIds) ? rule.promptIds : [rule.promptId].filter(Boolean));
    const noMatchIds = Array.isArray(rule.noMatchPromptIds) ? rule.noMatchPromptIds : [];
    return { matchIds, noMatchIds };
}

function getConflictPriority(meta, isMatchedAction) {
    // Matched actions outrank inverse/restoration actions; Preset rules outrank Global rules; later rules win ties.
    return (isMatchedAction ? 10000 : 0) + (meta.scopePriority * 1000) + meta.index;
}

function getPromptDebugName(promptId) {
    const prompt = promptManager?.getPromptById?.(promptId);
    return prompt?.name || prompt?.identifier || promptId;
}

function getRuleDebugName(meta) {
    return meta.rule?.name || getRuleConditionSummary(meta.rule) || meta.id;
}

function debouncedProcessText() {
    if (processTimeout) clearTimeout(processTimeout);
    processTimeout = setTimeout(() => {
        processTimeout = null;
        if (!isChatCompletionApiActive()) return;

        // 在執行當下重新收集訊息，避免拿到觸發當下的過期資料
        // (例如 forceRecheck 在注入時呼叫時，新訊息尚未進入 chat)。
        const allRules = [
            ...getGlobalRules(),
            ...getCurrentPresetRules()
        ];
        const recentMessages = collectRecentMessagesForRules(allRules);
        processText(recentMessages);
    }, 200);
}

function processText(recentMessages) {
    if (!isChatCompletionApiActive()) {
        lastRuleDebugState = {
            checkedAt: new Date().toLocaleString(),
            messageCount: Array.isArray(recentMessages) ? recentMessages.length : 0,
            evaluatedCount: 0,
            matchedCount: 0,
            changedCount: 0,
            note: t('debug_note_not_cc_api'),
            rules: [],
            promptActions: [],
        };
        renderRuleDebugStatus();
        return;
    }

    const allRules = getAllRulesWithMeta();
    const pendingStates = new Map();
    const ruleDebugRecords = [];
    let changed = false;

    allRules.forEach((meta) => {
        const { rule } = meta;
        const ruleId = meta.id;
        if (rule.enabled === false) return;
        if (getRuleIncludeTriggers(rule).length === 0) return; // trigger must exist
        
        const { matchIds, noMatchIds } = getRulePromptIds(rule);
        
        if (matchIds.length === 0 && noMatchIds.length === 0) return;

        const ruleDebugRecord = {
            id: ruleId,
            scopeLabel: meta.scopeLabel,
            ruleName: getRuleDebugName(meta),
            conditionSummary: getRuleConditionSummary(rule),
            matched: false,
            invalid: false,
            matchedText: '',
        };
        ruleDebugRecords.push(ruleDebugRecord);

        // Determine how many messages to check based on rule depth
        const depth = rule.depth !== undefined ? rule.depth : 1;
        
        // Filter messages based on depth
        let messagesToCheck = recentMessages;
        if (depth > 0) {
            messagesToCheck = recentMessages.slice(-depth);
        } // if depth is 0, check all recentMessages
        
        // Check if any message in the depth range matches
        let isMatch = false;
        let invalidRule = false;
        const target = rule.target || 'ai_output';

        for (const msg of messagesToCheck) {
            // Strict matching based on target setting
            if (target === 'ai_output' && msg.type !== 'ai') continue;
            if (target === 'user_input' && msg.type !== 'user') continue;
            // 'both' targets AI and User, but usually excludes System
            if (target === 'both' && (msg.type !== 'ai' && msg.type !== 'user')) continue;

            const textToUse = (rule.source === 'raw') ? (msg.rawText || '') : msg.displayText;
            const matchResult = doesMessageMatchRuleText(rule, textToUse, ruleId);
            if (matchResult === null) {
                invalidRule = true;
                break;
            }
            if (matchResult === true) {
                isMatch = true;
                ruleDebugRecord.matchedText = String(textToUse || '').slice(0, 240);
                break; // Found a match, no need to check older messages for this rule
            }
        }

        ruleDebugRecord.matched = isMatch;
        ruleDebugRecord.invalid = invalidRule;

        if (invalidRule) return;

        try {
            if (!promptManager) return;

            const queueChange = (ids, targetState, isMatchedAction) => {
                const priority = getConflictPriority(meta, isMatchedAction);
                ids.forEach(promptId => {
                    const previous = pendingStates.get(promptId);
                    if (!previous || priority >= previous.priority) {
                        pendingStates.set(promptId, { targetState, priority, sourceRule: `${meta.scopeLabel}｜${getRuleDebugName(meta)}` });
                    }
                });
            };

            if (isMatch) {
                queueChange(matchIds, true, true);
                queueChange(noMatchIds, false, true);
            } else {
                queueChange(matchIds, false, false);
                queueChange(noMatchIds, true, false);
            }

        } catch (e) {
            console.error('[AutoPromptToggler] Error processing rule:', e);
        }
    });

    const promptActions = [];

    for (const [promptId, { targetState, sourceRule }] of pendingStates.entries()) {
        const entry = getPromptOrderEntrySafe(promptId);
        const action = {
            promptId,
            promptName: getPromptDebugName(promptId),
            targetState,
            sourceRule,
            changed: false,
            missing: !entry,
        };
        promptActions.push(action);
        if (!entry || entry.enabled === targetState) continue;

        entry.enabled = targetState;
        action.changed = true;
        changed = true;

        if (getNotificationsEnabled() && targetState === true) {
            const prompt = promptManager.getPromptById(promptId);
            toastr.info(fmt(t('prompt_enabled_toast'), prompt?.name || promptId), 'Auto Prompt Toggler');
        }
    }

    if (changed) {
        promptManager.saveServiceSettings();
        promptManager.render();
    }

    lastRuleDebugState = {
        checkedAt: new Date().toLocaleString(),
        messageCount: Array.isArray(recentMessages) ? recentMessages.length : 0,
        evaluatedCount: ruleDebugRecords.length,
        matchedCount: ruleDebugRecords.filter(record => record.matched).length,
        changedCount: promptActions.filter(action => action.changed).length,
        rules: ruleDebugRecords,
        promptActions,
    };
    renderRuleDebugStatus();
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

    if (!displayText && rawText) {
        displayText = rawText;
    }

    return { type, rawText, displayText };
}

function getLastRuleDebugState() {
    return lastRuleDebugState;
}

export {
    initRulesEngine,
    forceRecheck,
    debouncedProcessText,
    clearRuleCaches,
    getRuleIncludeTriggers,
    getRuleExcludeTriggers,
    getRuleTriggerMode,
    getRuleConditionSummary,
    normalizeImportedRule,
    normalizeTriggerList,
    getAllRulesWithMeta,
    getRulePromptIds,
    onMessageSentDelay,
    onMessageDeletedForApt,
    onMessageEditedForApt,
    getLastRuleDebugState,
};
