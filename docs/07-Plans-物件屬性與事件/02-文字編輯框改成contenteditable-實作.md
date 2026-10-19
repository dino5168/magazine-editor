# 02 文字編輯框改成 contenteditable 實作計畫

沒有任務檔：來自 `01-新增文字框屬性` 完成後的桌面版測試（2026-10-19）。本計畫要 commit。

## 1. 問題

使用者測試：「滑鼠點編修時可以正常。點另一個物件時縮排效果消失？」

- 那段文字設的是**首行突排 3.5 字**，三段（`This is a Sentence` / `Thin si tow Sentence` / `OK。`）都只有一行。首行突排只讓同一段**第二行之後**往內縮，每段只有一行時本來就看不出縮排 → 放開後畫布顯示「沒縮排」是**對的**（無頭 Edge 重現：三行的行框起點都是 0）。
- 錯的是**編輯中的文字框**：`textarea` 不支援 `text-indent: … each-line`（`01` 計畫步驟 1 的已知限制），`padding-left: 3.5em; text-indent: -3.5em` 只讓第一段第一行回到左緣，第二、三段被畫成縮進 3.5 字。看起來「編輯時有效果、放開後消失」。

使用者決定：把編輯框從 `textarea` 換成 `contenteditable` 的 `div`，編輯中就和畫布一致。

## 2. 做法（不重複造輪子）

- 用瀏覽器內建的 **`contenteditable="plaintext-only"`**：只收純文字（貼上時自動去掉格式、Enter 不產生 `<div>` / `<b>`），WebView2（Chromium）支援。不引入編輯器套件（Lexical、ProseMirror…）：我們只需要純文字。
- `01` 步驟 1 實測過：一般 `div`（`white-space: pre-wrap`）**每段都套 `text-indent … each-line`**，所以首行縮排 / 突排在每一段都正確。
- 其他照舊：同一套 CSS（字型、字級、行距、字距、對齊、陰影、縮排）、輸入法選字期間不結束編輯、Esc 取消、Ctrl+Enter / 失焦確定、圖形內文字的外框與垂直對齊、旋轉。
- 編輯器快捷鍵本來就不在 `isContentEditable` 的元素上觸發（`use-editor-shortcuts.ts`），在編輯框裡按 Delete / 方向鍵不會動到物件。

## 3. 要注意的地方（步驟 1 實測）

1. **取值**：Enter 之後文字裡是 `\n` 還是 `<br>`？用 `textContent` 還是 `innerText`？文字最後的換行（`a\n`）讀回來會不會多 / 少一個。
2. **最後一行是空行**：`pre-wrap` 的 `div` 結尾的 `\n` 後面沒有字時，Chrome 不一定畫出那一行（游標放不上去、高度少一行）。
3. **一開始全選**、**自動高度**（`div` 自己長高，不用 `scrollHeight`）。
4. **輸入法**：CDP `Input.imeSetComposition` 模擬選字，確認 `compositionstart/end` 與 `isComposing` 照舊。
5. **換行位置和 textarea 相同**（同字型、寬度）；縮排每段都正確（量每段第一個字的位置，和畫布的行框比）。
6. **編輯中的 Ctrl+Z**：瀏覽器自己的復原（和 textarea 一樣），不會觸發編輯器的復原。

## 4. 步驟（一次一步，每步停下等確認）

### 步驟 1：實測（不改程式）
無頭 Edge 實測第 3 節的六點，結果寫回本計畫；有問題時再和使用者討論做法。

**結果（2026-10-19 完成，無頭 Edge 155，App 頁面上（Geist + Noto Sans TC 22 px、行高 1.5、寬 300），腳本 `ce1.mjs`）**：

| 項目 | 結果 |
|---|---|
| 支援 | `div.contentEditable = "plaintext-only"` 讀回 `"plaintext-only"`、`isContentEditable` 是 true |
| Enter 之後的值 | 文字裡是 **`\n`**（沒有 `<br>` / `<div>`），`textContent`、`innerText`、`innerHTML` 三者相同 |
| **結尾的換行（要處理）** | Chrome 在**最後一個換行後面多放一個 `\n` 當佔位**，那一行才畫得出來：「ab」後按 Enter = `ab\n\n`（畫 2 行），再打「cd」= `ab\ncd`；「cd」後按兩次 Enter = `ab\ncd\n\n\n`（畫 4 行）。反過來，直接放 `a\n` 只畫 **1 行**（最後的空行看不到），`a\n\n` 畫 2 行 |
| 空白、空行 | `""` 畫 1 行（游標放得上去）；`a\n\nb` 畫 3 行 |
| 全選後輸入 | 取代全部文字（「原本的文字\n第二段」→「新」） |
| 輸入法（CDP `imeSetComposition` 模擬注音「ㄓ」→「中」） | `compositionstart` → `compositionupdate` / `input(insertCompositionText, isComposing)` → `compositionend`；選字中文字是「前ㄓ」，確定後「前中」。和 textarea 相同的事件，`composingRef` / `isComposing` 的判斷照用 |
| 換行位置 | 同樣式的 textarea 與 div 行數相同（中文長句 3 / 3、英文長單字 4 / 4、`a\nb\n\nc` 4 / 4） |
| **每段的縮排** | `padding-left: 3.5em; text-indent: -3.5em each-line`（首行突排 3.5 字）：三段的第一個字都在 0，第二段換行後的那一行在 77 px = 3.5 × 22 → **每段都正確**（textarea 只有第一段對） |
| 編輯中 Ctrl+Z | 瀏覽器自己的復原（「abc」+「XYZ」→「abc」），編輯器的復原歷史不變（`isContentEditable` 的元素上不觸發編輯器快捷鍵） |

**結論**：照計畫換成 `contenteditable="plaintext-only"`。結尾換行的規則（步驟 2 實作，純函式 + 測試）：
- **放進編輯框**：文字以 `\n` 結尾時多加一個 `\n`（`a\n` → `a\n\n`），最後的空行才畫得出來、游標放得上去（同 textarea 與 Konva：`a\n` 是兩行）。
- **讀出來**：DOM 文字以 `\n` 結尾時去掉一個（那是 Chrome 的佔位）。驗證：「ab」+ Enter → `ab\n\n` → `ab\n`；「ab\ncd」+ Enter × 2 → `ab\ncd\n\n\n` → `ab\ncd\n\n`；放進去的 `a\n\n` → `a\n`。
- 貼上（純文字）無法用 CDP 模擬真的貼上，留給桌面版人工驗證。

### 步驟 2：換成 contenteditable
- `text-editor-overlay.tsx`：`textarea` → `<div contentEditable="plaintext-only" role="textbox" aria-multiline aria-label="編輯文字">`；初始文字在 layout effect 放一次（不受 React 控制，避免游標跳動），`onInput` 讀值；全選；拿掉 `scrollHeight` 自動高度；縮排加上 `each-line`。依步驟 1 的結果處理結尾換行。
- 註解、`CLAUDE.md`（「段落縮排」的已知限制、「其他注意事項」的文字編輯 overlay）、`01` 計畫的已知限制改成「已在 02 解決」。

**完成（2026-10-19）**：
- `src/lib/editor/editable-text.ts`（純函式）：`toEditableText`（以 `\n` 結尾時多補一個）、`fromEditableText`（以 `\n` 結尾時去掉一個）；`__tests__/editable-text.test.ts` 3 個（含步驟 1 量到的三種情況、任意文字來回不變）。
- `text-editor-overlay.tsx`：`textarea` → `<div contentEditable="plaintext-only" role="textbox" aria-multiline aria-label="編輯文字">`。
  - 內容不受 React 控制：開始時（layout effect，只跑一次）放 `toEditableText(element.text)`、focus、用 Range 全選；結束時讀 `fromEditableText(textContent)`。拿掉 `value` state 與 `scrollHeight` 自動高度（div 自己長高）。
  - 樣式加 `white-space: pre-wrap` / `overflow-wrap: break-word`（同 textarea 的預設）、`cursor-text`；縮排 `text-indent: <首行>em each-line`。
  - 其他不變：輸入法選字期間的 Enter / Esc、Esc 取消、Ctrl+Enter / 失焦確定、圖形內文字的 frame 與垂直對齊、旋轉、陰影。
- 文件：`CLAUDE.md`（目錄結構的 `text-editor-overlay.tsx` 與新的 `editable-text.ts`、「段落縮排」的文字編輯框）、`docs/01-overview.md`（拿掉「只有第一段」的說明，改成「首行突排一段只有一行時看不出效果」）、`01` 計畫第 3 節第 9 點標「已解決」。
- vitest（新 3 個）、`tsc` 通過；畫面的驗證在步驟 3。

### 步驟 3：驗證
- 無頭 Edge：雙擊進入、全選、打字、Enter 換段、Esc 取消（文件不變）、Ctrl+Enter / 點別處確定（一筆復原）、清空文字、輸入法模擬、Delete 不刪物件、首行縮排 / 突排每段的位置和畫布一致、首尾置中、旋轉、縮放、圖形內文字（垂直對齊）、文字工具新建的草稿文字。
- vitest、`npm run build`；更新 `docs/progress.md`。
- 桌面版人工驗證（使用者）：注音輸入、貼上、編輯中 Ctrl+Z。

**完成（2026-10-19，無頭 Edge、真的點擊與按鍵，腳本 `ce3.mjs`）**：
- 雙擊進入：`DIV`、`plaintext-only`、有焦點、全文選取、文字和文件相同。
- **使用者回報的那段文字**（首行突排 3.5 字、右 0.5，第二段加長到會換行）：編輯框每一行的文字與起點（÷ zoom）和畫布**完全相同**——`This is a Sentence` 0、`Thin si tow Sentence … wrap onto` 0、`a second line here` 38.5、`OK。` 0（textarea 時第二、三段會被畫在 3.5 字處）。截圖目視確認。
- 全選後打字取代、Enter 換段；**Esc 取消**：編輯框關閉、文件與復原歷史都沒變。
- 打「AB」+ Enter + **Ctrl+Enter**：DOM 是 `AB\n\n`、存進文件 `AB\n`（佔位去掉），一筆復原；重新打開時 DOM 是 `AB\n\n`（空的最後一行畫得出來）。
- 編輯框裡按 **Delete / Backspace 不會刪掉物件**（`isContentEditable`）；之後**點空白處**確定（文字已被刪光 → 照既有規則刪除物件）。
- **輸入法**（CDP 模擬注音）：選字中按 Esc 不結束編輯；確定後 Ctrl+Enter 存成「前中」。
- 首尾置中：`text-align-last: justify`；旋轉 15°：`rotate(15deg)`；兩者都有 `text-indent: … each-line`。
- 圖形內文字：外層 frame（垂直置中、高度 = 文字框）照舊、每段首行縮排；改字後 Ctrl+Enter 寫回 `label.text`。
- **清空文字 + 確定 = 刪除物件**（照舊）；**文字工具**（T → 點空白處）：空的編輯框、打字、Ctrl+Enter 新增一個文字物件。
- 觀察（既有差異，不是這次造成）：瀏覽器的換行有避頭點（「，」不放行首）、Konva 沒有，所以少數句子在編輯框和畫布的換行位置不同（例如圖形內文字「…縮排兩 / 字，」）；放開後以畫布為準，和 textarea 時一樣。屬於另開的「中文換行」任務。
- vitest 1051、`npm run build` 通過。

## 5. 進度紀錄

- 2026-10-19：計畫建立（使用者決定換成 contenteditable）。下一步：步驟 1 實測。
- 2026-10-19：步驟 1 完成：plaintext-only 可用、值是 `\n`、輸入法事件相同、換行與 textarea 相同、每段縮排正確、Ctrl+Z 不影響編輯器歷史；Chrome 結尾換行多一個佔位 `\n`，放進去時補、讀出來時去。下一步：步驟 2 換成 contenteditable。
- 2026-10-19：步驟 2 完成（`editable-text.ts` + 3 個測試；編輯框換成 `contenteditable="plaintext-only"`，縮排 `each-line`；文件）。下一步：步驟 3 驗證。
- 2026-10-19：步驟 3 完成（無頭 Edge 驗證 10 項，使用者回報的文字在編輯框與畫布逐行相同）。**全部步驟完成**，尚未 commit；桌面版人工驗證待做（注音、貼上、編輯中 Ctrl+Z）。
