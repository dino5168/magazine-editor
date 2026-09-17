# magazine-editor 說明文件

這個資料夾的文件是**給人閱讀**的,目的是讓你理解這個專案的程式碼「在做什麼」以及「為什麼這樣設計」。

> `CLAUDE.md` 是給 Claude 看的規則清單,內容密集、多半只寫規則不寫原因。
> `docs/` 則用白話解釋原因。兩者分工不同,不互相取代。

## 怎麼讀

1. **照編號順序讀**,後面的文件會用到前面的概念。
2. **邊讀邊操作:** 執行 `npm run dev`,在瀏覽器裡實際點點看,再對照文件和程式碼。
3. **每份文件最後有「自我檢查題」:** 先自己回答,再展開參考答案對照。答得出來才往下讀。
4. **看不懂就標記:** 把問題記下來問 Claude,例如「`editor-reducer.ts` 的 `commit` 為什麼要 `slice(-HISTORY_LIMIT)`?」

## 閱讀進度

| 狀態 | 文件 | 內容 |
|---|---|---|
| [ ] | [01-overview.md](01-overview.md) | App 做什麼、目前做得到和做不到的事、怎麼執行 |
| [ ] | [02-architecture.md](02-architecture.md) | 模組地圖、資料怎麼流動、建議的程式碼閱讀順序 |
| 撰寫中 | 03-document-model.md | 文件模型:pt 單位、為什麼不存 scale |
| 撰寫中 | 04-state-and-undo.md | reducer、復原/重做怎麼運作 |
| 撰寫中 | 05-canvas-viewport.md | 畫布捲動與縮放 |
| 撰寫中 | 06-rust-ipc.md | Rust 後端與資料庫 |
| 撰寫中 | 07-dev-workflow.md | 測試、hooks、Claude Code 設定 |

讀完一份就把 `[ ]` 改成 `[x]`。

**分批撰寫:** 文件會一批一批寫。確認看懂目前這一批之後,再請 Claude 寫下一份,讓文件的速度也不超過理解的速度。

## 專案進度

整體進度、已做的決定和待辦事項記在 [progress.md](progress.md)。Claude 開始工作前會自動讀這份檔案(寫在 `CLAUDE.md`)。
