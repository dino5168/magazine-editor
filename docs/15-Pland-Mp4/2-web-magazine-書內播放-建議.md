# 給 web-magazine：讓網站上的翻頁書能在書裡播放 YouTube 影片（建議實作）

> 來源：雜誌編輯軟體（magazine-editor）多媒體計畫 `1-加入hyperlink-Mp4-實作.md` 步驟 7。日期：2026-11-01。
> 這份文件可以整份交給 web-magazine 的工作階段。**翻頁書（桌面版匯出 / 上傳的內容）不用再改**；要改的只有網站的書檔伺服器與閱讀頁。

---

## 1. 現象

雜誌編輯軟體匯出的翻頁書，頁面上可以放 YouTube 影片（封面 + 播放圖示）。翻頁書的 `viewer.js` 在讀者點影片時：

- 頁面有真實來源（`http:` / `https:`，而且 `window.origin` 不是 `"null"`）→ 在書上方開播放層，用 YouTube 播放器（`https://www.youtube-nocookie.com/embed/<id>`）在書裡播放。
- 否則（本機開檔 `file:`、或被 sandbox 放進不透明來源）→ 不攔截，照影片連結開新分頁（`target="_blank" rel="noopener noreferrer"`）。

**上傳到網站後，現在點影片沒有反應**：書在不透明來源，不能內嵌；sandbox 沒有 `allow-popups`，新分頁也被擋。

## 2. 原因（目前的設定）

| 位置 | 現在 | 影響 |
|---|---|---|
| 書檔伺服器 `A01-Magazine-Server/src/lib.rs` 的 `books_router`：`Content-Security-Policy` | `sandbox allow-scripts` | 書的 origin 是 `"null"`：YouTube 收不到來源，拒絕內嵌（官方錯誤 153「影片播放器設定錯誤」）；沒有 `allow-popups`，連結開不了新分頁 |
| 閱讀頁 `A01-Magazine-Client/src/pages/reader-page.tsx` 的 `<iframe>`：`sandbox` | `allow-scripts` | 同上（iframe 的 sandbox 與伺服器的 CSP sandbox **兩邊都會套用**，要兩邊都放寬） |
| 同一個 `<iframe>`：`allow` | `fullscreen` | 書裡的 YouTube 播放器拿不到 `autoplay`：點了會出現播放器，但要讀者再按一次播放 |
| `Referrer-Policy: no-referrer`（伺服器）、`referrerPolicy="no-referrer"`（iframe） | — | **沒有影響**：翻頁書的播放器 iframe 自己設 `referrerpolicy="strict-origin-when-cross-origin"` |

## 3. 建議的修改

### 3.1 書檔伺服器（`books_router`）

```rust
.layer(SetResponseHeaderLayer::overriding(
    header::CONTENT_SECURITY_POLICY,
    HeaderValue::from_static("sandbox allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"),
))
```

- `allow-same-origin`：書有自己的真實來源（= 書檔伺服器的網域），YouTube 才肯內嵌。
- `allow-popups` + `allow-popups-to-escape-sandbox`：影片的「在 YouTube 觀看」與退回的新分頁連結能開；開出去的 YouTube 分頁不帶 sandbox（否則 YouTube 自己會壞）。
- **不要**加 `allow-top-navigation`、`allow-forms`：翻頁書不需要。
- 同步改 `tests/upload_test.rs` 裡檢查這個標頭的斷言、`src/lib.rs` 的說明註解。

### 3.2 閱讀頁的 iframe（`reader-page.tsx`）

```tsx
<iframe
  key={session.url}
  src={session.url}
  title={book?.title ?? "翻頁書"}
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
  allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
  referrerPolicy="no-referrer"
  className="w-full flex-1 border-0 bg-white"
/>
```

- `sandbox` 和伺服器同樣的旗標。
- `allow` 多 `autoplay`（點了就播）、`encrypted-media`（YouTube 播放器需要）、`picture-in-picture`。
- 同步改 `src/graphql/types.rs` 的 `ReaderSession.url` 說明（現在寫著 `<iframe sandbox="allow-scripts">`）。

## 4. 資安取捨（要在 web-magazine 的資安評估裡決定）

加了 `allow-same-origin` 之後：

- **登入資訊仍然安全**：書檔伺服器本來就和 API / 前端是**不同網域**（`books_router` 的註解就是這樣設計的）。書拿到的是「書檔伺服器的來源」，不是前端的來源，碰不到前端的 token、cookie、localStorage。
- **書與書之間不再互相隔離**：所有書共用書檔伺服器的來源，一本書的 script 可以讀寫其他書在同一來源的 localStorage / IndexedDB，也可以對書檔伺服器發同來源請求（但檔案仍要簽章路徑，猜不到別本書的網址）。翻頁書的 `viewer.js` 本身不用 localStorage。
- 書的內容是作者上傳的 HTML/JS；目前上傳的都是雜誌編輯軟體產生的固定 viewer，但伺服器不限制內容。

**更嚴格的替代方案**（隔離不變、也能內嵌）：每本書用自己的子網域（例如 `<book-id>.books.<網域>`，需要萬用字元 DNS 與憑證），加 `allow-same-origin` 後每本書仍是不同來源。基礎設施工作比較多，可以之後再換。

## 5. 驗證過的事（magazine-editor 端，本機模擬）

用和網站**相同的標頭**供應同一本有影片的翻頁書（Python 小伺服器），讀者頁用另一個 port 模擬「不同網域的前端」嵌入它，無頭 Edge 點影片：

| 設定 | 結果 |
|---|---|
| 現在的設定（伺服器 `sandbox allow-scripts` + iframe `sandbox="allow-scripts"` `allow="fullscreen"`） | 點了沒有反應 |
| 兩邊加 `allow-same-origin allow-popups allow-popups-to-escape-sandbox`，`allow` 不變 | 播放器出現，但沒有自動播放（要再按一次） |
| 兩邊加旗標 + `allow="fullscreen; autoplay; encrypted-media; picture-in-picture"` | **點了就在書裡播放** |
| 單獨直接開書（沒有閱讀頁）、伺服器加旗標 | 在書裡播放 |
| `Referrer-Policy: no-referrer` 有或沒有 | 結果相同 |

本機開檔（`file://`）不論怎麼設定都是錯誤 153：這是 YouTube 的規則，不是網站的問題。

## 6. 改完後的驗收

1. 用雜誌編輯軟體做一本有 YouTube 影片的書，上傳到網站。
2. 在網站的閱讀頁點影片：書上方出現播放層，**直接開始播放**；不開新分頁。
3. 播放層的「在 YouTube 觀看」開新分頁到 YouTube。
4. 按 Esc 或關閉鈕：播放層關閉、聲音停止。
5. 沒有影片的舊書照常閱讀（翻頁、縮圖、放大、目錄、搜尋）。
6. 閱讀頁登入狀態正常（書碰不到前端的登入資訊）。

## 7. 不需要改的

- 上傳 API、檔案白名單：影片沒有檔案，封面是一般圖片（`.jpg`），都在現有白名單裡。
- 翻頁書的 CSP（書自己的 `<meta>`）：有影片的書已經只多允許 `frame-src https://www.youtube-nocookie.com`。
