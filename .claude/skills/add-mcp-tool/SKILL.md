---
name: add-mcp-tool
description: 新增或修改雜誌編輯軟體的 MCP 工具（給 Claude Code 呼叫的指令）的完整步驟：TOOL_DEFINITIONS → HANDLERS → 測試 → 產生 mcp-tools.json → 重編橋接程式 → Python SDK → 工具清單文件。工具的名稱、說明或參數有任何變動時使用。
---

# 新增 / 修改 MCP 工具

開始前讀 `.claude/rules/mcp.md`（架構、編輯規則、batch、安全限制）。**存檔、匯出、開啟、字型匯入 / 改名 / 刪除不給 MCP**；除了 `import_library_item`，工具都不收檔案路徑。

## 步驟

1. **定義** `src/lib/automation/tool-definitions.ts` 的 `TOOL_DEFINITIONS`：名稱（snake_case）、給 AI 的中文說明（單位 pt、id 從哪裡來）、zod **strict** schema、`readOnly`。
   - 顏色用 `colorInput` / `pageColorInput`（`hex | { swatch, opacity? }`）；regex 才會進 JSON Schema。不用 ajv（CSP 擋 `new Function`）。
   - 驗證錯誤自動是中文（`z.locales.zhTW()`）。
2. **實作** `run-tool.ts` 的 `HANDLERS`（mapped type，漏了編譯失敗）；邏輯放 `queries.ts`（唯讀）/ `commands.ts` / `edits.ts`。
   - 一次呼叫 = 一個 action = 一筆復原；新 id 由工具產生並**寫進 action**（batch 的暫存與重播要一致）。
   - 指定 `pageId` 不切換使用者的頁面；建物件用 `element-factory`。
   - 非同步工具放 `ASYNC_HANDLERS`；不能進 batch 的加進 `batch.ts` 的 `NOT_IN_BATCH`。
3. **測試** `src/lib/automation/__tests__/`（用 `tool-session.ts` 的 session）：成功、參數錯誤（中文訊息）、不 dispatch、一筆復原、在 `batch` 裡（`$ref`）的行為。
   ```powershell
   npx vitest run src/lib/automation
   ```
4. **產生工具清單**（不要手改 `src-tauri/mcp-tools.json`）：
   ```powershell
   npx vitest run mcp-tools -u
   ```
5. **重編橋接程式**（`tauri dev` 只編主程式）。Claude Code 連著時 exe 被鎖住：先改名再編。
   ```powershell
   Rename-Item src-tauri/target/debug/magazine-mcp.exe magazine-mcp.exe.old.exe   # 已有 .old 就換個名字
   cargo build --manifest-path src-tauri/Cargo.toml --bin magazine-mcp
   ```
   伺服器說明（連線時給 Claude Code 的）在 `src-tauri/src/bin/magazine-mcp.rs` 的 `INSTRUCTIONS`，有新的使用方式時一起改。
6. **Python SDK**（`sdk/python/magazine/_tools.py` 是產生的，不要手改）：
   ```powershell
   cd sdk/python; uv run python scripts/generate.py; uv run pytest
   ```
7. **文件** `docs/01-Plans-2026-10/MCP-工具清單.md`：總覽表與該工具的參數（參數改了也要更新），檔頭加一行日期與計畫連結。
8. **全部驗證**：`npx tsc --noEmit -p tsconfig.json`、`npm test`、`cargo test --manifest-path src-tauri/Cargo.toml`。
9. **提醒使用者**：在 Claude Code 執行 `/mcp` 重新連線才看得到新工具 / 新參數（這個工作階段的工具 schema 仍是舊的，但 App 自己驗證參數，新的 enum 值照樣能用）；之後可刪 `magazine-mcp*.old*`。實際呼叫需要桌面版 App 開著並在偏好設定允許連線。

## 只改說明或參數時

步驟 1 → 3（改到的測試）→ 4 → 5 → 6 → 7 → 8 → 9，一樣都不能省：`mcp-tools.json` 內嵌在橋接程式裡，SDK 的測試 `tests/test_tools.py` 會發現沒重新產生。
