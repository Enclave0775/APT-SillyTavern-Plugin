import { chat, eventSource, event_types, main_api, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { download, getFileText, escapeHtml } from '../../../utils.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { getPresetManager } from '../../../preset-manager.js';

const SETTINGS_KEY_GLOBAL = 'auto_prompt_toggler_global'; // Now a dictionary: { "ProfileName": [rules], ... }
const SETTINGS_KEY_GLOBAL_PROFILE = 'auto_prompt_toggler_global_current_profile';
const SETTINGS_KEY_NOTIFICATIONS = 'auto_prompt_toggler_notifications';
const SETTINGS_KEY_LANGUAGE = 'auto_prompt_toggler_language';

const APT_LANGUAGES = {
    'zh-TW': {
        language_label: '介面語言', show_notifications: '顯示通知 (Show Notifications)', show_notifications_title: '切換提示詞時顯示通知',
        header: '自動提示詞切換規則', global_rules: '全域規則 (Global Rules)', preset_rules: 'Preset 規則 (綁定當前提示詞預設)', profile: '設定檔',
        add_profile: '建立新設定檔', rename_profile: '重新命名設定檔', delete_profile: '刪除設定檔', add_rule_profile: '新增規則至此設定檔', import_profile: '匯入規則至此設定檔', export_profile: '將此設定檔匯出', clear_profile: '清空此設定檔的規則',
        add_preset_rule: '新增 Preset 規則', import_preset_rule: '匯入 Preset 規則', export_preset_rule: '匯出 Preset 規則', clear_preset_rule: '清空 Preset 規則',
        no_global_rules: '暫無全域規則', no_preset_rules: '暫無 Preset 規則', contact_text: '對於插件有問題可聯絡提問', original_author: '原作者 (Original Author):',
        enabled_title: '啟用/停用', edit: '編輯', duplicate: '複製', export: '匯出', move_rule: '移動規則', delete: '刪除',
        rule_name: '規則名稱 (選填，方便分類識別)', rule_name_ph: '例如: 睡覺判定', source: '偵測來源 (Detection Source)', display: '聊天顯示 (Chat Display)', raw: '原始內容 (Raw Content)', target: '偵測對象 (Detection Target)', ai: 'AI 輸出 (AI Output)', user: '使用者輸入 (User Input)', both: '兩者 (Both)', trigger_mode: '觸發模式 (Trigger Mode)', trigger_mode_any: '任一條件符合 (OR / Any)', trigger_mode_all: '所有條件皆符合 (AND / All)', trigger: '包含條件 (Regex，每行一個)', trigger_ph: '例如:\n出鞘\n劍', exclude_trigger: '排除條件 (Regex，每行一個，選填)', exclude_trigger_ph: '例如:\n木劍\n練習劍', depth: '檢查層數 (Search Depth)', depth_title: '設定要往回檢查多少則訊息。1 代表只檢查最新的一則，2 代表檢查最新與前一則，以此類推。0 代表檢查所有歷史訊息。', target_prompts: '目標提示詞 (拖曳移動/排序)', search_ph: '🔍 輸入關鍵字以過濾三個清單中的提示詞...', unselected: '未選擇的提示詞', match_header: '觸發時啟用 / 結束時關閉', nomatch_header: '觸發時停用 / 結束時還原', editor_help: '💡 <b>運作說明：</b> 此插件會依照規則條件強制切換提示詞狀態；未觸發時會套用相反狀態，而不是記住每個提示詞先前的手動狀態。<br>• <b>包含條件：</b> 每行一個 Regex。選「所有條件皆符合」即可要求 2 個、3 個以上條件同時出現。<br>• <b>排除條件：</b> 只要任一排除 Regex 出現，即使包含條件符合也不觸發。<br>• <b>觸發時啟用 (中間)：</b> 放「觸發才加載的特殊設定」。符合條件時開啟，未符合時關閉。<br>• <b>觸發時停用 (右邊)：</b> 放「觸發就卸載的常駐設定」。符合條件時關閉，未符合時開啟。<br>(通常只需使用中間框即可，右邊框用來處理必須互斥/靜音的常駐提示詞)',
        save: '儲存', cancel: '取消', create: '建立', clear: '清空', keep_rules: '保留規則', discard_rules: '捨棄規則', controlled_search: '搜尋受規則控制的提示詞', controlled_search_ph: '輸入提示詞名稱/ID 或規則名稱...', controlled_search_empty: '沒有找到受規則控制的提示詞', controlled_search_hint: '搜尋範圍包含目前全域設定檔與目前 Preset 的所有規則。', controlled_by: '控制來源'
    },
    'zh-CN': {
        language_label: '界面语言', show_notifications: '显示通知 (Show Notifications)', show_notifications_title: '切换提示词时显示通知',
        header: '自动提示词切换规则', global_rules: '全局规则 (Global Rules)', preset_rules: 'Preset 规则 (绑定当前提示词预设)', profile: '配置文件',
        add_profile: '建立新配置文件', rename_profile: '重命名配置文件', delete_profile: '删除配置文件', add_rule_profile: '新增规则至此配置文件', import_profile: '导入规则至此配置文件', export_profile: '导出此配置文件', clear_profile: '清空此配置文件的规则',
        add_preset_rule: '新增 Preset 规则', import_preset_rule: '导入 Preset 规则', export_preset_rule: '导出 Preset 规则', clear_preset_rule: '清空 Preset 规则',
        no_global_rules: '暂无全局规则', no_preset_rules: '暂无 Preset 规则', contact_text: '插件如有问题可联系提问', original_author: '原作者 (Original Author):',
        enabled_title: '启用/停用', edit: '编辑', duplicate: '复制', export: '导出', move_rule: '移动规则', delete: '删除',
        rule_name: '规则名称 (选填，方便分类识别)', rule_name_ph: '例如: 睡觉判定', source: '检测来源 (Detection Source)', display: '聊天显示 (Chat Display)', raw: '原始内容 (Raw Content)', target: '检测对象 (Detection Target)', ai: 'AI 输出 (AI Output)', user: '用户输入 (User Input)', both: '两者 (Both)', trigger_mode: '触发模式 (Trigger Mode)', trigger_mode_any: '任一条件符合 (OR / Any)', trigger_mode_all: '所有条件皆符合 (AND / All)', trigger: '包含条件 (Regex，每行一个)', trigger_ph: '例如:\n出鞘\n剑', exclude_trigger: '排除条件 (Regex，每行一个，选填)', exclude_trigger_ph: '例如:\n木剑\n练习剑', depth: '检查层数 (Search Depth)', depth_title: '设置要往回检查多少条消息。1 代表只检查最新一条，2 代表检查最新与前一条，0 代表检查所有历史消息。', target_prompts: '目标提示词 (拖拽移动/排序)', search_ph: '🔍 输入关键字以过滤三个列表中的提示词...', unselected: '未选择的提示词', match_header: '触发时启用 / 结束时关闭', nomatch_header: '触发时停用 / 结束时还原', editor_help: '💡 <b>运行说明：</b> 此插件会依照规则条件强制切换提示词状态；未触发时会套用相反状态，而不是记住每个提示词先前的手动状态。<br>• <b>包含条件：</b> 每行一个 Regex。选择「所有条件皆符合」即可要求 2 个、3 个以上条件同时出现。<br>• <b>排除条件：</b> 只要任一排除 Regex 出现，即使包含条件符合也不触发。<br>• <b>触发时启用 (中间)：</b> 放「触发才加载的特殊设置」。符合条件时开启，未符合时关闭。<br>• <b>触发时停用 (右边)：</b> 放「触发就卸载的常驻设置」。符合条件时关闭，未符合时开启。<br>(通常只需使用中间框即可，右边框用来处理必须互斥/静音的常驻提示词)',
        save: '保存', cancel: '取消', create: '建立', clear: '清空', keep_rules: '保留规则', discard_rules: '舍弃规则', controlled_search: '搜索受规则控制的提示词', controlled_search_ph: '输入提示词名称/ID 或规则名称...', controlled_search_empty: '没有找到受规则控制的提示词', controlled_search_hint: '搜索范围包含当前全局配置文件与当前 Preset 的所有规则。', controlled_by: '控制来源'
    },
    en: {
        language_label: 'Interface Language', show_notifications: 'Show Notifications', show_notifications_title: 'Show a notification when prompts are toggled',
        header: 'Auto Prompt Toggler Rules', global_rules: 'Global Rules', preset_rules: 'Preset Rules (bound to current prompt preset)', profile: 'Profile',
        add_profile: 'Create new profile', rename_profile: 'Rename profile', delete_profile: 'Delete profile', add_rule_profile: 'Add rule to this profile', import_profile: 'Import rules to this profile', export_profile: 'Export this profile', clear_profile: 'Clear rules in this profile',
        add_preset_rule: 'Add Preset rule', import_preset_rule: 'Import Preset rules', export_preset_rule: 'Export Preset rules', clear_preset_rule: 'Clear Preset rules',
        no_global_rules: 'No global rules', no_preset_rules: 'No Preset rules', contact_text: 'If you have questions or issues, feel free to contact:', original_author: 'Original Author:',
        enabled_title: 'Enable/Disable', edit: 'Edit', duplicate: 'Duplicate', export: 'Export', move_rule: 'Move rule', delete: 'Delete',
        rule_name: 'Rule Name (optional)', rule_name_ph: 'e.g. Sleep detection', source: 'Detection Source', display: 'Chat Display', raw: 'Raw Content', target: 'Detection Target', ai: 'AI Output', user: 'User Input', both: 'Both', trigger_mode: 'Trigger Mode', trigger_mode_any: 'Any condition matches (OR / Any)', trigger_mode_all: 'All conditions match (AND / All)', trigger: 'Include Conditions (Regex, one per line)', trigger_ph: 'e.g.\nunsheathe\nsword', exclude_trigger: 'Exclude Conditions (Regex, one per line, optional)', exclude_trigger_ph: 'e.g.\nwooden sword\npractice sword', depth: 'Search Depth', depth_title: 'How many recent messages to check. 1 checks only the latest message; 2 checks the latest and previous message; 0 checks all history.', target_prompts: 'Target Prompts (drag to move/sort)', search_ph: '🔍 Type keywords to filter prompts in all three lists...', unselected: 'Unselected Prompts', match_header: 'Enable on Match / Disable on End', nomatch_header: 'Disable on Match / Restore on End', editor_help: '💡 <b>How it works:</b> This plugin forcibly toggles prompt states according to rule conditions. When not matched, it applies the opposite state rather than remembering each prompt\'s previous manual state.<br>• <b>Include conditions:</b> One Regex per line. Select “All conditions match” to require 2, 3, or more conditions at the same time.<br>• <b>Exclude conditions:</b> If any exclude Regex appears, the rule will not trigger even if include conditions match.<br>• <b>Enable on Match (middle):</b> Put special prompts that should load only when triggered here. They are enabled on match and disabled when not matched.<br>• <b>Disable on Match (right):</b> Put always-on prompts that should be muted when triggered here. They are disabled on match and enabled when not matched.<br>(Usually the middle column is enough; the right column is for mutually exclusive or muted always-on prompts.)',
        save: 'Save', cancel: 'Cancel', create: 'Create', clear: 'Clear', keep_rules: 'Keep Rules', discard_rules: 'Discard Rules', controlled_search: 'Search prompts controlled by rules', controlled_search_ph: 'Type prompt name/ID or rule name...', controlled_search_empty: 'No controlled prompts found', controlled_search_hint: 'Search includes all rules in the current global profile and current Preset.', controlled_by: 'Controlled by'
    }
};

let chatObserver = null;
let lastMessageId = null;
let processTimeout = null;
const regexCache = new Map();
const invalidRegexWarnings = new Set();

// Preset rules state
let currentPresetName = null;
let currentPresetRules = [];

function getLanguage() {
    const lang = extension_settings[SETTINGS_KEY_LANGUAGE];
    return APT_LANGUAGES[lang] ? lang : 'zh-TW';
}

function t(key) {
    const lang = getLanguage();
    return APT_LANGUAGES[lang]?.[key] ?? APT_LANGUAGES['zh-TW'][key] ?? key;
}

function setLanguage(lang) {
    extension_settings[SETTINGS_KEY_LANGUAGE] = APT_LANGUAGES[lang] ? lang : 'zh-TW';
    saveSettingsDebounced();
    applyLanguageToSettings();
    renderRulesLists();
}

function applyI18n(root) {
    const scope = root ? $(root) : $(document);
    scope.find('[data-apt-i18n]').addBack('[data-apt-i18n]').each(function() {
        $(this).html(t($(this).data('apt-i18n')));
    });
    scope.find('[data-apt-i18n-title]').addBack('[data-apt-i18n-title]').each(function() {
        $(this).attr('title', t($(this).data('apt-i18n-title')));
    });
    scope.find('[data-apt-i18n-placeholder]').addBack('[data-apt-i18n-placeholder]').each(function() {
        $(this).attr('placeholder', t($(this).data('apt-i18n-placeholder')));
    });
}

function applyLanguageToSettings() {
    const root = $('#auto_prompt_toggler_settings');
    if (!root.length) return;
    root.find('.inline-drawer-header b').text(t('header'));
    $('#apt_language_select').val(getLanguage());
    applyI18n(root);
    root.find('.apt-section-header strong').eq(0).text(t('global_rules'));
    root.find('.apt-section-header strong').eq(1).text(t('preset_rules'));
    root.find('.fa-folder').attr('title', t('profile'));
    $('#apt_global_profile_add').attr('title', t('add_profile'));
    $('#apt_global_profile_rename').attr('title', t('rename_profile'));
    $('#apt_global_profile_delete').attr('title', t('delete_profile'));
    $('#apt_global_add_rule').attr('title', t('add_rule_profile'));
    $('#apt_global_import').attr('title', t('import_profile'));
    $('#apt_global_export').attr('title', t('export_profile'));
    $('#apt_global_clear').attr('title', t('clear_profile'));
    $('#apt_preset_add_rule').attr('title', t('add_preset_rule'));
    $('#apt_preset_import').attr('title', t('import_preset_rule'));
    $('#apt_preset_export').attr('title', t('export_preset_rule'));
    $('#apt_preset_clear').attr('title', t('clear_preset_rule'));
    $('#apt_controlled_prompt_search_label').text(t('controlled_search'));
    $('#apt_controlled_prompt_search').attr('placeholder', t('controlled_search_ph'));
    $('#apt_controlled_prompt_hint').text(t('controlled_search_hint'));
    $('.apt-rule-enable').attr('title', t('enabled_title'));
    $('.rule-edit').attr('title', t('edit'));
    $('.rule-duplicate').attr('title', t('duplicate'));
    $('.rule-export').attr('title', t('export'));
    $('.rule-delete').attr('title', t('delete'));
}

function localizeEditor(editorHtml) {
    editorHtml.find('label[data-i18n="Rule Name"]').text(t('rule_name'));
    editorHtml.find('#apt_editor_rule_name').attr('placeholder', t('rule_name_ph'));
    editorHtml.find('label[data-i18n="Detection Source"]').text(t('source'));
    editorHtml.find('#apt_editor_source option[value="display"]').text(t('display'));
    editorHtml.find('#apt_editor_source option[value="raw"]').text(t('raw'));
    editorHtml.find('label[data-i18n="Detection Target"]').text(t('target'));
    editorHtml.find('#apt_editor_target option[value="ai_output"]').text(t('ai'));
    editorHtml.find('#apt_editor_target option[value="user_input"]').text(t('user'));
    editorHtml.find('#apt_editor_target option[value="both"]').text(t('both'));
    editorHtml.find('label[data-i18n="Trigger Match Mode"]').text(t('trigger_mode'));
    editorHtml.find('#apt_editor_trigger_mode option[value="any"]').text(t('trigger_mode_any'));
    editorHtml.find('#apt_editor_trigger_mode option[value="all"]').text(t('trigger_mode_all'));
    editorHtml.find('label[data-i18n="Trigger (Regex)"]').text(t('trigger'));
    editorHtml.find('#apt_editor_trigger').attr('placeholder', t('trigger_ph'));
    editorHtml.find('label[data-i18n="Exclude Trigger (Regex)"]').text(t('exclude_trigger'));
    editorHtml.find('#apt_editor_exclude_trigger').attr('placeholder', t('exclude_trigger_ph'));
    editorHtml.find('label[data-i18n="Search Depth"]').text(t('depth')).attr('title', t('depth_title'));
    editorHtml.find('#apt_editor_depth').attr('title', t('depth_title'));
    editorHtml.find('label[data-i18n="Target Prompts"]').text(t('target_prompts'));
    editorHtml.find('#apt_editor_prompt_search').attr('placeholder', t('search_ph'));
    editorHtml.find('.apt-list-header').eq(0).text(t('unselected'));
    editorHtml.find('.apt-list-header').eq(1).text(t('match_header'));
    editorHtml.find('.apt-list-header').eq(2).text(t('nomatch_header'));
    editorHtml.find('small').html(t('editor_help'));
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
    forceRecheck();
}

function getGlobalRules() {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    return profiles[current] || [];
}

function forceRecheck() {
    lastMessageId = null;
    const allRules = [
        ...getGlobalRules(),
        ...currentPresetRules
    ];

    const recentMessages = collectRecentMessagesForRules(allRules);
    debouncedProcessText(recentMessages);
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

function getLatestMessageId() {
    if (typeof chat !== 'undefined' && Array.isArray(chat) && chat.length > 0) {
        return `chat-${chat.length - 1}`;
    }

    const { messages } = getMessagesByMesId();
    const lastMessageElement = messages[messages.length - 1];
    return lastMessageElement?.getAttribute?.('mesid') || (messages.length > 0 ? `dom-msg-${messages.length - 1}` : null);
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
            toastr?.error?.(`規則 ${ruleId} 的 Regex 無效，已略過此規則`, 'Auto Prompt Toggler');
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
    let summary = includeTriggers.length > 0 ? includeTriggers.join(` ${modeText} `) : '(無觸發條件)';
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

function saveGlobalRules(rules) {
    const profiles = getGlobalProfiles();
    const current = getCurrentGlobalProfileName();
    profiles[current] = rules;
    extension_settings[SETTINGS_KEY_GLOBAL] = profiles;
    clearRuleCaches();
    saveSettingsDebounced();
    forceRecheck();
}

async function savePresetRules() {
    const presetMgr = getOpenAiPresetManager();
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
        clearRuleCaches();
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

function sanitizeFileNamePart(value, fallback = 'rules') {
    return String(value || fallback).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || fallback;
}

function getAllRulesWithMeta() {
    return [
        ...getGlobalRules().map((rule, index) => ({ rule, id: `global_${index}`, scope: 'global', scopeLabel: `Global:${getCurrentGlobalProfileName()}`, index, scopePriority: 0 })),
        ...currentPresetRules.map((rule, index) => ({ rule, id: `preset_${index}`, scope: 'preset', scopeLabel: `Preset:${currentPresetName || ''}`, index, scopePriority: 1 })),
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

async function openEditor(ruleType = 'global', ruleIndex = -1) {
    if (!isChatCompletionApiActive()) {
        toastr.warning('APT 目前只支援 Chat Completion / OpenAI 類型的提示詞預設。', 'Auto Prompt Toggler');
        return;
    }

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
            toastr.warning('必須至少在一個觸發條件中選擇目標提示詞', 'Auto Prompt Toggler');
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
            depthText = rule.depth === 0 ? '[全部訊息] ' : (rule.depth === 1 ? '' : `[最近 ${rule.depth} 則] `);
        }
        
        const conditionSummary = getRuleConditionSummary(rule);
        const generatedSummaryText = `${targetText}${sourceText}${depthText}${conditionSummary} ➜ ${promptDisplay}`;
        const displayText = rule.name ? rule.name : generatedSummaryText;
        
        item.find('.apt-rule-summary').text(displayText);
        
        let detailsStr = `詳細條件: [${rule.target || 'ai_output'}][${rule.source || 'display'}]${depthText} ${conditionSummary}\n`;
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
    renderControlledPromptSearch();
    applyLanguageToSettings();
}

function debouncedProcessText(recentMessages) {
    if (processTimeout) clearTimeout(processTimeout);
    processTimeout = setTimeout(() => {
        processText(recentMessages);
    }, 200);
}

function processText(recentMessages) {
    if (!isChatCompletionApiActive()) return;

    const allRules = getAllRulesWithMeta();
    const pendingStates = new Map();
    let changed = false;

    allRules.forEach((meta) => {
        const { rule } = meta;
        const ruleId = meta.id;
        if (rule.enabled === false) return;
        if (getRuleIncludeTriggers(rule).length === 0) return; // trigger must exist
        
        const { matchIds, noMatchIds } = getRulePromptIds(rule);
        
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
                break; // Found a match, no need to check older messages for this rule
            }
        }

        if (invalidRule) return;

        try {
            if (!promptManager) return;

            const queueChange = (ids, targetState, isMatchedAction) => {
                const priority = getConflictPriority(meta, isMatchedAction);
                ids.forEach(promptId => {
                    const previous = pendingStates.get(promptId);
                    if (!previous || priority >= previous.priority) {
                        pendingStates.set(promptId, { targetState, priority });
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

    for (const [promptId, { targetState }] of pendingStates.entries()) {
        const entry = getPromptOrderEntrySafe(promptId);
        if (!entry || entry.enabled === targetState) continue;

        entry.enabled = targetState;
        changed = true;

        if (getNotificationsEnabled() && targetState === true) {
            const prompt = promptManager.getPromptById(promptId);
            toastr.info(`開啟提示詞: ${prompt?.name || promptId}`, 'Auto Prompt Toggler');
        }
    }

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

    if (!displayText && rawText) {
        displayText = rawText;
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
        if (!isChatCompletionApiActive()) return;
        const allRules = [
            ...getGlobalRules(),
            ...currentPresetRules
        ];

        const recentMessages = collectRecentMessagesForRules(allRules);

        const currentMsgId = getLatestMessageId();

        if (currentMsgId !== lastMessageId) {
            lastMessageId = currentMsgId;
        }

        debouncedProcessText(recentMessages);
    });

    chatObserver.observe(chatContainer, { 
        childList: true,
        subtree: false,
        characterData: false
    });
    
    console.log("[AutoPromptToggler] Chat observer initialized.");
}

async function updatePresetState() {
    if (!isChatCompletionApiActive()) {
        currentPresetRules = [];
        currentPresetName = null;
        renderRulesLists();
        return;
    }

    const presetMgr = getOpenAiPresetManager();
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
        try {
            await presetMgr.writePresetExtensionField({
                name: currentPresetName,
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
                    name: currentPresetName,
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
    
    currentPresetRules = Array.isArray(aptExt.rules) ? aptExt.rules : [];
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
            
            rulesToImport = rulesToImport.map(normalizeImportedRule).filter(Boolean);
            
            if (rulesToImport.length > 0) {
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
        extension_settings[SETTINGS_KEY_GLOBAL] = { 'Default': [] };
        extension_settings[SETTINGS_KEY_GLOBAL_PROFILE] = 'Default';
        saveSettingsDebounced();
    }

    const settingsHtml = await renderExtensionTemplateAsync('third-party/APT-SillyTavern-Plugin', 'settings');
    $('#extensions_settings').append(settingsHtml);
    $('#apt_language_select').off('change.apt_i18n').val(getLanguage()).on('change.apt_i18n', function() {
        setLanguage($(this).val());
    });
    applyLanguageToSettings();

    // Notifications Init
    $('#apt_enable_notifications').off('change.apt_notifications').prop('checked', getNotificationsEnabled()).on('change.apt_notifications', function() {
        setNotificationsEnabled($(this).prop('checked'));
    });

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
        const json = JSON.stringify(currentPresetRules, null, 4);
        download(json, `auto_prompt_toggler_preset_${sanitizeFileNamePart(currentPresetName, 'preset')}.json`, 'application/json');
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
            { okButton: t('clear'), cancelButton: t('cancel') }
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
    await updatePresetState();

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
        if (event_types.OAI_PRESET_IMPORT_READY) {
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
                
                importedRules = importedRules.map(normalizeImportedRule).filter(Boolean);
                
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
                        result.data.extensions.auto_prompt_toggler = { rules: importedRules };
                        toastr.success(`已從預設檔匯入 ${importedRules.length} 條 APT 規則`, 'Auto Prompt Toggler');
                    } else {
                        // 使用者選擇捨棄，將資料從 result.data 移除，這樣存檔時就不會有規則
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
    }

    initObserver();
});
