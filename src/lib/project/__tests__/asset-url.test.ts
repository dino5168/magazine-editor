import { describe, expect, it } from "vitest";
import { resolveAssetUrl } from "../asset-url";

const convert = (path: string): string => `asset://${path}`;

describe("resolveAssetUrl", () => {
  it("joins project-relative paths with the native Windows separator", () => {
    expect(resolveAssetUrl("assets/images/a.png", "D:\\雜誌\\春季號", convert)).toBe(
      "asset://D:\\雜誌\\春季號\\assets\\images\\a.png",
    );
    expect(resolveAssetUrl("assets/images/a.png", "D:\\雜誌\\春季號\\", convert)).toBe(
      "asset://D:\\雜誌\\春季號\\assets\\images\\a.png",
    );
  });

  it("uses forward slashes for POSIX roots", () => {
    expect(resolveAssetUrl("assets/images/a.png", "/home/u/mag", convert)).toBe(
      "asset:///home/u/mag/assets/images/a.png",
    );
  });

  it("leaves URLs untouched without a project or for non-project sources", () => {
    expect(resolveAssetUrl("assets/images/a.png", null, convert)).toBe("assets/images/a.png");
    expect(resolveAssetUrl("blob:http://localhost/1", "D:\\p", convert)).toBe("blob:http://localhost/1");
    expect(resolveAssetUrl("/src/assets/photos/city.svg", "D:\\p", convert)).toBe("/src/assets/photos/city.svg");
  });
});
