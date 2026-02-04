# Auto Prompt Toggler (APT)

這是一個 SillyTavern 的擴充功能，能夠根據聊天訊息的內容自動切換（開啟/關閉/切換）Chat Completion 提示詞（Prompt）。

## ✨ 功能特點

*   **自動化控制**：設定規則，當 AI 回覆的內容符合特定條件（Regex）時，自動觸發提示詞狀態改變。
*   **靈活的操作**：支援三種動作：
    *   **開啟 (Enable)**：強制開啟指定提示詞。
    *   **關閉 (Disable)**：強制關閉指定提示詞。
    *   **切換 (Toggle)**：反轉目前提示詞的狀態。
*   **規則管理**：
    *   新增、編輯、刪除規則。
    *   個別啟用或停用規則。
    *   支援匯入與匯出規則設定 (JSON 格式)，方便分享或備份。
*   **即時回饋**：當規則觸發時，會顯示通知提示。

## 🚀 使用方法

1.  **安裝插件**：
    1.  開啟 SillyTavern。
    2.  點擊頂部工具列中的「擴充功能 (Extensions)」按鈕。
    3.  點擊「安裝擴充功能 (Install Extension)」。
    4.  將此 URL 複製到輸入欄位中： `https://github.com/Enclave0775/APT-SillyTavern-Plugin`
    5.  點擊「僅為我安裝 (Install just for me)」或「為所有使用者安裝 (Install for all users)」。

2.  **設定規則**：
    *   開啟 SillyTavern 的 **擴充功能 (Extensions)** 面板。
    *   找到 **自動提示詞切換規則 (Auto Prompt Toggler)** 設定區塊。
    *   點擊 **新增規則 (Add Rule)**。
    *   **觸發條件 (Trigger)**：輸入正規表達式 (Regex)。例如：`Chapter \d+` 會匹配 "Chapter 1" 等文字。
    *   **目標提示詞 (Target Prompt)**：從下拉選單選擇要控制的提示詞。
    *   **動作 (Action)**：選擇要執行的動作 (Enable/Disable/Toggle)。
    *   點擊 **儲存 (Save)**。

3.  **實際運作**：
    *   當 AI 的回覆內容匹配到您設定的 Trigger 時，插件會自動執行對應的動作，並調整提示詞的狀態。

## 📂 匯入與匯出

*   **匯出**：您可以將所有規則匯出為 JSON 檔案進行備份。也可以單獨匯出特定規則。
*   **匯入**：選擇 JSON 檔案將規則匯入。新匯入的規則會被加入到現有的規則列表中。

## ⚠️ 注意事項

*   此插件依賴 `promptManager(SillyTavern原生自帶)`，請確保您的 SillyTavern 版本支援該功能。
*   觸發條件使用 JavaScript 的 `RegExp` 進行匹配 (Case Insensitive 不分大小寫)。

## 👤 作者

Enclave_X
