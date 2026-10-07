# 實作計畫：工具面板（Krita 式停靠面板）

> 任務檔：`docs/01-Plans/03-畫面調整.md`
> 狀態：**全部完成（2026-09-30）**
> 建立：2026-09-30

---

## 1. 目標

把目前左側的「系統工具」按鈕列（範本 / 文字 / 相片 / 元素 / 繪圖 / 上傳 / 背景 / 圖層 / 尺寸）改成 Krita 式的**工具面板（Docker）**：

1. `設定` 選單新增「工具面板」子選單，每個工具一個勾選項目，勾選 = 顯示該面板。
2. 原本按鈕列的 9 個工具全部移進工具面板系統。
3. 面板可以用標題列**拖曳停靠到左側或右側**；版面採**三欄**：左停靠區｜畫布｜右停靠區。
4. 三欄之間有**分隔拖把（size control bar）**，拖曳可以調整兩側停靠區的寬度，畫布跟著變大 / 變小。

## 2. 現況

| 項目 | 位置 | 說明 |
|---|---|---|
| 版面 | `src/pages/home-page.tsx` | Grid：選單列 / 按鈕列（84px）+ 系統控制列 + 工作區 / 頁籤列 |
| 按鈕列 | `components/app/app-siderbutton.tsx` | `SIDER_BUTTONS` 是單一資料來源，`SiderButtonId` 由它推導 |
| 面板外框 | `components/editor/sider-panel.tsx` | 固定寬 `w-80`，一次只能開一個（`openPanel`） |
| 面板內容 | `components/editor/panels/index.ts` | `PANELS satisfies Record<SiderButtonId, ComponentType>` |
| 選單 | `lib/menu/menu-structure.ts` + `commands.ts` | `MenuNode` 只有 item / separator / submenu / radio，**沒有勾選項目** |
| 畫布尺寸 | `editor-canvas.tsx` | 已用 `ResizeObserver` 追蹤容器大小，欄寬改變時會自動跟著調整 |

## 3. 目標版面

```
┌──────────────────────────────────────────────────────────────┐
│ 檔案(F)  設定(S)                                              │ 選單列
├───────────┬─┬───────────────────────────────────┬─┬──────────┤
│ ▾ 範本  ⠿ │ │ 系統控制列（文件名稱、復原、縮放…） │ │ ▾ 圖層 ⠿ │
│  …        │║│ 選取物件工具列                     │║│  …       │
│ ▾ 文字  ⠿ │║│                                   │║│          │
│  …        │║│            畫布                    │║│          │
│           │ │                                   │ │          │
├───────────┴─┴───────────────────────────────────┴─┴──────────┤
│ 頁籤列                                                         │
└──────────────────────────────────────────────────────────────┘
  左停靠區   ↑ size control bar（拖曳調整寬度）↑     右停靠區
```

- 同一側的多個面板**上下堆疊**；標題列可以點擊收合（只剩標題）。
- 某一側沒有面板時，該停靠區與分隔拖把都不顯示，畫布佔滿。
- 拖曳面板標題（`⠿`）時，停靠區顯示插入位置的提示線；放開後移到該側、該位置。

## 4. 架構設計

### 4.1 純邏輯：`src/lib/dock/`（可單元測試，先做）

```ts
type PanelId = "templates" | "text" | "photos" | ...;   // 9 個，由面板定義推導
type DockSide = "left" | "right";

interface DockLayout {
  readonly left:  readonly DockedPanel[];   // 由上到下
  readonly right: readonly DockedPanel[];
  readonly width: { readonly left: number; readonly right: number };  // px
}
interface DockedPanel { readonly id: PanelId; readonly collapsed: boolean }
```

- 純函式：`togglePanel`（開啟時放到該面板的 `defaultSide` 最下方）、`closePanel`、`movePanel(id, side, index)`、`setDockWidth(side, px)`（夾在 200–560 px）、`toggleCollapsed`、`findPanel` / `isPanelVisible`。
- 不變條件：每個 `PanelId` 最多出現一次；沒有變化時回傳同一個參考（和 editor-reducer 的慣例一致）。
- `parseDockLayout(unknown)`：從儲存的 JSON 還原，遇到未知 id、重複 id、寬度非法時修正或回到預設，**不信任儲存內容**。
- 版面狀態**不進入 undo 歷史**，也不存進專案檔（這是 App 的偏好，不是文件內容）。
- 記憶（`dock-storage.ts`）：`localStorage` key `magazine-editor.dockLayout.v1`（版本號在 key 裡，格式不相容時換 key）。讀取一律經過 `parseDockLayout`；storage 不能用、JSON 損壞、寫入失敗都安靜地回到預設 / 忽略。版面改變時就寫入（只在確定時才改變，頻率低）。WebView2 的 localStorage 依 origin 分開，`npm run dev`（`localhost:1420`）和安裝版各自記一份。

### 4.2 面板定義搬家

`SIDER_BUTTONS`（id / label / icon）改放到 `src/lib/dock/panels.ts`（id 與 label）＋ UI 端的 icon 對應，讓 `lib/menu` 能引用面板 id 而不依賴 `components/`。`PANELS` 的 `satisfies Record<PanelId, …>` 完整性檢查保留。

### 4.3 選單

- `MenuNode` 新增 `{ kind: "checkbox"; command: CommandId }`，`AppMenubar` 用 shadcn 已有的 `MenubarCheckboxItem` 渲染；勾選狀態由外部傳入（`isChecked(commandId)`），`MENUS` 本身仍是靜態結構。
- `COMMANDS` 新增 9 個 `panel.<id>`（由 `PANEL_DEFINITIONS` 產生，label = 面板名稱，title =「工具面板：名稱」）；`panel.resetLayout`（重設版面）留到步驟 6。
- `設定` 選單結構（對照 Krita）：
  ```
  設定(S)
    頁面設定...
    偏好設定...          Ctrl+,
    ─────────
    工具面板    ▸  ☑ 範本 / ☐ 文字 / … / ☑ 圖層 / ─ / 重設版面
    外觀        ▸
  ```
- `collectCommands` 的 exhaustive switch 會強迫處理新 kind；`menu-structure.test.ts` 的「每個指令恰好出現一次」自動涵蓋新指令。

### 4.4 UI 元件

| 元件 | 職責 |
|---|---|
| `components/dock/dock-area.tsx` | 一側的停靠區：堆疊面板、接收拖放、顯示插入提示線 |
| `components/dock/dock-panel.tsx` | 取代 `sider-panel.tsx`：標題列（收合 / 拖曳把手 / 關閉 ×）+ ScrollArea。展開的面板平分停靠區高度，收合只剩標題列。Radix ScrollArea 內層的 `display: table` 改成 block，長文字才會截斷而不是撐寬面板 |
| `components/dock/panel-icons.ts` | 面板 icon（`satisfies Record<PanelId, LucideIcon>`） |
| `components/dock/dock-splitter.tsx` | size control bar：8px 感應區跨在停靠區內緣，pointer capture 拖曳、雙擊還原 320px、鍵盤 ←/→ 每次 16px（`role="separator"`）。拖曳時量畫布欄寬度，畫布最少保留 `CANVAS_MIN_WIDTH`（480px，系統控制列放得下）；停靠區寬度 200–560px。視窗變窄時停靠區可以縮到 200px |
| `pages/home-page.tsx` | Grid 三列（選單列 / 主區 / 頁籤列），主區是 flex：`左停靠區 | 中欄（系統控制列 + 選取工具列 + 畫布） | 右停靠區`；`openPanel` 換成 `DockLayout` 狀態。系統控制列從橫跨全寬改成只在中欄 |

- 拖曳面板（`use-dock-drag.ts`）：整條標題列可拖，移動超過 4px 才開始拖曳（短按仍是收合）；拖曳結束吞掉下一次 click。命中判斷用 `elementFromPoint` 找 `data-dock-side`，再以各面板 `data-dock-panel` 的垂直中心算插入 slot（`insertionSlot`），`dropPanel` 把 slot 換算成 `movePanel` 的 index。React state 只在目標改變時更新，跟著游標的標籤（`DockDragGhost`）直接改 style。Esc 取消。放下後位置不變時不顯示提示線。
- 空的一側在拖曳時顯示疊在畫布邊緣的放置區（absolute，不佔版面，畫布尺寸不變）。注意 Tailwind v4 的 `inset-y-0` 是邏輯屬性 `inset-block`，同一個元素設直書會讓它變成水平方向。
- 拖曳面板用 **pointer events 自行實作**（不用 HTML5 drag & drop：`dragDropEnabled: false` 的設定與上傳面板的檔案拖放共用同一套事件，混用容易互相干擾）。
- 分隔拖把拖曳期間只改 local state，放開才寫入 `DockLayout`（和畫布「dragend 才 dispatch」同一個原則，避免每個 pointermove 都觸發整頁 render 與存檔）。

## 5. 執行步驟（一步一步，每步完成後等使用者確認）

| 步驟 | 內容 | 驗收 |
|---|---|---|
| **1** ✅ | `lib/dock/`：型別、純函式、`parseDockLayout`、vitest 測試。面板定義搬到 `lib/dock/panels.ts`。**畫面不變** | `npm test`、`npm run build` 通過 |
| **2** ✅ | 選單：`checkbox` 節點、`panel.*` 指令、`設定 → 工具面板` 子選單。此步先接到**現有的單一面板**（勾選 = 開啟該面板） | 選單可以開關面板；menu 測試通過 |
| **3** ✅ | 三欄版面：移除按鈕列，改成左右停靠區，多個面板上下堆疊、可收合、可關閉（×，同步取消選單勾選）。寬度先固定 | `npm run dev` 目視；畫布隨欄寬調整 |
| **4** ✅ | size control bar：拖曳調整左右寬度（最小 / 最大值夾限）、雙擊重設 | 拖曳時畫布正確重算，捲動錨點不跳動 |
| **5** ✅ | 拖曳停靠：拖標題列移到另一側或改變順序，顯示插入提示線 | 左 ↔ 右、同側排序都正確 |
| **6** ✅ | 記住版面（`localStorage`）、「重設版面」指令 | 重開 App 版面保留；損壞資料回到預設 |
| **7** ✅ | 文件同步：`CLAUDE.md`（目錄結構、選單列與指令、編輯器架構）、`docs/progress.md`；`app-siderbutton.tsx` / `sider-panel.tsx` 的處置 | — |

## 6. 決定

使用者已確認（2026-09-30）：

| 項目 | 決定 |
|---|---|
| 工具如何變成面板 | 9 個工具**各自是獨立面板**，可以同時開多個 |
| size control bar | 三欄之間可拖曳的**分隔條**，調整左右停靠區與畫布的寬度（不是縮放滑桿） |
| 同一側多個面板 | **上下堆疊**，標題列可收合 |
| 實作方式 | **自行實作、不加套件**（pointer events） |

## 7. 仍待確認（先以建議值進行，使用者有意見再改）

1. **不做浮動面板**：第一版只停靠左右兩側。
2. **預設版面**：左側「範本」、右側「圖層」，其餘關閉，從選單開啟。
3. **版面記憶**存在 `localStorage`（偏好設定的 SQLite `settings` 資料表還沒做，之後再搬）。
4. 目前階段是「匯出 EPUB 階段 2」，這項工作**插隊**在它之前。
