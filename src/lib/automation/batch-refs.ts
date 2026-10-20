/**
 * `batch` 工具的 `$ref`：讓批次裡的操作引用前面操作的回傳值（例如新物件的 id）。
 *
 * `{ "$ref": "2.id" }`（物件只有 `$ref` 一個 key）換成 `ops[2]` 回傳值的 `id` 欄位；
 * 路徑用 `.` 分隔，陣列用數字（`"3.ids.0"`），只寫數字（`"2"`）= 整個回傳值。
 */
import type { Result } from "@/lib/editor/validation";

const REF_KEY = "$ref";

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `{ "$ref": … }` with no other key. */
function isRef(value: unknown): value is { readonly $ref: unknown } {
  return isPlainObject(value) && Object.keys(value).length === 1 && hasOwn(value, REF_KEY);
}

/**
 * Looks up one `$ref` path.
 *
 * Args:
 *   ref: The `$ref` value (untrusted).
 *   results: Results of the operations before this one.
 *
 * Returns:
 *   The referenced value, or an error naming the reference.
 */
function lookUp(ref: unknown, results: readonly unknown[]): Result<unknown> {
  const fail = (reason: string): Result<never> => ({
    data: null,
    error: new Error(`$ref「${String(ref)}」：${reason}`),
  });
  if (typeof ref !== "string" || ref === "") return fail("必須是「第幾個操作.欄位」形式的字串，例如 \"0.id\"");
  const [head, ...path] = ref.split(".");
  if (!/^\d+$/.test(head)) return fail("開頭必須是操作的編號（0 起算）");
  const index = Number(head);
  if (index >= results.length) {
    return fail(results.length === 0 ? "第一個操作沒有前面的結果可以引用" : `只能引用前面的操作（0–${results.length - 1}）`);
  }
  let value: unknown = results[index];
  for (const [depth, key] of path.entries()) {
    const at = [head, ...path.slice(0, depth + 1)].join(".");
    if (Array.isArray(value) && /^\d+$/.test(key) && Number(key) < value.length) {
      value = value[Number(key)];
    } else if (isPlainObject(value) && hasOwn(value, key)) {
      value = value[key];
    } else {
      return fail(`ops[${index}] 的回傳值沒有「${at}」`);
    }
  }
  return { data: value, error: null };
}

/**
 * Replaces every `$ref` in one operation's arguments.
 *
 * Args:
 *   args: The operation's arguments (untrusted JSON; any depth).
 *   results: Results of the operations before this one, in order.
 *
 * Returns:
 *   The arguments with references replaced (unchanged parts keep their identity), or the first
 *   reference that cannot be resolved.
 */
export function resolveRefs(args: unknown, results: readonly unknown[]): Result<unknown> {
  if (isRef(args)) return lookUp(args.$ref, results);
  if (Array.isArray(args)) {
    const items: unknown[] = [];
    for (const item of args) {
      const resolved = resolveRefs(item, results);
      if (resolved.error) return resolved;
      items.push(resolved.data);
    }
    return { data: items.every((item, index) => item === args[index]) ? args : items, error: null };
  }
  if (isPlainObject(args)) {
    let changed = false;
    const entries: [string, unknown][] = [];
    for (const [key, value] of Object.entries(args)) {
      const resolved = resolveRefs(value, results);
      if (resolved.error) return resolved;
      changed ||= resolved.data !== value;
      entries.push([key, resolved.data]);
    }
    return { data: changed ? Object.fromEntries(entries) : args, error: null };
  }
  return { data: args, error: null };
}
