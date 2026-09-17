# 02. 架構與資料流程

> 先讀 [01-overview.md](01-overview.md)。

## 一句話說明

**畫面不直接修改資料。** 使用者操作時,畫面送出一個「動作」(action),交給一個純函式 (reducer) 算出新的狀態,React 再依照新狀態重畫畫面。

```mermaid
flowchart LR
    UI["畫面<br/>components/"] -- "dispatch(action)" --> R["reducer<br/>lib/editor/editor-reducer.ts"]
    R -- "新的 state" --> C["EditorProvider<br/>(React Context)"]
    C -- "重新 render" --> UI
```

這種寫法叫做**單向資料流**。只要看懂這個循環,就看懂了這個專案一半的程式碼。

---

## 模組地圖

```mermaid
flowchart TB
    subgraph Tauri["Tauri 桌面外殼"]
        subgraph Front["前端 (TypeScript)"]
            Page["pages/home-page.tsx<br/>組合整個版面"]
            Comp["components/editor/<br/>畫布、面板、工具列"]
            Core["lib/editor/<br/>編輯器核心:資料模型、reducer、計算<br/>(不含畫面)"]
            UI["components/ui/<br/>shadcn 元件(外部程式碼)"]
            Page --> Comp
            Comp --> Core
            Comp --> UI
        end
        Rust["src-tauri/ (Rust)<br/>SQLite + 3 個指令<br/>(前端尚未使用)"]
    end
```

### 各資料夾要不要讀

| 資料夾 | 行數 | 負責什麼 | 要讀嗎 |
|---|---|---|---|
| `src/lib/editor/` | 約 1,100 | **編輯器核心**:資料模型、狀態變化、幾何計算、驗證。不含任何畫面 | **最優先** |
| `src/components/editor/` | 約 1,700 | 畫布、側邊面板、工具列、頁籤列 | 需要 |
| `src/pages/`、`src/App.tsx`、`src/main.tsx` | 約 100 | 程式進入點和版面組合 | 需要(很短) |
| `src/components/app/app-siderbutton.tsx` | 約 90 | 左側按鈕列 | 需要 |
| `src/components/app/app-sidebar.tsx` | 約 200 | 舊的側邊欄,**已不使用** | 跳過 |
| `src/components/ui/` | 約 1,500 | shadcn 產生的通用元件,當作外部套件 | **跳過** |
| `src/lib/editor/__tests__/` | 約 300 | 測試 | 之後再看 |
| `src-tauri/src/` | 約 140 | Rust 後端 | 之後再看(06 會講) |

> 總共約 5,300 行,但**真正需要理解的約 3,500 行**。

---

## 核心概念 1:`lib/editor/` 為什麼不含畫面

`lib/editor/` 裡的程式碼**只處理資料**,不 import 任何畫面元件、不碰 Konva 畫布。只有兩個檔案使用 React,負責把核心邏輯接到畫面:`editor-context.tsx`(把 reducer 接到 React)和 `use-editor-shortcuts.ts`(監聽鍵盤快捷鍵)。

**好處:**

- **容易測試:** 輸入資料、檢查輸出,不需要開瀏覽器。專案的測試全部集中在這裡。
- **邏輯集中:** 「刪除頁面後要選哪一頁」這種規則只寫在一個地方,不會散落在各個按鈕裡。
- **未來可以重用:** 之後接 Typst 匯出時,可以直接使用同一份資料模型。

**原則:** 新增邏輯時,優先放在 `lib/editor/` 並補測試;`components/` 只負責顯示和把使用者操作轉成 action。

---

## 核心概念 2:狀態 (state) 裡有什麼

整個編輯器的狀態定義在 `editor-reducer.ts` 的 `EditorState`:

```
EditorState
├── history                ← 會被「復原/重做」影響
│   ├── past     過去的文件(最多 100 份)
│   ├── present  目前的文件(頁面、物件都在這裡)
│   └── future   復原後可以重做的文件
│
├── activePageId           ← 以下是 UI 狀態,不會被復原/重做影響
├── selectedId
├── view (zoom、fitRequest)
└── uploads
```

另外,**側邊面板開哪一個** (`openPanel`) 不在 `EditorState` 裡,而是 `home-page.tsx` 自己的 `useState`,因為只有版面需要知道。

**為什麼要分開?** 按 Ctrl+Z 時,使用者期待的是「剛才改的內容回來」,而不是「剛才的縮放比例或選取狀態回來」。所以只有文件內容 (`present`) 進入歷史紀錄。

> 復原/重做的細節在 04 說明。

---

## 核心概念 3:兩個完整的資料流程範例

### 範例 A:從「文字」面板加入標題

```mermaid
sequenceDiagram
    actor User as 使用者
    participant Panel as text-panel.tsx
    participant Factory as element-factory.ts
    participant Reducer as editor-reducer.ts
    participant Canvas as editor-canvas.tsx

    User->>Panel: 點「標題」按鈕
    Panel->>Factory: createTextElement("heading", 頁面中心)
    Factory-->>Panel: 新的文字物件(含唯一 id)
    Panel->>Reducer: dispatch({ type: "element/add", element })
    Note over Reducer: 把物件加到目前頁面的 elements 最後面<br/>(最上層),舊文件存進 past,<br/>並選取新物件
    Reducer-->>Canvas: 新的 state
    Canvas->>Canvas: 重新 render,畫出新物件
```

### 範例 B:拖曳物件後放開

```mermaid
sequenceDiagram
    actor User as 使用者
    participant Node as canvas-elements.tsx<br/>(Konva 節點)
    participant Canvas as editor-canvas.tsx
    participant Reducer as editor-reducer.ts

    User->>Node: 拖曳中
    Note over Node: Konva 自己移動節點,<br/>這段期間「不」dispatch
    User->>Node: 放開滑鼠 (dragend)
    Node->>Canvas: onChange(id, { x, y })
    Canvas->>Reducer: dispatch({ type: "element/update", id, patch })
    Note over Reducer: 比對 patch 是否真的有變化<br/>有變化 → 產生新文件、記入歷史<br/>沒變化 → 回傳同一個 state
    Reducer-->>Canvas: 新的 state
```

**為什麼拖曳中不 dispatch?** 每次 dispatch 修改文件都會產生一筆復原紀錄。如果拖曳時每移動一點就 dispatch,拖一次就會產生上百筆紀錄,按 Ctrl+Z 只會退回一點點,畫面也會一直重畫。所以只在**放開時**送出一次。

---

## 核心概念 4:讓編譯器幫你檢查「漏改」

專案刻意用 TypeScript 的型別,讓「新增東西時忘記改某個地方」直接變成**編譯錯誤**,而不是執行時才出 bug。

| 位置 | 檢查什麼 |
|---|---|
| `editor-reducer.ts` 的 `HANDLERS` | 每一種 action 都必須有對應的處理函式 |
| `panels/index.ts` 的 `PANELS` | 左側每個按鈕都必須有對應的面板 |
| `canvas-elements.tsx` 的 `switch` | 每一種物件類型都必須有繪製方式 |
| `editor-canvas.tsx` 的 `TRANSFORMER_OPTIONS` | 每一種物件類型都必須設定縮放控制點 |

**例子:** 在 `app-siderbutton.tsx` 的 `SIDER_BUTTONS` 加一個新按鈕 `"shapes"`,卻忘了在 `PANELS` 加面板,`npm run build` 就會失敗並指出缺少 `shapes`。

> 所以看到 `satisfies Record<...>`、`{ [T in ...]: ... }`、`const exhaustive: never = ...` 這類寫法時,它們的用途就是這種檢查。

---

## 核心概念 5:state 和 dispatch 分成兩個 Context

`editor-context.tsx` 提供兩個 Context 和三個 hook:

| Hook | 取得什麼 |
|---|---|
| `useEditorState()` | 整個 state |
| `useEditorDispatch()` | `dispatch` 函式 |
| `useActivePage()` | 目前頁面(由 state 算出來) |

**為什麼分開?** React 的 Context 值一改變,所有讀取它的元件都會重新 render。如果某個元件**只需要 dispatch**(例如只負責送出動作的按鈕),它就只讀 dispatch 的 Context,狀態變化時就不會跟著重畫。

---

## Rust 後端(簡介)

- 啟動時在使用者的 AppData 資料夾建立 SQLite 資料庫 `app.db`。
- 提供 3 個指令:`get_env_vars`、`upsert_env_var`、`delete_env_var`。
- **前端目前沒有呼叫這些指令。** 細節在 06 說明。

---

## 建議的程式碼閱讀順序

照這個順序打開檔案,一次讀一個,配合 `npm run dev` 操作:

| 順序 | 檔案 | 行數 | 讀的時候注意 |
|---|---|---|---|
| 1 | `src/lib/editor/types.ts` | 約 120 | 文件、頁面、物件長什麼樣子 |
| 2 | `src/lib/editor/editor-reducer.ts` | 約 290 | 所有 action 的清單、`commit` 如何記錄歷史 |
| 3 | `src/lib/editor/editor-context.tsx` | 約 80 | reducer 怎麼接到 React |
| 4 | `src/pages/home-page.tsx` | 約 60 | 版面怎麼組合、`openPanel` 在哪 |
| 5 | `src/components/editor/panels/text-panel.tsx` | 約 50 | 最簡單的「按按鈕 → dispatch」例子(範例 A) |
| 6 | `src/components/editor/canvas-elements.tsx` | 約 170 | 物件怎麼畫成 Konva 節點、拖曳放開時送出什麼(範例 B) |
| 7 | `src/components/editor/editor-canvas.tsx` | 約 320 | **先略過**捲動和縮放相關的 `useLayoutEffect`,05 再講 |

**讀不懂時可以這樣問 Claude:**「解釋 `editor-reducer.ts` 第 105–109 行的 `commit` 函式,用具體例子說明 `past` 怎麼變化。」

---

## 自我檢查題

1. 使用者點「標題」按鈕後,依序經過哪些檔案,畫布才出現新文字?
2. 拖曳物件的過程中,為什麼不會一直 dispatch?
3. 按 Ctrl+Z 後,縮放比例會不會跟著變回去?為什麼?
4. 如果在 `SIDER_BUTTONS` 新增一個按鈕,但沒有加對應的面板,會發生什麼事?
5. 對物件送出 `element/update`,但 patch 的值和原本完全一樣,reducer 會怎麼做?有什麼好處?
6. 新增一段「計算物件是否重疊」的邏輯,應該放在哪個資料夾?為什麼?

<details>
<summary>參考答案</summary>

1. `text-panel.tsx`(按鈕)→ `element-factory.ts`(`createTextElement` 建立物件)→ `dispatch` 送到 `editor-reducer.ts`(`element/add` 把物件加入目前頁面並記入歷史)→ `EditorProvider` 提供新 state → `editor-canvas.tsx` 重新 render,由 `canvas-elements.tsx` 畫出文字。
2. 每次修改文件的 dispatch 都會產生一筆復原紀錄。拖曳中一直 dispatch 會產生大量紀錄、畫面不斷重畫,所以只在放開 (dragend) 時送出一次。
3. **不會。** 縮放比例在 `view` 裡,屬於 UI 狀態,不在 `history` 中;復原只影響文件內容 (`present`)。
4. **編譯失敗。** `PANELS` 用 `satisfies Record<SiderButtonId, ComponentType>` 檢查,缺少任何一個按鈕的面板,`npm run build` 就會報錯。
5. reducer 發現沒有變化,會**回傳同一個 state 物件**。好處:不會產生一筆沒意義的復原紀錄,React 也不會重新 render。
6. `src/lib/editor/`(例如 `geometry.ts`)。這是不含畫面的純邏輯,放在這裡容易寫測試,也方便其他地方重用。

</details>
