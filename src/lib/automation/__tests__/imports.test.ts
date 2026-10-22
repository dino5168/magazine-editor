import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/editor/editor-reducer";
import { createBlankDocument } from "@/lib/editor/element-factory";
import type { Result } from "@/lib/editor/validation";
import type { ImageItem, Library } from "@/lib/library/types";
import type { ImportFileOptions, ImportedItem } from "@/lib/library/use-library-import";
import type { ImportFileFn } from "../run-tool";
import { NO_COMMANDS, toolSession } from "./tool-session";
import libraryJson from "../../../../tests/fixtures/sample-library.json?raw";

const library = JSON.parse(libraryJson) as Library;
const state = createInitialState(createBlankDocument());

const newItem: ImageItem = {
  id: "i-new",
  kind: "image",
  name: "cover",
  src: "assets/images/55555555555555555555555555555555.png",
  bytes: 1234,
  folderId: "f-people",
  importedAt: "2026-10-22T00:00:00.000Z",
  trashed: null,
  width: 1600,
  height: 900,
};

/** A session whose attached file and importer are fakes that record what they were given. */
function importSession(result: Result<ImportedItem>, attached: Result<File> | null = { data: new File(["x"], "cover.png"), error: null }) {
  const calls: { file: File; options: ImportFileOptions }[] = [];
  const importFile: ImportFileFn = async (file, options) => {
    calls.push({ file, options });
    return result;
  };
  const session = toolSession(state, NO_COMMANDS, library, {
    attachedFile: attached === null ? null : async () => attached,
    importFile,
  });
  return { session, calls };
}

const PATH = "C:\\images\\cover.png";

describe("import_library_item", () => {
  it("imports the attached image as an image only, and reports the item like list_library_items", async () => {
    const { session, calls } = importSession({ data: { item: newItem, outcome: "new" }, error: null });
    const result = await session.callAsync("import_library_item", { path: PATH, folderId: "f-people", name: "封面" });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({
      itemId: "i-new",
      id: "i-new",
      name: "cover",
      kind: "image",
      folder: "封面 / 人物",
      bytes: 1234,
      trashed: false,
      width: 1600,
      height: 900,
      status: "new",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].file.name).toBe("cover.png");
    expect(calls[0].options).toEqual({ folderId: "f-people", accept: ["image"], name: "封面" });
    // 素材庫不在編輯器的復原歷史裡：文件不變
    expect(session.state).toBe(state);
  });

  it("imports into 未分類 by default and names duplicate / restored items", async () => {
    const existing = library.items.find((item) => item.id === "i-unsorted")!;
    const duplicate = importSession({ data: { item: existing, outcome: "duplicate" }, error: null });
    const dup = await duplicate.session.callAsync("import_library_item", { path: PATH });
    expect(dup.data).toMatchObject({ itemId: "i-unsorted", folder: null, status: "duplicate" });
    expect(duplicate.calls[0].options).toEqual({ folderId: null, accept: ["image"], name: undefined });

    const restored = importSession({ data: { item: { ...newItem, folderId: null }, outcome: "restore" }, error: null });
    expect((await restored.session.callAsync("import_library_item", { path: PATH })).data).toMatchObject({ status: "restored" });
  });

  it("passes the importer's reason on, and checks the folder before taking the file", async () => {
    const bad = importSession({ data: null, error: new Error("「cover.png」無法讀取圖片") });
    expect((await bad.session.callAsync("import_library_item", { path: PATH })).error?.message).toBe("「cover.png」無法讀取圖片");

    const unknown = importSession({ data: { item: newItem, outcome: "new" }, error: null });
    const message = (await unknown.session.callAsync("import_library_item", { path: PATH, folderId: "f-nope" })).error?.message;
    expect(message).toContain("f-nope");
    expect(message).toContain("list_library_items");
    expect(unknown.calls).toHaveLength(0);
  });

  it("explains a missing or expired attachment", async () => {
    const none = importSession({ data: { item: newItem, outcome: "new" }, error: null }, null);
    expect((await none.session.callAsync("import_library_item", { path: PATH })).error?.message).toContain("絕對路徑");
    const expired = importSession({ data: { item: newItem, outcome: "new" }, error: null }, { data: null, error: new Error("無法取得檔案：附件已經用過或過期") });
    expect((await expired.session.callAsync("import_library_item", { path: PATH })).error?.message).toContain("過期");
    expect(expired.calls).toHaveLength(0);
  });

  it("validates the arguments and only runs on its own", async () => {
    const { session } = importSession({ data: { item: newItem, outcome: "new" }, error: null });
    expect((await session.callAsync("import_library_item", {})).error?.message).toContain("參數 path");
    expect((await session.callAsync("import_library_item", { path: PATH, url: "x" })).error?.message).toContain("url");
    expect(session.error("import_library_item", { path: PATH })).toContain("要單獨呼叫");
    expect(session.error("batch", { ops: [{ tool: "import_library_item", args: { path: PATH } }] })).toContain("不能放進 batch");
  });
});
