---
name: bump-file-format
description: 改文件模型（types.ts 的 EditorDocument / Page / 物件欄位）時，提升專案檔 schemaVersion 的完整步驟：TS 型別與驗證、Rust project/format/、升級舊檔、fixture、匯出、types.html、規則檔。新增或修改會存進 project.magproj 的欄位時使用。
---

# 提升檔案格式版本（`SCHEMA_VERSION`）

**Rust `src-tauri/src/project/format/` 是格式的權威定義**（讀取與存檔都驗證）。TS 沒有版本號，只有型別與 reducer 的驗證。開始前讀 `.claude/rules/editor-model.md` 與 `project-files.md`。

## 先決定

- **要不要升版**：會寫進 `project.magproj` 的新欄位或新的值（enum 多一個值也算）→ 要升。只改 UI / 畫法 → 不升。
- **有沒有升級步驟**：新欄位能用 serde 預設（`#[serde(default)]`、`Option`）讀舊檔 → 不寫升級程式，只升版號（讓舊版 App 說「檔案比較新」而不是解析失敗；v10、v14 就是這樣）。舊內容要改寫 → 寫升級函式。

## 步驟（照順序，一個 commit）

1. **TS 型別** `src/lib/editor/types.ts`；reducer 收得到的值要在 `src/lib/editor/validation.ts` 驗證（`isTextStyle`、`isStroke`、`isShapeImage`…），並在 `lib/editor/reducer/*-handlers.ts` 的對應 action 用上。新常數（上限、清單）放 `validation.ts` 或該領域的檔案。
2. **Rust** `project/format/`（型別 `document.rs` / `elements.rs`、驗證 `validate.rs`、常數與 `parse_project` 在 `mod.rs`、升級 `upgrade.rs`、測試 `tests.rs`）：
   - 對應的 struct / enum 欄位（`#[serde(rename_all = "camelCase")]`、預設值）與 `validate_*`（和 TS 同一套規則與上限）。
   - `pub const SCHEMA_VERSION` + 1。
   - 需要升級時：在 `parse_project` 的 `Some(1..SCHEMA_VERSION)` 分支對 `serde_json::Value` 套用升級函式（照 `upgrade_shapes_to_v3` 的寫法，只動舊版有的形狀），**`recovery.rs` 的 `read` 也呼叫同一個函式**（備份檔沒有版本號）。
   - 測試：fixture 讀得到新欄位、非法值被拒、（有升級時）舊格式升級後等於新格式。
3. **TS ↔ Rust 兩邊都有的常數 / 規則**：加一行到 `.claude/rules/cross-language.md`。
4. **Fixture** `tests/fixtures/sample.magproj`：`schemaVersion` 改成新版，新欄位放一個例子（新內容放主頁；**第 1 頁要和 `sample-v2.magproj` 逐一比對**，不要動第 1 頁）。Rust 與 vitest 共用。
5. **畫面與匯出**（新欄位會影響外觀時）：畫布 `components/editor/canvas-elements.tsx`；匯出由 `lib/export/export-request.ts` 帶過去，Rust `export/render.rs`（PDF、PPTX）、`export/html/markup.rs`（EPUB / 翻頁書）、`template.typ`（**漏改只會靜默不畫**）。對照 `editor-model.md` 的「新增物件類型 / geometry 要改的地方」。
6. **UI**：屬性面板 `components/editor/properties-panel.tsx` / 對話框，預設值在 `element-factory.ts`。
7. **MCP**：使用者要讓 AI 也能設定時，改 `tool-definitions.ts` 的 schema → 照 `add-mcp-tool` skill 的後半段（產生 `mcp-tools.json`、重編橋接程式、SDK、工具清單文件）。
8. **文件**：
   - `.claude/rules/project-files.md` 的「各版」那一行加 `v<N> <內容>`，並改「目前 N」。
   - `docs-website/types.html`：圖、說明卡，頁首那段「對應原始檔」加一句（日期、新型別、`schemaVersion` N），「本頁更新於」改日期。和 `types.ts` **同一個 commit**。
   - 計畫文件（`*-實作.md`）記這一版。
9. **驗證**（全部要過）：
   ```powershell
   npx tsc --noEmit -p tsconfig.json      # 不要用 tsc -b
   npm test
   cargo test --manifest-path src-tauri/Cargo.toml
   ```
   有畫面變更時用 `ui-verify` skill 實際操作；有匯出變更時做疊圖比對（指令見根 `CLAUDE.md`）。存檔後重開確認欄位保留（桌面版，列入使用者驗證清單）。

## 常見遺漏

- 只改 TS：Rust 驗證會拒絕存檔 / 開檔。
- 升級函式只接在 `parse_project`：從備份復原時讀到舊格式失敗。
- `stroke` / `label` / `image` 這類物件欄位的 patch 是整個取代：UI 改單一子欄位時要展開原值。
- 樣式 / 色票連結（`styleId`、`*SwatchId`）照存實際值，Rust 不讀樣式表；新欄位如果屬於文字樣式，`default-text-styles.json` 與 TS / Rust 兩邊的預設樣式都要比對。
