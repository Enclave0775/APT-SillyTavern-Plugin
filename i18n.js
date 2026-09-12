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
        save: '儲存', cancel: '取消', create: '建立', clear: '清空', keep_rules: '保留規則', discard_rules: '捨棄規則', controlled_search: '搜尋受規則控制的提示詞', controlled_search_ph: '輸入提示詞名稱/ID 或規則名稱...', controlled_search_empty: '沒有找到受規則控制的提示詞', controlled_search_hint: '搜尋範圍包含目前全域設定檔與目前 Preset 的所有規則。', controlled_by: '控制來源',
        settings_title: '設定',
        llm_injector_title: 'LLM 場景注入',
        rules_management_title: '規則管理',
        llm_reset: '重設',
        llm_enabled_label: '啟用送出前 LLM 場景判斷，並把結果附加到使用者輸入後方',
        llm_provider: 'LLM 供應商',
        llm_provider_sillytavern: '沿用 SillyTavern 目前主 API',
        llm_provider_openai: 'OpenAI 相容（自定義）',
        llm_provider_google: 'Google AI Studio / Gemini',
        llm_base_url: '獨立 Base URL',
        llm_base_url_ph_openai: '例如 https://api.openai.com/v1 或 https://openrouter.ai/api/v1',
        llm_base_url_ph_google: '選填；預設 https://generativelanguage.googleapis.com/v1beta',
        llm_api_key: '獨立 API Key',
        llm_api_key_ph: '只給場景判斷用；沿用模式可留空',
        llm_model: '獨立模型',
        llm_model_ph_openai: '選填；OpenAI/chat completion 類型可填模型 ID，例如 gpt-4o-mini、openrouter/auto',
        llm_model_ph_google: '例如 gemini-1.5-flash、gemini-2.0-flash',
        llm_available_models: '可用模型',
        llm_model_select_empty: '先拉取模型列表...',
        llm_model_select_choose: '選擇模型以回填...',
        llm_fetch_models: '拉取模型',
        llm_fetching: '拉取中...',
        llm_fetched_models: '已拉取 {0} 個模型',
        llm_fetch_failed: '拉取模型失敗: {0}',
        llm_response_length: '回應長度',
        llm_recent_count: '最近對話則數',
        llm_include_user: '需要使用者輸入非空才執行',
        llm_streaming: '啟用流式傳輸 (Streaming) 以繞過部分 API 審查，並在背景接收完整回覆後再判定',
        llm_cleanup_regex: '發送給主模型前，消除匹配此正則表達式的字串 (每行一個)',
        llm_cleanup_regex_ph: '<scene>.*?<\\/scene>\\n*\n<cot_flags>.*?<\\/cot_flags>\\n*',
        llm_custom_prompts_title: '提示詞設置 (Custom Prompts)',
        llm_custom_prompts_help: '此處設定的訊息會依序作為判斷場景用的提示詞。可用變數：<code>{{userInput}}</code>、<code>{{recentMessages}}</code>、<code>{{random::a,b,c}}</code>、<code>{{roll 1d20}}</code>',
        llm_add_custom_message: '新增訊息',
        llm_injection_template: '附加到輸入後方的模板',
        llm_injection_template_help: '可用變數：<code>{{userInput}}</code>、<code>{{recentMessages}}</code>、<code>{{result}}</code>、<code>{{random::a,b,c}}</code>、<code>{{roll 1d20}}</code>。預設會附加 <code>[APT_SCENE: 標籤]</code>，你可以建立 APT 規則偵測這段文字來觸發提示詞條目。<br>「LLM 供應商」可選：沿用 SillyTavern、OpenAI 相容自定義、Google AI Studio / Gemini。<br>OpenAI 相容模式會呼叫 <code>{Base URL}/chat/completions</code> 與 <code>{Base URL}/models</code>；Google AI Studio 會呼叫 Gemini <code>generateContent</code> 與 <code>/models</code>。<br>按「拉取模型」會依照選擇的供應商取得模型列表，並可一鍵回填到「獨立模型」。<br>注意：插件內 Key 會存在前端擴充設定中；若你不想把 Key 存在插件，請留空並使用 SillyTavern 原本的 API Key 管理。<br>「獨立模型」只會在場景判斷這次背景呼叫期間暫時覆寫 OpenAI/chat completion 來源的模型設定，完成後會恢復原本聊天模型。',
        role_system: '系統訊息',
        role_user: 'User訊息',
        role_assistant: 'AI助理訊息',
        llm_save_preset_failed: '儲存 Preset LLM 場景注入設定失敗',
        llm_reset_preset_done: '已重設目前 Preset 的 LLM 場景注入設定',
        llm_reset_done: '已重設 LLM 場景注入設定',
        llm_scene_result: '場景判斷: {0}',
        llm_injection_failed: 'LLM 場景注入失敗: {0}',
        llm_judging: '正在判斷場景類型...',
        llm_log_executed: 'LLM 場景判斷已執行',
        llm_log_sent_order: '發送的提示詞順序：',
        llm_log_raw_reply: 'LLM 原始回覆：',
        llm_log_parsed_label: '解析後標籤：',
        llm_log_empty_value: '(空值)',
        llm_log_final_injection: '最終注入字串：',
        llm_default_prompt_system: '你是一個 SillyTavern 場景分類器。請只輸出最適合用來觸發提示詞條目的短標籤或關鍵字，不要解釋。',
        llm_default_prompt_user: '請判斷目前對話與使用者輸入所屬的場景類型。\n\n可輸出的例子：戰鬥、日常、親密、探索、危險、受傷、睡眠、用餐、旅行、懸疑、其它。\n如果沒有明確場景，輸出「其它」。\n\n最近對話：\n{{recentMessages}}\n\n使用者輸入：\n{{userInput}}\n\n只輸出一個場景標籤。',
        llm_empty_result_aborted: 'LLM回傳空值，已中斷後續生成。',
        llm_provider_err_no_models_google: 'Google AI Studio 沒有回傳可用模型列表',
        llm_provider_err_no_models_custom: '獨立端點沒有回傳可用模型列表',
        llm_provider_err_backend: '後端回傳錯誤',
        llm_provider_err_no_model_list: '沒有取得可用模型列表；請確認 API 金鑰/反代/端點設定是否已連線',
        llm_provider_err_model_required_google: '使用 Google AI Studio 時必須指定模型',
        llm_provider_err_model_required_openai: '使用 OpenAI 相容自定義 API 時必須指定模型',
        debug_section_title: '最近一次規則判定狀態',
        debug_empty: '尚未執行規則判定。送出訊息或收到新回覆後會顯示最近一次命中與切換結果。',
        llm_log_title: '最近一次 LLM 場景注入紀錄 (Log)',
        llm_log_empty: '尚未發送任何 LLM 場景注入請求。',
        debug_checked_at: '檢查時間：',
        debug_meta_line: '檢查訊息：{0} 則；有效規則：{1} 條；命中：{2} 條；Prompt 變更：{3} 個',
        debug_match_section: '規則命中 / 異常',
        debug_no_match: '沒有規則命中，也沒有 Regex 異常。',
        debug_invalid_status: 'Regex 異常，已略過',
        debug_matched_status: '命中',
        debug_condition: '條件：',
        debug_matched_text: '命中文字：',
        debug_prompt_section: 'Prompt 切換結果',
        debug_no_prompt_actions: '沒有任何 prompt 需要切換或維持狀態。',
        debug_changed: '已變更',
        debug_already_state: '已是目標狀態',
        debug_source: '；來源：',
        summary_controls_n: '控制 {0} 個提示詞',
        summary_match_one: '(符合) {0}',
        summary_nomatch_one: '(不符) {0}',
        tag_raw: '[原始] ',
        tag_both: '[兩者] ',
        tag_all_messages: '[全部訊息] ',
        tag_recent_n: '[最近 {0} 則] ',
        details_header: '詳細條件: ',
        details_match: '[符合時開啟, 不符時關閉]:',
        details_nomatch: '[不符時開啟, 符合時關閉]:',
        confirm_delete_rule: '確定要刪除規則 "{0}" 嗎?',
        move_to_preset: '移動至 Preset',
        move_to_global: '移動至全域',
        confirm_move_rule: '確定要將此規則移動到 {0} 嗎?',
        moved_toast: '已移動至 {0}',
        editor_only_cc_warning: 'APT 目前只支援 Chat Completion / OpenAI 類型的提示詞預設。',
        editor_no_target_warning: '必須至少在一個觸發條件中選擇目標提示詞',
        scope_global: '全域',
        import_success: '匯入成功，新增 {0} 條 {1} 規則',
        import_invalid: '無效的規則檔案或檔案為空',
        import_failed: '匯入失敗: {0}',
        add_profile_popup_title: '新增全域設定檔',
        profile_name_ph: '輸入設定檔名稱',
        profile_exists: '設定檔名稱已存在',
        profile_created: '已建立設定檔: {0}',
        rename_profile_popup_title: '重新命名設定檔',
        profile_renamed: '已重新命名為: {0}',
        cannot_delete_last_profile: '無法刪除最後一個設定檔',
        confirm_delete_profile: '確定要刪除設定檔 <strong>{0}</strong> 嗎?',
        profile_deleted: '已刪除設定檔: {0}',
        confirm_clear_profile: '確定要清空設定檔 <strong>{0}</strong> 的所有規則嗎?',
        global_rules_cleared: '已清空全域規則',
        confirm_clear_preset: '確定要清空當前 Preset <strong>{0}</strong> 的所有規則嗎?',
        preset_rules_cleared: '已清空 Preset 規則',
        regex_invalid_skipped: '規則 {0} 的 Regex 無效，已略過此規則',
        no_trigger_condition: '(無觸發條件)',
        debug_note_not_cc_api: '目前不是 Chat Completion / OpenAI 類型 API，APT 未執行規則判定。',
        prompt_enabled_toast: '開啟提示詞: {0}',
        preset_export_stripped: '已在匯出時移除 APT 的 API 端點與 Key',
        preset_export_title: '要一併匯出 APT 插件的 API 端點與 Key 嗎？',
        preset_export_body: '此提示詞預設檔包含了 <strong>LLM 場景注入</strong> 的獨立 API 端點或 Key。',
        preset_export_hint: '如果您準備分享此設定檔，建議不要匯出 API 資訊，以免您的 API Key 外洩。',
        preset_export_keep: '保留 API 資訊',
        preset_export_strip: '移除 API 資訊',
        preset_import_title: '此預設檔 (Preset) 包含 APT 規則。',
        preset_import_ask: '您是否要將這些規則匯入並綁定至 <strong>{0}</strong>？',
        preset_import_cancel_note: '如果您選擇取消，預設檔仍會匯入，但 APT 規則將會被捨棄。',
        preset_imported_rules: '已從預設檔匯入 {0} 條 APT 規則{1}',
        preset_imported_rules_extra: '與提示詞設置',
        preset_discarded_kept_settings: '已捨棄預設檔附帶的 APT 規則，但保留了提示詞設置',
        preset_discarded: '已捨棄預設檔附帶的 APT 規則',
        match_header_title: '偵測到關鍵字時開啟，未偵測到時自動關閉',
        nomatch_header_title: '偵測到關鍵字時關閉，未偵測到時自動開啟'
    },
    'zh-CN': {
        language_label: '界面语言', show_notifications: '显示通知 (Show Notifications)', show_notifications_title: '切换提示词时显示通知',
        header: '自动提示词切换规则', global_rules: '全局规则 (Global Rules)', preset_rules: 'Preset 规则 (绑定当前提示词预设)', profile: '配置文件',
        add_profile: '建立新配置文件', rename_profile: '重命名配置文件', delete_profile: '删除配置文件', add_rule_profile: '新增规则至此配置文件', import_profile: '导入规则至此配置文件', export_profile: '导出此配置文件', clear_profile: '清空此配置文件的规则',
        add_preset_rule: '新增 Preset 规则', import_preset_rule: '导入 Preset 规则', export_preset_rule: '导出 Preset 规则', clear_preset_rule: '清空 Preset 规则',
        no_global_rules: '暂无全局规则', no_preset_rules: '暂无 Preset 规则', contact_text: '插件如有问题可联系提问', original_author: '原作者 (Original Author):',
        enabled_title: '启用/停用', edit: '编辑', duplicate: '复制', export: '导出', move_rule: '移动规则', delete: '删除',
        rule_name: '规则名称 (选填，方便分类识别)', rule_name_ph: '例如: 睡觉判定', source: '检测来源 (Detection Source)', display: '聊天显示 (Chat Display)', raw: '原始内容 (Raw Content)', target: '检测对象 (Detection Target)', ai: 'AI 输出 (AI Output)', user: '用户输入 (User Input)', both: '两者 (Both)', trigger_mode: '触发模式 (Trigger Mode)', trigger_mode_any: '任一条件符合 (OR / Any)', trigger_mode_all: '所有条件皆符合 (AND / All)', trigger: '包含条件 (Regex，每行一个)', trigger_ph: '例如:\n出鞘\n剑', exclude_trigger: '排除条件 (Regex，每行一个，选填)', exclude_trigger_ph: '例如:\n木剑\n练习剑', depth: '检查层数 (Search Depth)', depth_title: '设置要往回检查多少条消息。1 代表只检查最新一条，2 代表检查最新与前一条，0 代表检查所有历史消息。', target_prompts: '目标提示词 (拖拽移动/排序)', search_ph: '🔍 输入关键字以过滤三个列表中的提示词...', unselected: '未选择的提示词', match_header: '触发时启用 / 结束时关闭', nomatch_header: '触发时停用 / 结束时还原', editor_help: '💡 <b>运行说明：</b> 此插件会依照规则条件强制切换提示词状态；未触发时会套用相反状态，而不是记住每个提示词先前的手动状态。<br>• <b>包含条件：</b> 每行一个 Regex。选择「所有条件皆符合」即可要求 2 个、3 个以上条件同时出现。<br>• <b>排除条件：</b> 只要任一排除 Regex 出现，即使包含条件符合也不触发。<br>• <b>触发时启用 (中间)：</b> 放「触发才加载的特殊设置」。符合条件时开启，未符合时关闭。<br>• <b>触发时停用 (右边)：</b> 放「触发就卸载的常驻设置」。符合条件时关闭，未符合时开启。<br>(通常只需使用中间框即可，右边框用来处理必须互斥/静音的常驻提示词)',
        save: '保存', cancel: '取消', create: '建立', clear: '清空', keep_rules: '保留规则', discard_rules: '舍弃规则', controlled_search: '搜索受规则控制的提示词', controlled_search_ph: '输入提示词名称/ID 或规则名称...', controlled_search_empty: '没有找到受规则控制的提示词', controlled_search_hint: '搜索范围包含当前全局配置文件与当前 Preset 的所有规则。', controlled_by: '控制来源',
        settings_title: '设置',
        llm_injector_title: 'LLM 场景注入',
        rules_management_title: '规则管理',
        llm_reset: '重置',
        llm_enabled_label: '启用发送前 LLM 场景判断，并把结果附加到用户输入后方',
        llm_provider: 'LLM 供应商',
        llm_provider_sillytavern: '沿用 SillyTavern 当前主 API',
        llm_provider_openai: 'OpenAI 兼容（自定义）',
        llm_provider_google: 'Google AI Studio / Gemini',
        llm_base_url: '独立 Base URL',
        llm_base_url_ph_openai: '例如 https://api.openai.com/v1 或 https://openrouter.ai/api/v1',
        llm_base_url_ph_google: '选填；默认 https://generativelanguage.googleapis.com/v1beta',
        llm_api_key: '独立 API Key',
        llm_api_key_ph: '只给场景判断用；沿用模式可留空',
        llm_model: '独立模型',
        llm_model_ph_openai: '选填；OpenAI/chat completion 类型可填模型 ID，例如 gpt-4o-mini、openrouter/auto',
        llm_model_ph_google: '例如 gemini-1.5-flash、gemini-2.0-flash',
        llm_available_models: '可用模型',
        llm_model_select_empty: '先拉取模型列表...',
        llm_model_select_choose: '选择模型以回填...',
        llm_fetch_models: '拉取模型',
        llm_fetching: '拉取中...',
        llm_fetched_models: '已拉取 {0} 个模型',
        llm_fetch_failed: '拉取模型失败: {0}',
        llm_response_length: '回应长度',
        llm_recent_count: '最近对话则数',
        llm_include_user: '需要用户输入非空才执行',
        llm_streaming: '启用流式传输 (Streaming) 以绕过部分 API 审查，并在后台接收完整回复后再判定',
        llm_cleanup_regex: '发送给主模型前，消除匹配此正则表达式的字符串 (每行一个)',
        llm_cleanup_regex_ph: '<scene>.*?<\\/scene>\\n*\n<cot_flags>.*?<\\/cot_flags>\\n*',
        llm_custom_prompts_title: '提示词设置 (Custom Prompts)',
        llm_custom_prompts_help: '此处设置的消息会依序作为判断场景用的提示词。可用变量：<code>{{userInput}}</code>、<code>{{recentMessages}}</code>、<code>{{random::a,b,c}}</code>、<code>{{roll 1d20}}</code>',
        llm_add_custom_message: '新增消息',
        llm_injection_template: '附加到输入后方的模板',
        llm_injection_template_help: '可用变量：<code>{{userInput}}</code>、<code>{{recentMessages}}</code>、<code>{{result}}</code>、<code>{{random::a,b,c}}</code>、<code>{{roll 1d20}}</code>。默认会附加 <code>[APT_SCENE: 标签]</code>，你可以建立 APT 规则侦测这段文字来触发提示词条目。<br>「LLM 供应商」可选：沿用 SillyTavern、OpenAI 兼容自定义、Google AI Studio / Gemini。<br>OpenAI 兼容模式会呼叫 <code>{Base URL}/chat/completions</code> 与 <code>{Base URL}/models</code>；Google AI Studio 会呼叫 Gemini <code>generateContent</code> 与 <code>/models</code>。<br>按「拉取模型」会依照选择的供应商取得模型列表，并可一键回填到「独立模型」。<br>注意：插件内 Key 会存在前端扩充设置中；若你不想把 Key 存在插件，请留空并使用 SillyTavern 原本的 API Key 管理。<br>「独立模型」只会在场景判断这次背景呼叫期间暂时覆写 OpenAI/chat completion 来源的模型设置，完成后会恢复原本聊天模型。',
        role_system: '系统消息',
        role_user: 'User消息',
        role_assistant: 'AI助理消息',
        llm_save_preset_failed: '保存 Preset LLM 场景注入设置失败',
        llm_reset_preset_done: '已重置当前 Preset 的 LLM 场景注入设置',
        llm_reset_done: '已重置 LLM 场景注入设置',
        llm_scene_result: '场景判断: {0}',
        llm_injection_failed: 'LLM 场景注入失败: {0}',
        llm_judging: '正在判断场景类型...',
        llm_log_executed: 'LLM 场景判断已执行',
        llm_log_sent_order: '发送的提示词顺序：',
        llm_log_raw_reply: 'LLM 原始回复：',
        llm_log_parsed_label: '解析后标签：',
        llm_log_empty_value: '(空值)',
        llm_log_final_injection: '最终注入字符串：',
        llm_default_prompt_system: '你是一个 SillyTavern 场景分类器。请只输出最适合用来触发提示词条目的短标签或关键字，不要解释。',
        llm_default_prompt_user: '请判断当前对话与用户输入所属的场景类型。\n\n可输出的例子：战斗、日常、亲密、探索、危险、受伤、睡眠、用餐、旅行、悬疑、其它。\n如果没有明确场景，输出「其它」。\n\n最近对话：\n{{recentMessages}}\n\n用户输入：\n{{userInput}}\n\n只输出一个场景标签。',
        llm_empty_result_aborted: 'LLM返回空值，已中断后续生成。',
        llm_provider_err_no_models_google: 'Google AI Studio 没有返回可用模型列表',
        llm_provider_err_no_models_custom: '独立端点没有返回可用模型列表',
        llm_provider_err_backend: '后端返回错误',
        llm_provider_err_no_model_list: '没有获取到可用模型列表；请确认 API 密钥/反代/端点设置是否已连接',
        llm_provider_err_model_required_google: '使用 Google AI Studio 时必须指定模型',
        llm_provider_err_model_required_openai: '使用 OpenAI 兼容自定义 API 时必须指定模型',
        debug_section_title: '最近一次规则判定状态',
        debug_empty: '尚未执行规则判定。发送消息或收到新回复后会显示最近一次命中与切换结果。',
        llm_log_title: '最近一次 LLM 场景注入记录 (Log)',
        llm_log_empty: '尚未发送任何 LLM 场景注入请求。',
        debug_checked_at: '检查时间：',
        debug_meta_line: '检查消息：{0} 则；有效规则：{1} 条；命中：{2} 条；Prompt 变更：{3} 个',
        debug_match_section: '规则命中 / 异常',
        debug_no_match: '没有规则命中，也没有 Regex 异常。',
        debug_invalid_status: 'Regex 异常，已略过',
        debug_matched_status: '命中',
        debug_condition: '条件：',
        debug_matched_text: '命中文字：',
        debug_prompt_section: 'Prompt 切换结果',
        debug_no_prompt_actions: '没有任何 prompt 需要切换或维持状态。',
        debug_changed: '已变更',
        debug_already_state: '已是目标状态',
        debug_source: '；来源：',
        summary_controls_n: '控制 {0} 个提示词',
        summary_match_one: '(符合) {0}',
        summary_nomatch_one: '(不符) {0}',
        tag_raw: '[原始] ',
        tag_both: '[两者] ',
        tag_all_messages: '[全部消息] ',
        tag_recent_n: '[最近 {0} 则] ',
        details_header: '详细条件: ',
        details_match: '[符合时开启, 不符时关闭]:',
        details_nomatch: '[不符时开启, 符合时关闭]:',
        confirm_delete_rule: '确定要删除规则 "{0}" 吗?',
        move_to_preset: '移动至 Preset',
        move_to_global: '移动至全局',
        confirm_move_rule: '确定要将此规则移动到 {0} 吗?',
        moved_toast: '已移动至 {0}',
        editor_only_cc_warning: 'APT 目前仅支持 Chat Completion / OpenAI 类型的提示词预设。',
        editor_no_target_warning: '必须至少在一种触发条件中选择目标提示词',
        scope_global: '全局',
        import_success: '导入成功，新增 {0} 条 {1} 规则',
        import_invalid: '无效的规则文件或文件为空',
        import_failed: '导入失败: {0}',
        add_profile_popup_title: '新增全局配置文件',
        profile_name_ph: '输入配置文件名称',
        profile_exists: '配置文件名称已存在',
        profile_created: '已建立配置文件: {0}',
        rename_profile_popup_title: '重命名配置文件',
        profile_renamed: '已重命名为: {0}',
        cannot_delete_last_profile: '无法删除最后一个配置文件',
        confirm_delete_profile: '确定要删除配置文件 <strong>{0}</strong> 吗?',
        profile_deleted: '已删除配置文件: {0}',
        confirm_clear_profile: '确定要清空配置文件 <strong>{0}</strong> 的所有规则吗?',
        global_rules_cleared: '已清空全局规则',
        confirm_clear_preset: '确定要清空当前 Preset <strong>{0}</strong> 的所有规则吗?',
        preset_rules_cleared: '已清空 Preset 规则',
        regex_invalid_skipped: '规则 {0} 的 Regex 无效，已略过此规则',
        no_trigger_condition: '(无触发条件)',
        debug_note_not_cc_api: '当前不是 Chat Completion / OpenAI 类型 API，APT 未执行规则判定。',
        prompt_enabled_toast: '开启提示词: {0}',
        preset_export_stripped: '已在导出时移除 APT 的 API 端点和 Key',
        preset_export_title: '要一并导出 APT 插件的 API 端点与 Key 吗？',
        preset_export_body: '此提示词预设档包含了 <strong>LLM 场景注入</strong> 的独立 API 端点或 Key。',
        preset_export_hint: '如果您准备分享此配置文件，建议不要导出 API 信息，以免您的 API Key 外泄。',
        preset_export_keep: '保留 API 信息',
        preset_export_strip: '移除 API 信息',
        preset_import_title: '此预设档 (Preset) 包含 APT 规则。',
        preset_import_ask: '您是否要将这些规则导入并绑定至 <strong>{0}</strong>？',
        preset_import_cancel_note: '如果您选择取消，预设档仍会导入，但 APT 规则将会被舍弃。',
        preset_imported_rules: '已从预设档导入 {0} 条 APT 规则{1}',
        preset_imported_rules_extra: '与提示词设置',
        preset_discarded_kept_settings: '已舍弃预设档附带的 APT 规则，但保留了提示词设置',
        preset_discarded: '已舍弃预设档附带的 APT 规则',
        match_header_title: '检测到关键字时开启，未检测到时自动关闭',
        nomatch_header_title: '检测到关键字时关闭，未检测到时自动开启'
    },
    en: {
        language_label: 'Interface Language', show_notifications: 'Show Notifications', show_notifications_title: 'Show a notification when prompts are toggled',
        header: 'Auto Prompt Toggler Rules', global_rules: 'Global Rules', preset_rules: 'Preset Rules (bound to current prompt preset)', profile: 'Profile',
        add_profile: 'Create new profile', rename_profile: 'Rename profile', delete_profile: 'Delete profile', add_rule_profile: 'Add rule to this profile', import_profile: 'Import rules to this profile', export_profile: 'Export this profile', clear_profile: 'Clear rules in this profile',
        add_preset_rule: 'Add Preset rule', import_preset_rule: 'Import Preset rules', export_preset_rule: 'Export Preset rules', clear_preset_rule: 'Clear Preset rules',
        no_global_rules: 'No global rules', no_preset_rules: 'No Preset rules', contact_text: 'If you have questions or issues, feel free to contact:', original_author: 'Original Author:',
        enabled_title: 'Enable/Disable', edit: 'Edit', duplicate: 'Duplicate', export: 'Export', move_rule: 'Move rule', delete: 'Delete',
        rule_name: 'Rule Name (optional)', rule_name_ph: 'e.g. Sleep detection', source: 'Detection Source', display: 'Chat Display', raw: 'Raw Content', target: 'Detection Target', ai: 'AI Output', user: 'User Input', both: 'Both', trigger_mode: 'Trigger Mode', trigger_mode_any: 'Any condition matches (OR / Any)', trigger_mode_all: 'All conditions match (AND / All)', trigger: 'Include Conditions (Regex, one per line)', trigger_ph: 'e.g.\nunsheathe\nsword', exclude_trigger: 'Exclude Conditions (Regex, one per line, optional)', exclude_trigger_ph: 'e.g.\nwooden sword\npractice sword', depth: 'Search Depth', depth_title: 'How many recent messages to check. 1 checks only the latest message; 2 checks the latest and previous message; 0 checks all history.', target_prompts: 'Target Prompts (drag to move/sort)', search_ph: '🔍 Type keywords to filter prompts in all three lists...', unselected: 'Unselected Prompts', match_header: 'Enable on Match / Disable on End', nomatch_header: 'Disable on Match / Restore on End', editor_help: '💡 <b>How it works:</b> This plugin forcibly toggles prompt states according to rule conditions. When not matched, it applies the opposite state rather than remembering each prompt\'s previous manual state.<br>• <b>Include conditions:</b> One Regex per line. Select “All conditions match” to require 2, 3, or more conditions at the same time.<br>• <b>Exclude conditions:</b> If any exclude Regex appears, the rule will not trigger even if include conditions match.<br>• <b>Enable on Match (middle):</b> Put special prompts that should load only when triggered here. They are enabled on match and disabled when not matched.<br>• <b>Disable on Match (right):</b> Put always-on prompts that should be muted when triggered here. They are disabled on match and enabled when not matched.<br>(Usually the middle column is enough; the right column is for mutually exclusive or muted always-on prompts.)',
        save: 'Save', cancel: 'Cancel', create: 'Create', clear: 'Clear', keep_rules: 'Keep Rules', discard_rules: 'Discard Rules', controlled_search: 'Search prompts controlled by rules', controlled_search_ph: 'Type prompt name/ID or rule name...', controlled_search_empty: 'No controlled prompts found', controlled_search_hint: 'Search includes all rules in the current global profile and current Preset.', controlled_by: 'Controlled by',
        settings_title: 'Settings',
        llm_injector_title: 'LLM Scene Injection',
        rules_management_title: 'Rule Management',
        llm_reset: 'Reset',
        llm_enabled_label: 'Enable pre-send LLM scene detection and append the result to the user input',
        llm_provider: 'LLM Provider',
        llm_provider_sillytavern: 'Use SillyTavern current main API',
        llm_provider_openai: 'OpenAI Compatible (Custom)',
        llm_provider_google: 'Google AI Studio / Gemini',
        llm_base_url: 'Custom Base URL',
        llm_base_url_ph_openai: 'e.g. https://api.openai.com/v1 or https://openrouter.ai/api/v1',
        llm_base_url_ph_google: 'Optional; defaults to https://generativelanguage.googleapis.com/v1beta',
        llm_api_key: 'Custom API Key',
        llm_api_key_ph: 'Only used for scene detection; can be left empty in passthrough mode',
        llm_model: 'Custom Model',
        llm_model_ph_openai: 'Optional; for OpenAI/chat completion APIs, enter a model ID such as gpt-4o-mini or openrouter/auto',
        llm_model_ph_google: 'e.g. gemini-1.5-flash, gemini-2.0-flash',
        llm_available_models: 'Available Models',
        llm_model_select_empty: 'Fetch model list first...',
        llm_model_select_choose: 'Select a model to fill in...',
        llm_fetch_models: 'Fetch Models',
        llm_fetching: 'Fetching...',
        llm_fetched_models: 'Fetched {0} model(s)',
        llm_fetch_failed: 'Failed to fetch models: {0}',
        llm_response_length: 'Response Length',
        llm_recent_count: 'Recent Message Count',
        llm_include_user: 'Require non-empty user input',
        llm_streaming: 'Enable streaming to bypass some API filters and decide after the full response is received in the background',
        llm_cleanup_regex: 'Before sending to the main model, remove strings matching these regexes (one per line)',
        llm_cleanup_regex_ph: '<scene>.*?<\\/scene>\\n*\n<cot_flags>.*?<\\/cot_flags>\\n*',
        llm_custom_prompts_title: 'Custom Prompts',
        llm_custom_prompts_help: 'Messages configured here are used in order as prompts for scene detection. Available variables: <code>{{userInput}}</code>, <code>{{recentMessages}}</code>, <code>{{random::a,b,c}}</code>, <code>{{roll 1d20}}</code>',
        llm_add_custom_message: 'Add Message',
        llm_injection_template: 'Template appended to the input',
        llm_injection_template_help: 'Available variables: <code>{{userInput}}</code>, <code>{{recentMessages}}</code>, <code>{{result}}</code>, <code>{{random::a,b,c}}</code>, <code>{{roll 1d20}}</code>. By default <code>[APT_SCENE: label]</code> is appended; you can create APT rules to detect this text and trigger prompt entries.<br>"LLM Provider" options: use SillyTavern, OpenAI compatible custom, Google AI Studio / Gemini.<br>OpenAI compatible mode calls <code>{Base URL}/chat/completions</code> and <code>{Base URL}/models</code>; Google AI Studio calls Gemini <code>generateContent</code> and <code>/models</code>.<br>Clicking "Fetch Models" retrieves the model list for the selected provider and can fill it into "Custom Model" in one click.<br>Note: the key inside the plugin is stored in the frontend extension settings; if you do not want to store the key in the plugin, leave it empty and use SillyTavern\'s own API key management.<br>"Custom Model" only temporarily overrides the OpenAI/chat completion source model during the background scene detection call and is restored afterwards.',
        role_system: 'System Message',
        role_user: 'User Message',
        role_assistant: 'Assistant Message',
        llm_save_preset_failed: 'Failed to save Preset LLM scene injection settings',
        llm_reset_preset_done: 'Reset LLM scene injection settings for the current Preset',
        llm_reset_done: 'LLM scene injection settings reset',
        llm_scene_result: 'Scene detection: {0}',
        llm_injection_failed: 'LLM scene injection failed: {0}',
        llm_judging: 'Detecting scene type...',
        llm_log_executed: 'LLM scene detection executed',
        llm_log_sent_order: 'Sent prompt order:',
        llm_log_raw_reply: 'LLM raw response:',
        llm_log_parsed_label: 'Parsed label:',
        llm_log_empty_value: '(empty)',
        llm_log_final_injection: 'Final injected string:',
        llm_default_prompt_system: 'You are a SillyTavern scene classifier. Output only a short label or keyword best suited to trigger prompt entries, with no explanation.',
        llm_default_prompt_user: 'Determine the scene type of the current conversation and user input.\n\nPossible outputs: combat, daily life, intimacy, exploration, danger, injury, sleep, dining, travel, mystery, other.\nIf there is no clear scene, output "other".\n\nRecent conversation:\n{{recentMessages}}\n\nUser input:\n{{userInput}}\n\nOutput exactly one scene label.',
        llm_empty_result_aborted: 'LLM returned an empty result; generation aborted.',
        llm_provider_err_no_models_google: 'Google AI Studio returned no available model list',
        llm_provider_err_no_models_custom: 'Custom endpoint returned no available model list',
        llm_provider_err_backend: 'Backend returned an error',
        llm_provider_err_no_model_list: 'Could not get the available model list; please check API key / reverse proxy / endpoint connectivity',
        llm_provider_err_model_required_google: 'A model must be specified when using Google AI Studio',
        llm_provider_err_model_required_openai: 'A model must be specified when using an OpenAI-compatible custom API',
        debug_section_title: 'Last Rule Evaluation Status',
        debug_empty: 'Rules have not been evaluated yet. After sending a message or receiving a new reply, the latest match and toggle results will be shown here.',
        llm_log_title: 'Last LLM Scene Injection Log',
        llm_log_empty: 'No LLM scene injection request has been sent yet.',
        debug_checked_at: 'Checked at: ',
        debug_meta_line: 'Messages checked: {0}; Valid rules: {1}; Matched: {2}; Prompt changes: {3}',
        debug_match_section: 'Rule Matches / Errors',
        debug_no_match: 'No rules matched and no Regex errors.',
        debug_invalid_status: 'Regex error, skipped',
        debug_matched_status: 'Matched',
        debug_condition: 'Condition: ',
        debug_matched_text: 'Matched text: ',
        debug_prompt_section: 'Prompt Toggle Results',
        debug_no_prompt_actions: 'No prompts needed to be toggled or kept in state.',
        debug_changed: 'Changed',
        debug_already_state: 'Already at target state',
        debug_source: '; Source: ',
        summary_controls_n: 'Controls {0} prompt(s)',
        summary_match_one: '(Match) {0}',
        summary_nomatch_one: '(No match) {0}',
        tag_raw: '[Raw] ',
        tag_both: '[Both] ',
        tag_all_messages: '[All messages] ',
        tag_recent_n: '[Last {0} messages] ',
        details_header: 'Details: ',
        details_match: '[Enable on match, disable on no match]:',
        details_nomatch: '[Disable on match, enable on no match]:',
        confirm_delete_rule: 'Are you sure you want to delete rule "{0}"?',
        move_to_preset: 'Move to Preset',
        move_to_global: 'Move to Global',
        confirm_move_rule: 'Are you sure you want to move this rule to {0}?',
        moved_toast: 'Moved to {0}',
        editor_only_cc_warning: 'APT currently only supports Chat Completion / OpenAI type prompt presets.',
        editor_no_target_warning: 'You must select at least one target prompt in a trigger condition',
        scope_global: 'Global',
        import_success: 'Import successful, added {0} {1} rule(s)',
        import_invalid: 'Invalid rule file or the file is empty',
        import_failed: 'Import failed: {0}',
        add_profile_popup_title: 'Create New Global Profile',
        profile_name_ph: 'Enter profile name',
        profile_exists: 'Profile name already exists',
        profile_created: 'Profile created: {0}',
        rename_profile_popup_title: 'Rename Profile',
        profile_renamed: 'Renamed to: {0}',
        cannot_delete_last_profile: 'Cannot delete the last profile',
        confirm_delete_profile: 'Are you sure you want to delete profile <strong>{0}</strong>?',
        profile_deleted: 'Profile deleted: {0}',
        confirm_clear_profile: 'Are you sure you want to clear all rules in profile <strong>{0}</strong>?',
        global_rules_cleared: 'Global rules cleared',
        confirm_clear_preset: 'Are you sure you want to clear all rules in Preset <strong>{0}</strong>?',
        preset_rules_cleared: 'Preset rules cleared',
        regex_invalid_skipped: 'Rule {0} has an invalid Regex and was skipped',
        no_trigger_condition: '(no trigger conditions)',
        debug_note_not_cc_api: 'The current API is not Chat Completion / OpenAI type, so APT did not evaluate rules.',
        prompt_enabled_toast: 'Prompt enabled: {0}',
        preset_export_stripped: 'Removed APT API endpoint and key on export',
        preset_export_title: 'Also export the APT plugin API endpoint and key?',
        preset_export_body: 'This prompt preset contains a standalone API endpoint or key for <strong>LLM Scene Injection</strong>.',
        preset_export_hint: 'If you plan to share this preset, it is recommended not to export API information to avoid leaking your API key.',
        preset_export_keep: 'Keep API info',
        preset_export_strip: 'Remove API info',
        preset_import_title: 'This preset contains APT rules.',
        preset_import_ask: 'Do you want to import these rules and bind them to <strong>{0}</strong>?',
        preset_import_cancel_note: 'If you cancel, the preset will still be imported, but the APT rules will be discarded.',
        preset_imported_rules: 'Imported {0} APT rule(s) from the preset{1}',
        preset_imported_rules_extra: ' and prompt settings',
        preset_discarded_kept_settings: 'Discarded the APT rules from the preset, but kept the prompt settings',
        preset_discarded: 'Discarded the APT rules from the preset',
        match_header_title: 'Enabled when keywords are detected, disabled otherwise',
        nomatch_header_title: 'Disabled when keywords are detected, enabled otherwise'
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

function fmt(template, ...args) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{(\d+)\}/g, (match, index) => {
        const i = Number(index);
        return i < args.length ? String(args[i]) : match;
    });
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
    $('#apt_global_rules_title').text(t('global_rules'));
    $('#apt_preset_rules_title').text(t('preset_rules'));
    $('#apt_llm_injector_provider').find('option[value="sillytavern"]').text(t('llm_provider_sillytavern'));
    $('#apt_llm_injector_provider').find('option[value="openai_compatible"]').text(t('llm_provider_openai'));
    $('#apt_llm_injector_provider').find('option[value="google_ai_studio"]').text(t('llm_provider_google'));
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

    // Localize static <template> contents (jQuery find() cannot reach template.content)
    const ruleItemTemplate = document.getElementById('auto_prompt_toggler_rule_item_template');
    if (ruleItemTemplate && ruleItemTemplate.content) {
        const tpl = ruleItemTemplate.content;
        const enableBox = tpl.querySelector('.apt-rule-enable');
        if (enableBox) enableBox.setAttribute('title', t('enabled_title'));
        const editBtn = tpl.querySelector('.rule-edit');
        if (editBtn) editBtn.setAttribute('title', t('edit'));
        const duplicateBtn = tpl.querySelector('.rule-duplicate');
        if (duplicateBtn) duplicateBtn.setAttribute('title', t('duplicate'));
        const exportBtn = tpl.querySelector('.rule-export');
        if (exportBtn) exportBtn.setAttribute('title', t('export'));
        const moveBtn = tpl.querySelector('.rule-move');
        if (moveBtn) moveBtn.setAttribute('title', t('move_rule'));
        const deleteBtn = tpl.querySelector('.rule-delete');
        if (deleteBtn) deleteBtn.setAttribute('title', t('delete'));
    }
    const customMessageTemplate = document.getElementById('apt_llm_injector_custom_message_template');
    if (customMessageTemplate && customMessageTemplate.content) {
        const roleSelect = customMessageTemplate.content.querySelector('.apt-custom-message-role');
        if (roleSelect) {
            const sysOption = roleSelect.querySelector('option[value="system"]');
            if (sysOption) sysOption.textContent = t('role_system');
            const userOption = roleSelect.querySelector('option[value="user"]');
            if (userOption) userOption.textContent = t('role_user');
            const aiOption = roleSelect.querySelector('option[value="assistant"]');
            if (aiOption) aiOption.textContent = t('role_assistant');
        }
        const templateDeleteBtn = customMessageTemplate.content.querySelector('.apt-custom-message-delete');
        if (templateDeleteBtn) templateDeleteBtn.setAttribute('title', t('delete'));
    }
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
    editorHtml.find('.apt-list-header').eq(1).text(t('match_header')).attr('title', t('match_header_title'));
    editorHtml.find('.apt-list-header').eq(2).text(t('nomatch_header')).attr('title', t('nomatch_header_title'));
    editorHtml.find('small').html(t('editor_help'));
}

let onLanguageChanged = null;

function initI18n(deps) {
    onLanguageChanged = (deps && typeof deps.onLanguageChanged === "function") ? deps.onLanguageChanged : null;
}

export {
    initI18n,
    t,
    fmt,
    getLanguage,
    setLanguage,
    applyLanguageToSettings,
    localizeEditor,
};

