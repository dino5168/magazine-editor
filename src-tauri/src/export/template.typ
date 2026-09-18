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

// 以左上角為定位點的物件：text / rect / image
#let at-corner(el, body) = place(top + left, dx: pt(el.x), dy: pt(el.y), rotated(el, top + left, body))

// 以中心為定位點的物件：ellipse / polygon / star（外框 2rx × 2ry）
#let at-center(el, body) = place(
  top + left,
  dx: pt(el.x - el.rx),
  dy: pt(el.y - el.ry),
  rotated(el, center + horizon, box(width: pt(2 * el.rx), height: pt(2 * el.ry), body)),
)

#let draw(el) = {
  if el.kind == "text" {
    at-corner(el, draw-text(el))
  } else if el.kind == "rect" {
    at-corner(el, rect(width: pt(el.width), height: pt(el.height), radius: pt(el.radius), fill: rgb(el.fill), stroke: none))
  } else if el.kind == "image" {
    at-corner(el, image(el.src, width: pt(el.width), height: pt(el.height), fit: "stretch"))
  } else if el.kind == "ellipse" {
    at-center(el, ellipse(width: pt(2 * el.rx), height: pt(2 * el.ry), fill: rgb(el.fill), stroke: none))
  } else if el.kind == "polygon" {
    // 頂點座標以中心為原點，換算成外框左上角為原點
    let points = el.points.map(p => (pt(p.at(0) + el.rx), pt(p.at(1) + el.ry)))
    at-center(el, place(top + left, polygon(fill: rgb(el.fill), stroke: none, ..points)))
  }
}

#for p in data.pages {
  page(width: pt(p.width), height: pt(p.height), margin: 0pt, fill: rgb(p.background), {
    for el in p.elements { draw(el) }
  })
}
