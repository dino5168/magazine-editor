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

#let draw-text(el) = block(width: pt(el.width), height: pt(el.lines.len() * el.lineHeight), {
  for (i, line) in el.lines.enumerate() {
    // top-edge / bottom-edge 設為 baseline：文字框的上緣就是基線，dy 直接對應編輯器算出的基線位置
    place(
      top + alignments.at(el.align),
      dy: pt(el.baseline + i * el.lineHeight),
      box(text(
        font: el.fonts,
        size: pt(el.size),
        weight: if el.bold { "bold" } else { "regular" },
        fill: rgb(el.fill),
        top-edge: "baseline",
        bottom-edge: "baseline",
        line,
      )),
    )
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
