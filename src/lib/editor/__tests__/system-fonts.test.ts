import { describe, expect, it } from "vitest";
import type { SystemFont } from "@/lib/project/project-types";
import { filterSystemFontFamilies, groupSystemFonts, pairFaces } from "../system-fonts";

let next = 0;
function face(overrides: Partial<SystemFont>): SystemFont {
  next += 1;
  return {
    id: `id-${next}`,
    file: "font.ttf",
    source: "system",
    index: 0,
    family: "Family",
    cssFamily: "Family",
    aliases: ["Family"],
    style: "Regular",
    weight: 400,
    italic: false,
    hasChinese: false,
    problem: null,
    ...overrides,
  };
}

/** The 微軟正黑體 faces as listed on Windows 11 (three collections). */
const jhenghei = (weight: number, file: string) =>
  face({ family: "微軟正黑體", cssFamily: "Microsoft JhengHei", aliases: ["Microsoft JhengHei", "微軟正黑體"], weight, file, hasChinese: true });

describe("pairFaces", () => {
  it("picks the faces closest to 400 and 700", () => {
    const light = jhenghei(290, "msjhl.ttc");
    const regular = jhenghei(400, "msjh.ttc");
    const bold = jhenghei(700, "msjhbd.ttc");
    expect(pairFaces([light, bold, regular])).toEqual({ regular, bold });
  });

  it("has no bold when nothing is heavy enough, and never pairs a face with itself", () => {
    const only = face({ weight: 400 });
    expect(pairFaces([only])).toEqual({ regular: only, bold: null });
    const medium = face({ weight: 500 });
    expect(pairFaces([only, medium]).bold).toBeNull();
    const heavy = face({ weight: 700 });
    expect(pairFaces([heavy])).toEqual({ regular: heavy, bold: null });
  });

  it("skips italic and unusable faces", () => {
    const italic = face({ weight: 400, italic: true });
    const variable = face({ weight: 400, problem: "可變字型（Variable Font）不能使用" });
    const semibold = face({ weight: 600 });
    const black = face({ weight: 900 });
    expect(pairFaces([italic, variable, semibold, black])).toEqual({ regular: semibold, bold: black });
  });

  it("prefers the lighter face on a tie, then the user's own copy", () => {
    const below = face({ weight: 350 });
    const above = face({ weight: 450 });
    expect(pairFaces([above, below]).regular).toBe(below);
    const system = face({ weight: 400 });
    const user = face({ weight: 400, source: "user" });
    expect(pairFaces([system, user]).regular).toBe(user);
  });
});

describe("groupSystemFonts", () => {
  it("groups faces of different files by family; Chinese names sort first", () => {
    const families = groupSystemFonts([
      jhenghei(700, "msjhbd.ttc"),
      face({ family: "標楷體", cssFamily: "DFKai-SB", hasChinese: true }),
      jhenghei(400, "msjh.ttc"),
      jhenghei(290, "msjhl.ttc"),
      face({ family: "Microsoft JhengHei UI", cssFamily: "Microsoft JhengHei UI", weight: 400 }),
    ]);
    expect(families.map((family) => family.family)).toEqual(["微軟正黑體", "標楷體", "Microsoft JhengHei UI"]);
    const jh = families[0];
    expect(jh.faces.map((f) => f.weight)).toEqual([290, 400, 700]);
    expect([jh.regular?.file, jh.bold?.file, jh.problem, jh.hasChinese]).toEqual(["msjh.ttc", "msjhbd.ttc", null, true]);
    expect(families[1].bold).toBeNull();
  });

  it("explains families that cannot be added", () => {
    const [family] = groupSystemFonts([face({ family: "Noto Sans TC", cssFamily: "Noto Sans TC", problem: "可變字型（Variable Font）不能使用" })]);
    expect([family.regular, family.problem]).toEqual([null, "可變字型（Variable Font）不能使用"]);
    const [italicOnly] = groupSystemFonts([face({ italic: true })]);
    expect(italicOnly.problem).toContain("非斜體");
  });
});

describe("filterSystemFontFamilies", () => {
  const families = groupSystemFonts([
    jhenghei(400, "msjh.ttc"),
    face({ family: "標楷體", cssFamily: "DFKai-SB", aliases: ["DFKai-SB", "標楷體"], hasChinese: true }),
    face({ family: "Segoe UI", cssFamily: "Segoe UI", aliases: ["Segoe UI"] }),
  ]);

  it("matches any family name, ignoring case, spaces and width", () => {
    const names = (query: string, chineseOnly = false) => filterSystemFontFamilies(families, query, chineseOnly).map((f) => f.family);
    expect(names("正黑")).toEqual(["微軟正黑體"]);
    expect(names("jhenghei")).toEqual(["微軟正黑體"]);
    expect(names("microsoftjheng")).toEqual(["微軟正黑體"]);
    expect(names("ＤＦＫＡＩ")).toEqual(["標楷體"]);
    expect(names("")).toHaveLength(3);
    expect(names("", true)).toEqual(["微軟正黑體", "標楷體"]);
    expect(names("segoe", true)).toEqual([]);
  });
});
