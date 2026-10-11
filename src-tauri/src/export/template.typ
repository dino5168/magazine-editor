// 匯出 PDF 的模板：繪製 Rust 產生的 data.json（見 export/mod.rs 的 build_data）。
// 使用者輸入的文字只以 JSON 字串出現，不會被當成 Typst 程式碼執行。
// 座標與編輯器相同：單位 pt、原點在頁面左上角、y 向下；陣列 index 0 在最底層。

#let data = json("data.json")
#let pt(value) = value * 1pt

#set document(title: data.title)
// 換行位置已由編輯器決定（每行一個 box，不會再斷行）；
// 關掉 Typst 會改變字元位置的中文排版調整，讓字距和瀏覽器一致
#set text(lang: "zh", region: "tw", cjk-latin-spacing: none, overhang: false)

#let alignments = (left: left, center: center, right: right)

// Konva 的 rotation 是以定位點為中心順時針旋轉
#let rotated(el, origin, body) = {
  if el.rotation == 0 { body } else { rotate(el.rotation * 1deg, origin: origin, reflow: false, body) }
}

// 一行文字。top-edge / bottom-edge 設為 baseline：box 的上緣就是基線，dy 直接對應編輯器算出的基線位置
// 字距：編輯器（Konva）有字距時一個字一個字畫（每個字單獨量寬，沒有 kerning 與連字），
// 這裡也把每個字（grapheme cluster）分開，中間放固定的 h(字距)。不用 Typst 的 tracking：
// 它在換字型的地方（拉丁 ↔ 中文）會少加一個字距，中英混排就和畫布對不上。
// 每行的起點由 Rust 用編輯器量到的行寬算好（lineStarts），靠左放在那裡，不交給 Typst 對齊
#let line-content(el, line) = if el.letterSpacing == 0 { line } else {
  line.clusters().map(c => [#c]).join(h(pt(el.letterSpacing)))
}

#let text-line(el, i, line, paint, dx, dy) = {
  let body = box(text(
    font: el.fonts,
    size: pt(el.size),
    weight: if el.bold { "bold" } else { "regular" },
    fill: paint,
    top-edge: "baseline",
    bottom-edge: "baseline",
    line-content(el, line),
  ))
  // 斜體：沒有斜體字型檔，照瀏覽器的模擬斜體以基線為軸斜切（Typst 不會自己模擬）
  let body = if el.slant == 0 { body } else { skew(ax: -calc.atan(el.slant), origin: top + left, reflow: false, body) }
  let y = pt(el.baseline + i * el.lineHeight + dy)
  if el.lineStarts == none {
    place(top + alignments.at(el.align), dx: pt(dx), dy: y, body)
  } else {
    place(top + left, dx: pt(el.lineStarts.at(i) + dx), dy: y, body)
  }
}

// 底線 / 刪除線：位置與長度由 Rust 照 Konva 的公式算好（render.rs 的 decoration_lines）
#let decoration(el, d, paint, dx, dy) = place(top + left, line(
  start: (pt(d.x + dx), pt(d.y + dy)),
  end: (pt(d.x + d.length + dx), pt(d.y + dy)),
  stroke: (paint: paint, thickness: pt(el.decorationThickness), cap: "butt"),
))

// 和 Konva 每一行的繪製順序相同：底線 → 文字 → 刪除線
#let line-parts(el, i, line, paint, dx, dy) = {
  for d in el.decorations.filter(d => d.line == i and d.kind == "underline") { decoration(el, d, paint, dx, dy) }
  text-line(el, i, line, paint, dx, dy)
  for d in el.decorations.filter(d => d.line == i and d.kind == "strikethrough") { decoration(el, d, paint, dx, dy) }
}

#let draw-text(el) = block(width: pt(el.width), height: pt(el.lines.len() * el.lineHeight), {
  let shadow = el.shadow
  // 有底線 / 刪除線時，Konva 先把整段文字畫好再投一個陰影：所有陰影在最下面
  if shadow != none and shadow.wholeBlock {
    for (i, line) in el.lines.enumerate() { line-parts(el, i, line, rgb(shadow.color), shadow.dx, shadow.dy) }
  }
  for (i, line) in el.lines.enumerate() {
    // 沒有線時每一行各自投陰影，緊接在該行之前
    if shadow != none and not shadow.wholeBlock { line-parts(el, i, line, rgb(shadow.color), shadow.dx, shadow.dy) }
    line-parts(el, i, line, rgb(el.fill), 0, 0)
  }
})

// 所有物件都以外框左上角為定位點，旋轉也繞左上角
#let at-corner(el, body) = place(top + left, dx: pt(el.x), dy: pt(el.y), rotated(el, top + left, body))

// 邊框：畫在外框線的中心（和 Konva 相同）；虛線與點線的數字由 Rust 算好（render.rs 的 dash_pattern）
#let stroke-of(s) = if s == none { none } else {
  (
    paint: rgb(s.color),
    thickness: pt(s.width),
    cap: s.cap,
    join: "miter",
    miter-limit: s.miterLimit,
    dash: if s.dash == none { none } else { (array: s.dash.map(pt), phase: 0pt) },
  )
}

#let xy(s, i) = (pt(s.at(i)), pt(s.at(i + 1)))
#let path-segment(s) = if s.at(0) == "m" {
  curve.move(xy(s, 1))
} else if s.at(0) == "l" {
  curve.line(xy(s, 1))
} else {
  curve.cubic(xy(s, 1), xy(s, 3), xy(s, 5))
}

#let draw(el) = {
  if el.kind == "text" {
    at-corner(el, draw-text(el))
  } else if el.kind == "rect" {
    at-corner(el, rect(width: pt(el.width), height: pt(el.height), radius: pt(el.radius), fill: rgb(el.fill), stroke: stroke-of(el.stroke)))
  } else if el.kind == "image" {
    at-corner(el, image(el.src, width: pt(el.width), height: pt(el.height), fit: "stretch"))
  } else if el.kind == "ellipse" {
    at-corner(el, ellipse(width: pt(el.width), height: pt(el.height), fill: rgb(el.fill), stroke: stroke-of(el.stroke)))
  } else if el.kind == "polygon" {
    // 頂點座標以外框左上角為原點；box 讓旋轉以外框為範圍
    let points = el.points.map(p => (pt(p.at(0)), pt(p.at(1))))
    at-corner(el, box(width: pt(el.width), height: pt(el.height), place(top + left, polygon(fill: rgb(el.fill), stroke: stroke-of(el.stroke), ..points))))
  } else if el.kind == "path" {
    // 有邊框的矩形 / 橢圓：路徑由 Rust 算好（起點與方向和畫布相同，虛線才會落在同樣位置）
    at-corner(el, box(width: pt(el.width), height: pt(el.height), place(top + left, curve(
      fill: rgb(el.fill),
      stroke: stroke-of(el.stroke),
      ..el.segments.map(path-segment),
      curve.close(mode: "straight"),
    ))))
  }
}

#for p in data.pages {
  page(width: pt(p.width), height: pt(p.height), margin: 0pt, fill: rgb(p.background), {
    for el in p.elements { draw(el) }
  })
}
