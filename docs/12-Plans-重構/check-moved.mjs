// 「資訊沒遺失檢查」：舊版文件裡的每個 `反引號識別字`，在新的配置裡還找得到嗎？
// 用法（repo 根目錄）：node docs/12-Plans-重構/check-moved.mjs [基準 commit，預設 5d546a5]
// 嚴格範圍 = 根 CLAUDE.md + .claude/rules + .claude/skills（Claude 會自動 / 依需要載入的）
// 寬鬆範圍 = 嚴格範圍 + docs/**/*.md（計畫文件、progress、archive）
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const base = process.argv[2] ?? "5d546a5"
const show = (path) => execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8", maxBuffer: 1 << 26 })

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, ext, out)
    else if (path.endsWith(ext)) out.push(path)
  }
  return out
}
const read = (paths) => paths.map((p) => readFileSync(p, "utf8")).join("\n")

function identifiers(text) {
  const found = new Set()
  for (const [, code] of text.matchAll(/`([^`\n]+)`/g)) {
    const s = code.trim()
    if (s.length >= 3) found.add(s)
  }
  return found
}

const strict = read(["CLAUDE.md", ...walk(".claude/rules", ".md"), ...walk(".claude/skills", ".md")])
const loose = strict + "\n" + read(walk("docs", ".md"))

for (const source of ["CLAUDE.md", "docs/progress.md"]) {
  const ids = [...identifiers(show(source))]
  const missingStrict = ids.filter((id) => !strict.includes(id))
  const missingLoose = ids.filter((id) => !loose.includes(id))
  console.log(`\n== ${source}（${base}）：${ids.length} 個識別字`)
  console.log(`嚴格範圍找不到：${missingStrict.length}`)
  console.log(`寬鬆範圍也找不到：${missingLoose.length}`)
  for (const id of missingLoose) console.log(`  - ${id}`)
}
