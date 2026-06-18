# Auto Prompt Toggler (APT)

Auto Prompt Toggler（APT）是一個 SillyTavern 擴充功能，用來依照聊天內容、使用者輸入或 LLM 場景判斷結果，自動切換 Chat Completion Prompt 的啟用狀態。

它適合用來管理「特定場景才需要啟用」或「特定情境下需要暫時關閉」的提示詞，例如戰鬥、日常、探索、受傷、睡眠、親密、懸疑等場景提示詞。

> APT 主要支援 SillyTavern 的 Chat Completion / OpenAI 類型提示詞管理流程。

---

## 主要功能

### 1. 自動提示詞切換

- 可建立 Regex 規則，依照聊天內容自動控制 Prompt 開關。
- 支援偵測 AI 輸出、使用者輸入，或兩者同時偵測。
- 支援偵測聊天顯示內容或原始訊息內容。
- 每條規則可指定檢查最近幾則訊息；`0` 代表檢查全部歷史訊息。

### 2. 規則條件

- 包含條件支援每行一個 JavaScript Regex。
- 可選擇「任一條件符合」或「所有條件皆符合」。
- 支援排除條件，只要任一排除 Regex 命中，該規則就不觸發。
- 無效 Regex 會被略過並顯示錯誤提示，不會中斷整個插件。

### 3. 三欄式 Prompt 控制

在規則編輯器中，Prompt 會分成三欄：

- **未選擇的提示詞**：不受此規則控制。
- **觸發時啟用 / 結束時關閉**：規則命中時開啟，未命中時關閉。
- **觸發時停用 / 結束時還原**：規則命中時關閉，未命中時開啟。

APT 是「依規則強制套用目標狀態」，不是記住使用者手動切換前的狀態再復原。

### 4. 全域規則與 Preset 規則

APT 支援兩種規則範圍：

- **全域規則**：可建立多個 Profile，並支援切換、重新命名、刪除、清空、匯入與匯出。
- **Preset 規則**：綁定目前 Chat Completion Preset，會跟著 Preset 自動儲存與切換。

規則也可以在全域與目前 Preset 之間移動。匯入外部 Preset 時，如果內含 APT 規則，會詢問是否保留。

### 5. LLM 場景注入

APT 內建 LLM 場景判斷功能，可在送出訊息前呼叫 LLM 分析目前場景，並把結果附加到使用者輸入後方。

預設概念如下：

```text
[APT_SCENE: 戰鬥]
```

你可以建立 APT 規則偵測這段文字，讓 LLM 自動分類場景後觸發對應 Prompt。

支援模式：

- 沿用 SillyTavern 目前主 API。
- OpenAI 相容自定義端點。
- Google AI Studio / Gemini。

可設定供應商、Base URL、API Key、模型、回應長度、最近對話則數、System Prompt、分類提示詞模板與注入模板。

### 6. 規則狀態檢視

APT 會顯示最近一次規則判定狀態，方便確認目前規則是否有運作。

可查看檢查時間、檢查訊息數、有效規則數、命中規則數、Prompt 變更數、命中的規則、Regex 異常規則，以及 Prompt 被切換成 ON / OFF 的結果。

### 7. 受控 Prompt 搜尋

可以搜尋目前被 APT 規則控制的 Prompt。

搜尋範圍包含目前全域 Profile 與目前 Preset 規則，可用 Prompt 名稱、Prompt ID、規則名稱、控制來源或行為類型搜尋。

### 8. 多語言介面

支援繁體中文、简体中文與 English。

---

## 使用方法

### 安裝

1. 開啟 SillyTavern。
2. 進入 Extensions / 擴充功能。
3. 選擇安裝擴充功能。
4. 輸入此插件 Repository URL：

```text
https://github.com/Enclave0775/APT-SillyTavern-Plugin
```

5. 完成安裝後重新載入 SillyTavern。

### 建立規則

1. 開啟 Extensions 面板中的 **自動提示詞切換規則**。
2. 選擇要使用全域規則或 Preset 規則。
3. 點擊新增規則。
4. 設定規則名稱、偵測來源、偵測對象、觸發模式、包含條件、排除條件與檢查層數。
5. 將 Prompt 拖曳到需要的控制欄位。
6. 儲存規則。

### Regex 範例

任一條件符合：

```text
戰鬥
拔劍
攻擊
```

所有條件皆符合：

```text
出鞘
劍
```

排除條件範例：

```text
木劍
練習劍
```

如果包含條件是 `劍`，排除條件是 `木劍`，那麼出現「木劍」時不會觸發。

### 使用 LLM 場景注入

1. 開啟 **LLM 場景注入** 區塊。
2. 啟用送出前 LLM 場景判斷。
3. 選擇供應商與模型。
4. 設定分類提示詞與注入模板。
5. 建立 APT 規則偵測注入結果，例如：

```text
\[APT_SCENE:\s*戰鬥\]
```

6. 將戰鬥用 Prompt 放到「觸發時啟用 / 結束時關閉」。

---

## 匯入與匯出

- 可匯出目前全域 Profile 的規則。
- 可匯入規則到目前全域 Profile。
- 可匯出目前 Preset 的規則。
- 可匯入規則到目前 Preset。
- 可匯出單一規則。
- 支援舊格式規則資料的相容與遷移。

---

## 規則衝突處理

如果多條規則同時控制同一個 Prompt，APT 會依照優先權決定最終狀態。

優先順序概念：

1. 規則命中時的動作優先於未命中時的反向動作。
2. Preset 規則優先於全域規則。
3. 同範圍中，列表較後面的規則優先。

---

## 注意事項

- APT 依賴 SillyTavern 的 Chat Completion Prompt Manager。
- 若目前主 API 不是 Chat Completion / OpenAI 類型，APT 會避免執行提示詞切換與規則編輯。
- Regex 使用 JavaScript `RegExp`，預設不分大小寫。
- LLM 場景注入的 API Key 若填在插件內，會存在前端擴充設定中；若不希望如此，建議沿用 SillyTavern 原本的 API Key 管理。
- 「觸發時停用 / 結束時還原」的還原是規則未命中時強制開啟，不是還原成使用者先前手動狀態。

---

## 作者

Enclave_X
