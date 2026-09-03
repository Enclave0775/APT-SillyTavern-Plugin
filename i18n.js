import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

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
    if (onLanguageChanged) onLanguageChanged();
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
    root.find('.apt-section-header strong').eq(1).text(t('global_rules'));
    root.find('.apt-section-header strong').eq(2).text(t('preset_rules'));
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

let onLanguageChanged = null;

function initI18n(deps) {
    onLanguageChanged = (deps && typeof deps.onLanguageChanged === "function") ? deps.onLanguageChanged : null;
}

export {
    initI18n,
    t,
    getLanguage,
    setLanguage,
    applyLanguageToSettings,
    localizeEditor,
};

