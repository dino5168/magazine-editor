// 翻頁書的 viewer：用 page-flip（viewer/page-flip.browser.js）翻 index.html 裡的 .fb-page，
// 加上工具列（第一頁 / 上一頁 / 頁碼與跳頁 / 下一頁 / 最後一頁 / 全螢幕）與鍵盤操作。
// 書的尺寸（pt）寫在 #book 的 data-width / data-height；頁面標記以 pt 為 px 排好，
// 這裡只負責縮放到翻頁區的大小。不讀網址或其他外部輸入，不用 innerHTML 放文字。
(function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var book = document.getElementById("book");
  var width = parseFloat(book.dataset.width);
  var height = parseFloat(book.dataset.height);
  // 翻頁時 page-flip 會暫時複製頁面，縮圖從這份原本的頁面複製
  var pages = Array.prototype.slice.call(book.querySelectorAll(":scope > .fb-page"));
  var pageCount = pages.length;

  var flip = new St.PageFlip(book, {
    width: width,
    height: height,
    size: "stretch",
    // 翻頁區不到 2 × 300 px 寬時改成單頁
    minWidth: 300,
    maxWidth: 4000,
    minHeight: 300,
    maxHeight: 4000,
    // 第 1 頁（封面）單獨在右，之後 2–3、4–5…，和編輯器的雙頁模式相同
    showCover: true,
    maxShadowOpacity: 0.5,
    mobileScrollSupport: false,
  });
  flip.loadFromHTML(pages);

  // ---- 縮放 ----

  function rescale() {
    book.style.setProperty("--s", String(flip.getBoundsRect().pageWidth / width));
  }

  // ---- 目前看到哪幾頁（0 起算） ----

  /**
   * 目前看到的頁：單頁模式是一頁；雙頁模式依「封面單獨、之後 2–3、4–5…」配對。
   * @returns {[number, number]} 第一頁與最後一頁的 index（同一頁時相同）
   */
  function visibleRange() {
    var index = flip.getCurrentPageIndex();
    if (flip.getOrientation() === "portrait" || index === 0) return [index, index];
    var start = index % 2 === 1 ? index : index - 1;
    return [start, Math.min(start + 1, pageCount - 1)];
  }

  // ---- 工具列 ----

  /** 一個 24×24 的線條 icon（stroke 跟著文字顏色）。 */
  function icon(paths) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  var ICONS = {
    first: ["M11 17l-5-5 5-5", "M18 17l-5-5 5-5"],
    prev: ["M15 18l-6-6 6-6"],
    next: ["M9 18l6-6-6-6"],
    last: ["M13 17l5-5-5-5", "M6 17l5-5-5-5"],
    enterFullscreen: ["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"],
    exitFullscreen: ["M8 3v3a2 2 0 0 1-2 2H3", "M21 8h-3a2 2 0 0 1-2-2V3", "M3 16h3a2 2 0 0 1 2 2v3", "M16 21v-3a2 2 0 0 1 2-2h3"],
    thumbnails: ["M4 5h7v14H4z", "M13 5h7v14h-7z"],
    zoomIn: ["M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z", "M21 21l-4.35-4.35", "M11 8v6", "M8 11h6"],
    zoomOut: ["M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z", "M21 21l-4.35-4.35", "M8 11h6"],
    fitWidth: ["M3 12h18", "M7 8l-4 4 4 4", "M17 8l4 4-4 4"],
    close: ["M18 6L6 18", "M6 6l12 12"],
    contents: ["M9 6h11", "M9 12h11", "M9 18h11", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  };

  function button(label, iconName, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "fb-button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(ICONS[iconName]));
    b.addEventListener("click", onClick);
    return b;
  }

  var toolbar = document.createElement("div");
  toolbar.id = "toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "翻頁");

  var firstButton = button("第一頁（Home）", "first", function () { goTo(0); });
  var prevButton = button("上一頁（←）", "prev", function () { flip.flipPrev(); });
  var nextButton = button("下一頁（→）", "next", function () { flip.flipNext(); });
  var lastButton = button("最後一頁（End）", "last", function () { goTo(pageCount - 1); });

  // 頁碼：平常顯示「2–3 / 24」，按下變成輸入框（Enter 跳頁、Esc 或離開取消）
  var pageField = document.createElement("label");
  pageField.className = "fb-page-field";
  var pageInput = document.createElement("input");
  pageInput.type = "text";
  pageInput.inputMode = "numeric";
  pageInput.autocomplete = "off";
  pageInput.setAttribute("aria-label", "跳到第幾頁");
  pageInput.title = "輸入頁碼後按 Enter";
  var pageTotal = document.createElement("span");
  pageTotal.className = "fb-page-total";
  pageTotal.textContent = "/ " + pageCount;
  pageField.appendChild(pageInput);
  pageField.appendChild(pageTotal);

  var thumbsButton = button("頁面縮圖", "thumbnails", function () { setThumbsOpen(!thumbsOpen); });
  thumbsButton.setAttribute("aria-pressed", "false");
  thumbsButton.setAttribute("aria-controls", "thumbs");

  var fullscreenButton = null;
  if (document.fullscreenEnabled) {
    fullscreenButton = button("全螢幕", "enterFullscreen", toggleFullscreen);
  }

  [firstButton, prevButton, pageField, nextButton, lastButton].forEach(function (el) { toolbar.appendChild(el); });
  var divider = document.createElement("span");
  divider.className = "fb-divider";
  toolbar.appendChild(divider);
  var panelButton = button("目錄與搜尋（Ctrl+F 搜尋）", "contents", function () { setPanelOpen(!panelOpen); });
  panelButton.setAttribute("aria-pressed", "false");
  panelButton.setAttribute("aria-controls", "panel");
  toolbar.appendChild(panelButton);
  var zoomButton = button("放大檢視（Z）", "zoomIn", function () { openZoom(); });
  zoomButton.setAttribute("aria-haspopup", "dialog");
  toolbar.appendChild(zoomButton);
  toolbar.appendChild(thumbsButton);
  if (fullscreenButton) toolbar.appendChild(fullscreenButton);
  document.body.appendChild(toolbar);

  // ---- 縮圖列 ----

  // 跨頁：封面單獨，之後 2–3、4–5…（和翻頁、編輯器相同）
  var spreads = [[0]];
  for (var i = 1; i < pageCount; i += 2) spreads.push(i + 1 < pageCount ? [i, i + 1] : [i]);

  var THUMB_HEIGHT = 96;
  var thumbScale = THUMB_HEIGHT / height;
  var thumbsOpen = false;

  var strip = document.createElement("nav");
  strip.id = "thumbs";
  strip.setAttribute("aria-label", "頁面縮圖");
  strip.hidden = true;
  var stripInner = document.createElement("div");
  stripInner.className = "fb-thumbs-inner";
  strip.appendChild(stripInner);

  var thumbButtons = spreads.map(function (spread) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "fb-thumb";
    var label = spread.length === 1 ? String(spread[0] + 1) : spread[0] + 1 + "–" + (spread[1] + 1);
    b.setAttribute("aria-label", "第 " + label + " 頁");
    var row = document.createElement("span");
    row.className = "fb-thumb-pages";
    spread.forEach(function (index) {
      var slot = document.createElement("span");
      slot.className = "fb-thumb-page";
      slot.style.width = width * thumbScale + "px";
      slot.style.height = THUMB_HEIGHT + "px";
      slot.dataset.index = String(index);
      row.appendChild(slot);
    });
    var caption = document.createElement("span");
    caption.className = "fb-thumb-label";
    caption.textContent = label;
    b.appendChild(row);
    b.appendChild(caption);
    b.addEventListener("click", function () { goTo(spread[0]); });
    stripInner.appendChild(b);
    return b;
  });
  document.body.appendChild(strip);

  /** 縮圖的內容 = 那一頁的標記縮小（同一份 .fb-scale，--s 換成縮圖的比例）；捲進縮圖列才建立。 */
  function fillThumb(button) {
    if (button.dataset.filled) return;
    button.dataset.filled = "1";
    button.querySelectorAll(".fb-thumb-page").forEach(function (slot) {
      var page = pages[Number(slot.dataset.index)];
      var copy = page.querySelector(":scope > .fb-scale").cloneNode(true);
      if (page.classList.contains("fb-fitted")) slot.classList.add("fb-fitted");
      // 縮圖不是頁面內容，不給輔助技術重複朗讀
      copy.setAttribute("aria-hidden", "true");
      slot.style.setProperty("--s", String(thumbScale));
      slot.appendChild(copy);
    });
  }

  var observer =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                fillThumb(entry.target);
                observer.unobserve(entry.target);
              }
            });
          },
          { root: strip, rootMargin: "0px 400px" }
        )
      : null;
  thumbButtons.forEach(function (b) {
    if (observer) observer.observe(b);
    else fillThumb(b);
  });

  /** 縮圖列標示目前的跨頁，並捲到看得到的地方。 */
  function updateThumbs() {
    var first = visibleRange()[0];
    thumbButtons.forEach(function (b, n) {
      var current = spreads[n].indexOf(first) !== -1;
      if (current) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
      if (current && thumbsOpen) {
        var left = b.offsetLeft - strip.clientWidth / 2 + b.offsetWidth / 2;
        strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
      }
    });
  }

  function setThumbsOpen(open) {
    thumbsOpen = open;
    strip.hidden = !open;
    document.body.classList.toggle("fb-thumbs-open", open);
    thumbsButton.setAttribute("aria-pressed", String(open));
    thumbsButton.title = open ? "隱藏頁面縮圖" : "頁面縮圖";
    // 翻頁區變矮了：讓 page-flip 與縮放重新計算（page-flip 自己聽 resize）
    window.dispatchEvent(new Event("resize"));
    updateThumbs();
  }

  // 滾輪的上下轉成左右捲動
  strip.addEventListener(
    "wheel",
    function (event) {
      if (event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      strip.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false }
  );

  function rangeLabel() {
    var range = visibleRange();
    return range[0] === range[1] ? String(range[0] + 1) : range[0] + 1 + "–" + (range[1] + 1);
  }

  function update() {
    var range = visibleRange();
    if (document.activeElement !== pageInput) pageInput.value = rangeLabel();
    // 寬度跟著內容（「12–13」比「1」寬），維持置中
    pageInput.style.width = Math.max(2, pageInput.value.length) + 0.5 + "ch";
    var atStart = range[0] === 0;
    var atEnd = range[1] === pageCount - 1;
    firstButton.disabled = prevButton.disabled = atStart;
    nextButton.disabled = lastButton.disabled = atEnd;
    updateThumbs();
  }

  /** 翻到某一頁（0 起算，超出範圍時夾回）；已經看得到就不動。 */
  function goTo(index) {
    index = Math.max(0, Math.min(pageCount - 1, index));
    var range = visibleRange();
    if (index >= range[0] && index <= range[1]) return;
    // 相鄰的跨頁用翻頁動畫，遠的直接跳過去（一頁一頁翻太久）
    var distance = index < range[0] ? range[0] - index : index - range[1];
    if (distance <= 2) flip.flip(index);
    else {
      flip.turnToPage(index);
      update();
    }
  }

  pageInput.addEventListener("focus", function () {
    pageInput.select();
  });
  pageInput.addEventListener("keydown", function (event) {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      var n = parseInt(pageInput.value.replace(/[^0-9]/g, ""), 10);
      pageInput.blur();
      if (n > 0) goTo(n - 1);
    } else if (event.key === "Escape") {
      pageInput.blur();
    }
  });
  pageInput.addEventListener("blur", update);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  document.addEventListener("fullscreenchange", function () {
    if (!fullscreenButton) return;
    var on = !!document.fullscreenElement;
    var label = on ? "結束全螢幕" : "全螢幕";
    fullscreenButton.title = label;
    fullscreenButton.setAttribute("aria-label", label);
    fullscreenButton.replaceChildren(icon(ICONS[on ? "exitFullscreen" : "enterFullscreen"]));
  });

  // ---- 目錄與搜尋 ----
  // 左側面板兩個分頁。目錄只列使用者改過名的頁面（Rust 標上 data-toc）；
  // 搜尋頁面上的文字（真文字才做得到），瀏覽器自己的尋找找不到沒顯示的頁。

  var panelOpen = false;
  var panel = document.createElement("aside");
  panel.id = "panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "目錄與搜尋");

  var panelHeader = document.createElement("div");
  panelHeader.className = "fb-panel-header";
  var tabList = document.createElement("div");
  tabList.setAttribute("role", "tablist");
  var tocTab = document.createElement("button");
  var searchTab = document.createElement("button");
  var tocView = document.createElement("div");
  var searchView = document.createElement("div");
  [
    [tocTab, tocView, "目錄", "toc"],
    [searchTab, searchView, "搜尋", "search"],
  ].forEach(function (item) {
    var tab = item[0];
    var view = item[1];
    tab.type = "button";
    tab.className = "fb-tab";
    tab.id = "fb-tab-" + item[3];
    tab.textContent = item[2];
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", "fb-view-" + item[3]);
    tab.addEventListener("click", function () { showTab(item[3]); });
    tabList.appendChild(tab);
    view.id = "fb-view-" + item[3];
    view.className = "fb-panel-view";
    view.setAttribute("role", "tabpanel");
    view.setAttribute("aria-labelledby", tab.id);
  });
  var panelClose = button("關閉（Esc）", "close", function () { setPanelOpen(false); });
  panelHeader.appendChild(tabList);
  panelHeader.appendChild(panelClose);
  panel.appendChild(panelHeader);
  panel.appendChild(tocView);
  panel.appendChild(searchView);
  document.body.appendChild(panel);

  /** 一列：左邊文字、右邊頁碼；按下翻到那一頁。 */
  function listItem(onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "fb-list-item";
    b.addEventListener("click", onClick);
    return b;
  }

  function span(className, text) {
    var s = document.createElement("span");
    s.className = className;
    s.textContent = text;
    return s;
  }

  // 目錄
  var tocEntries = pages
    .map(function (page, index) { return { page: page, index: index }; })
    .filter(function (entry) { return entry.page.hasAttribute("data-toc"); });
  if (tocEntries.length === 0) {
    tocView.appendChild(span("fb-empty", "這本書沒有目錄：頁面都是預設名稱（在編輯器裡替頁面改名，就會列在這裡）。"));
  } else {
    var tocList = document.createElement("div");
    tocList.className = "fb-list";
    tocEntries.forEach(function (entry) {
      var item = listItem(function () { goTo(entry.index); });
      item.appendChild(span("fb-list-text", entry.page.dataset.name));
      item.appendChild(span("fb-list-page", String(entry.index + 1)));
      tocList.appendChild(item);
    });
    tocView.appendChild(tocList);
  }

  // 搜尋
  var SEARCH_LIMIT = 300;
  var SNIPPET_CONTEXT = 18;
  var searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "fb-search-input";
  searchInput.placeholder = "搜尋文字";
  searchInput.setAttribute("aria-label", "搜尋文字");
  searchInput.autocomplete = "off";
  var searchStatus = document.createElement("p");
  searchStatus.className = "fb-search-status";
  searchStatus.setAttribute("aria-live", "polite");
  var searchResults = document.createElement("div");
  searchResults.className = "fb-list";
  searchView.appendChild(searchInput);
  searchView.appendChild(searchStatus);
  searchView.appendChild(searchResults);

  /**
   * 比對用的文字：NFKC（全形半形）、不分大小寫、連續空白當一個。
   * @returns {{text: string, map: number[]}} map[i] = 比對文字第 i 個字元在原文的位置
   */
  function normalize(raw) {
    var text = "";
    var map = [];
    var lastSpace = false;
    for (var i = 0; i < raw.length; ) {
      var code = raw.codePointAt(i);
      var ch = String.fromCodePoint(code);
      var width = ch.length;
      if (/\s/.test(ch)) {
        if (!lastSpace) {
          text += " ";
          map.push(i);
        }
        lastSpace = true;
      } else {
        var n = ch.normalize("NFKC").toLowerCase();
        for (var k = 0; k < n.length; k++) map.push(i);
        text += n;
        lastSpace = false;
      }
      i += width;
    }
    map.push(raw.length);
    return { text: text, map: map };
  }

  // 每個文字框一筆（文字物件、圖形內文字、頁碼）；第一次搜尋時才建立
  var searchIndex = null;
  function buildIndex() {
    searchIndex = [];
    pages.forEach(function (page, index) {
      page.querySelectorAll(".fb-scale .el.t").forEach(function (el) {
        // 每行是一個 <div>；行與行直接接起來（中文的換行不是空白）
        var raw = Array.prototype.map.call(el.querySelectorAll(":scope > div"), function (line) { return line.textContent; }).join("");
        searchIndex.push({ page: index, el: el, raw: raw, norm: normalize(raw) });
      });
    });
  }

  var hits = [];
  var currentHit = -1;

  function clearHighlight() {
    document.querySelectorAll(".fb-hit").forEach(function (el) { el.classList.remove("fb-hit"); });
  }

  function runSearch() {
    if (!searchIndex) buildIndex();
    var query = normalize(searchInput.value.trim()).text;
    hits = [];
    currentHit = -1;
    clearHighlight();
    searchResults.replaceChildren();
    if (query === "") {
      searchStatus.textContent = "";
      return;
    }
    var total = 0;
    searchIndex.forEach(function (entry) {
      var from = 0;
      for (;;) {
        var at = entry.norm.text.indexOf(query, from);
        if (at === -1) break;
        total++;
        if (hits.length < SEARCH_LIMIT) {
          hits.push({ entry: entry, start: entry.norm.map[at], end: entry.norm.map[at + query.length] });
        }
        from = at + query.length;
      }
    });
    hits.sort(function (a, b) { return a.entry.page - b.entry.page; });
    searchStatus.textContent =
      total === 0 ? "找不到「" + searchInput.value.trim() + "」" : total > SEARCH_LIMIT ? "找到 " + total + " 處，只列出前 " + SEARCH_LIMIT + " 處" : "找到 " + total + " 處";
    hits.forEach(function (hit, n) {
      var raw = hit.entry.raw;
      var before = raw.slice(Math.max(0, hit.start - SNIPPET_CONTEXT), hit.start);
      var after = raw.slice(hit.end, hit.end + SNIPPET_CONTEXT);
      var item = listItem(function () { showHit(n); });
      var text = span("fb-list-text", "");
      text.appendChild(document.createTextNode((hit.start > SNIPPET_CONTEXT ? "…" : "") + before));
      var mark = document.createElement("mark");
      mark.textContent = raw.slice(hit.start, hit.end);
      text.appendChild(mark);
      text.appendChild(document.createTextNode(after + (hit.end + SNIPPET_CONTEXT < raw.length ? "…" : "")));
      item.appendChild(text);
      item.appendChild(span("fb-list-page", String(hit.entry.page + 1)));
      searchResults.appendChild(item);
    });
  }

  /** 翻到第 n 個結果並標示那個文字框。 */
  function showHit(n) {
    if (hits.length === 0) return;
    currentHit = (n + hits.length) % hits.length;
    clearHighlight();
    hits[currentHit].entry.el.classList.add("fb-hit");
    searchResults.querySelectorAll(".fb-list-item").forEach(function (item, k) {
      if (k === currentHit) {
        item.setAttribute("aria-current", "true");
        item.scrollIntoView({ block: "nearest" });
      } else item.removeAttribute("aria-current");
    });
    goTo(hits[currentHit].entry.page);
  }

  var searchTimer = 0;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 150);
  });
  searchInput.addEventListener("keydown", function (event) {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      // Enter 下一個結果、Shift+Enter 上一個
      clearTimeout(searchTimer);
      if (searchInput.dataset.searched !== searchInput.value) {
        runSearch();
        searchInput.dataset.searched = searchInput.value;
        showHit(0);
      } else showHit(currentHit + (event.shiftKey ? -1 : 1));
      event.preventDefault();
    } else if (event.key === "Escape") {
      setPanelOpen(false);
      event.preventDefault();
    }
  });

  function showTab(name) {
    var search = name === "search";
    tocTab.setAttribute("aria-selected", String(!search));
    searchTab.setAttribute("aria-selected", String(search));
    tocTab.tabIndex = search ? -1 : 0;
    searchTab.tabIndex = search ? 0 : -1;
    tocView.hidden = search;
    searchView.hidden = !search;
    if (search) searchInput.focus();
  }
  // 分頁列 ← →
  tabList.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    var next = document.activeElement === tocTab ? searchTab : tocTab;
    showTab(next === searchTab ? "search" : "toc");
    next.focus();
    event.preventDefault();
    event.stopPropagation();
  });
  // 沒有目錄時先顯示搜尋
  showTab(tocEntries.length === 0 ? "search" : "toc");
  searchInput.blur();

  function setPanelOpen(open, tab) {
    if (tab) showTab(tab);
    if (open === panelOpen) {
      if (open && tab === "search") searchInput.select();
      return;
    }
    panelOpen = open;
    panel.hidden = !open;
    document.body.classList.toggle("fb-panel-open", open);
    panelButton.setAttribute("aria-pressed", String(open));
    window.dispatchEvent(new Event("resize"));
    if (open) {
      if (!searchView.hidden) searchInput.focus();
      else (tabList.querySelector('[aria-selected="true"]') || tocTab).focus();
    } else {
      clearHighlight();
      panelButton.focus();
    }
  }

  panel.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      setPanelOpen(false);
      event.preventDefault();
    }
    // 面板裡的按鍵不翻頁（← → 在分頁列切換，其他鍵照瀏覽器預設）
    if (event.target !== document.body) event.stopPropagation();
  });

  // ---- 放大檢視 ----
  // 翻頁區不能選取文字（page-flip 在 mousedown 時 preventDefault），所以放大是另一層：
  // 目前看到的頁複製一份，可以捲動、縮放、選取文字。

  var ZOOM_MAX = 4; // 每 pt 幾 px（400%）
  var ZOOM_STEP = 1.25;
  var zoomOpen = false;
  var zoom = 1;
  var zoomRange = [0, 0];

  var zoomLayer = document.createElement("div");
  zoomLayer.id = "zoom";
  zoomLayer.hidden = true;
  zoomLayer.setAttribute("role", "dialog");
  zoomLayer.setAttribute("aria-modal", "true");
  zoomLayer.setAttribute("aria-label", "放大檢視");

  var zoomBar = document.createElement("div");
  zoomBar.className = "fb-zoom-bar";
  zoomBar.setAttribute("role", "toolbar");
  var zoomPrev = button("上一頁", "prev", function () { zoomTurn(-1); });
  var zoomPages = document.createElement("span");
  zoomPages.className = "fb-zoom-pages";
  var zoomNext = button("下一頁", "next", function () { zoomTurn(1); });
  var zoomOutButton = button("縮小（-）", "zoomOut", function () { setZoom(zoom / ZOOM_STEP); });
  var zoomLabel = document.createElement("span");
  zoomLabel.className = "fb-zoom-label";
  zoomLabel.setAttribute("aria-live", "polite");
  var zoomInButton = button("放大（+）", "zoomIn", function () { setZoom(zoom * ZOOM_STEP); });
  var zoomFitButton = button("符合寬度（0）", "fitWidth", function () { setZoom(fitWidthZoom()); });
  var zoomCloseButton = button("關閉放大檢視（Esc）", "close", function () { closeZoom(); });
  function zoomDivider() {
    var d = document.createElement("span");
    d.className = "fb-divider";
    return d;
  }
  [zoomPrev, zoomPages, zoomNext, zoomDivider(), zoomOutButton, zoomLabel, zoomInButton, zoomFitButton, zoomDivider(), zoomCloseButton].forEach(
    function (el) { zoomBar.appendChild(el); }
  );

  var zoomScroller = document.createElement("div");
  zoomScroller.className = "fb-zoom-scroll";
  zoomScroller.tabIndex = -1;
  var zoomSpread = document.createElement("div");
  zoomSpread.className = "fb-zoom-spread";
  zoomScroller.appendChild(zoomSpread);
  zoomLayer.appendChild(zoomScroller);
  zoomLayer.appendChild(zoomBar);
  document.body.appendChild(zoomLayer);

  var ZOOM_PADDING = 24; // 捲動區四邊留白（px），上方另外讓出工具列
  var ZOOM_BAR_SPACE = 64;

  function spreadWidthPt() {
    return width * (zoomRange[1] - zoomRange[0] + 1);
  }
  /** 跨頁寬度剛好放滿畫面寬的倍率。 */
  function fitWidthZoom() {
    return (zoomScroller.clientWidth - ZOOM_PADDING * 2) / spreadWidthPt();
  }
  /** 整個跨頁放得進畫面的倍率（最小倍率）。 */
  function fitPageZoom() {
    var h = (zoomScroller.clientHeight - ZOOM_PADDING - ZOOM_BAR_SPACE) / height;
    return Math.min(fitWidthZoom(), h);
  }

  /** 放進目前看到的頁（從初始化前留下的頁面複製）。 */
  function fillZoom() {
    zoomSpread.replaceChildren();
    for (var index = zoomRange[0]; index <= zoomRange[1]; index++) {
      var slot = document.createElement("div");
      slot.className = pages[index].classList.contains("fb-fitted") ? "fb-zoom-page fb-fitted" : "fb-zoom-page";
      slot.appendChild(pages[index].querySelector(":scope > .fb-scale").cloneNode(true));
      zoomSpread.appendChild(slot);
    }
    var label = zoomRange[0] === zoomRange[1] ? String(zoomRange[0] + 1) : zoomRange[0] + 1 + "–" + (zoomRange[1] + 1);
    zoomPages.textContent = label + " / " + pageCount;
    zoomPrev.disabled = zoomRange[0] === 0;
    zoomNext.disabled = zoomRange[1] === pageCount - 1;
  }

  /**
   * 改倍率，讓錨點（捲動區裡的位置，px；預設是畫面中心）下的內容保持不動。
   */
  function setZoom(next, anchorX, anchorY) {
    next = Math.max(fitPageZoom(), Math.min(ZOOM_MAX, next));
    var box = zoomScroller.getBoundingClientRect();
    var ax = anchorX === undefined ? zoomScroller.clientWidth / 2 : anchorX;
    var ay = anchorY === undefined ? zoomScroller.clientHeight / 2 : anchorY;
    var before = zoomSpread.getBoundingClientRect();
    var ptX = (box.left + ax - before.left) / zoom;
    var ptY = (box.top + ay - before.top) / zoom;
    zoom = next;
    zoomSpread.style.setProperty("--s", String(zoom));
    zoomSpread.querySelectorAll(".fb-zoom-page").forEach(function (slot) {
      slot.style.width = width * zoom + "px";
      slot.style.height = height * zoom + "px";
    });
    var after = zoomSpread.getBoundingClientRect();
    zoomScroller.scrollLeft += after.left + ptX * zoom - (box.left + ax);
    zoomScroller.scrollTop += after.top + ptY * zoom - (box.top + ay);
    zoomLabel.textContent = Math.round(zoom * 100) + "%";
    zoomOutButton.disabled = zoom <= fitPageZoom() + 1e-6;
    zoomInButton.disabled = zoom >= ZOOM_MAX - 1e-6;
    keepZoomFocus();
  }

  /** 按著的按鈕停用了（到最大 / 最後一頁）時，焦點會掉到 body；改放回捲動區。 */
  function keepZoomFocus() {
    var active = document.activeElement;
    if (zoomOpen && (!active || active === document.body || active.disabled)) zoomScroller.focus();
  }

  function openZoom() {
    if (zoomOpen) return;
    zoomOpen = true;
    zoomRange = visibleRange();
    zoomLayer.hidden = false;
    fillZoom();
    // 先放到最小再設成符合寬度，捲動位置從左上開始
    zoom = 1;
    setZoom(fitWidthZoom());
    zoomScroller.scrollTop = 0;
    zoomScroller.scrollLeft = 0;
    zoomScroller.focus();
  }

  function closeZoom() {
    if (!zoomOpen) return;
    zoomOpen = false;
    zoomLayer.hidden = true;
    zoomSpread.replaceChildren();
    zoomButton.focus();
  }

  /** 放大檢視裡換到前 / 後一個跨頁：書也直接翻過去（不播動畫），倍率不變。 */
  function zoomTurn(direction) {
    var target = direction < 0 ? zoomRange[0] - 1 : zoomRange[1] + 1;
    if (target < 0 || target >= pageCount) return;
    flip.turnToPage(target);
    update();
    zoomRange = visibleRange();
    fillZoom();
    setZoom(zoom);
    zoomScroller.scrollTop = 0;
    zoomScroller.scrollLeft = 0;
  }

  // Ctrl + 滾輪：以游標為中心縮放（不讓瀏覽器縮放整頁）
  zoomScroller.addEventListener(
    "wheel",
    function (event) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      var box = zoomScroller.getBoundingClientRect();
      setZoom(event.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP, event.clientX - box.left, event.clientY - box.top);
    },
    { passive: false }
  );

  window.addEventListener("resize", function () {
    if (zoomOpen) setZoom(zoom);
  });

  /** 放大檢視開著時的按鍵；方向鍵交給捲動區（捲動，不翻頁）。 */
  function zoomKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Tab") {
      // 焦點留在放大檢視裡（後面的工具列、縮圖看不到）
      var focusables = [zoomScroller].concat(
        Array.prototype.filter.call(zoomBar.querySelectorAll("button"), function (b) { return !b.disabled; })
      );
      var at = focusables.indexOf(document.activeElement);
      var next = (at + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
      focusables[at === -1 ? 0 : next].focus();
      event.preventDefault();
      return;
    }
    switch (event.key) {
      case "Escape":
        closeZoom();
        break;
      case "+":
      case "=":
        setZoom(zoom * ZOOM_STEP);
        break;
      case "-":
        setZoom(zoom / ZOOM_STEP);
        break;
      case "0":
        setZoom(fitWidthZoom());
        break;
      case "PageUp":
        zoomTurn(-1);
        break;
      case "PageDown":
        zoomTurn(1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  // ---- 鍵盤 ----

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented) return;
    if (zoomOpen) {
      zoomKey(event);
      return;
    }
    // Ctrl+F：用書的搜尋（瀏覽器的尋找找不到沒顯示的頁）
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === "KeyF") {
      setPanelOpen(true, "search");
      event.preventDefault();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // 在輸入框裡由輸入框自己處理（← → 要移動游標）
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key) {
      case "ArrowLeft":
      case "PageUp":
        flip.flipPrev();
        break;
      case "ArrowRight":
      case "PageDown":
        flip.flipNext();
        break;
      case "Home":
        goTo(0);
        break;
      case "End":
        goTo(pageCount - 1);
        break;
      case "z":
      case "Z":
        openZoom();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  // ---- 事件 ----

  flip.on("flip", update);
  flip.on("changeOrientation", function () {
    rescale();
    update();
  });
  flip.on("update", rescale);
  window.addEventListener("resize", function () {
    // page-flip 自己也在 resize 時重算，等它算完再讀
    requestAnimationFrame(rescale);
  });

  rescale();
  update();
})();
