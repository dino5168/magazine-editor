import { useState, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEditorState } from "@/lib/editor/editor-context";
import { pickImageFiles } from "@/lib/editor/image";
import { isDesktop } from "@/lib/project/project-api";
import { useProject } from "@/lib/project/project-context";
import { useImageImport } from "@/lib/project/use-image-import";
import { useAddImage } from "./use-add-image";

/**
 * Panel for uploading local images and adding them to the page.
 *
 * Returns:
 *   Drop zone, file picker and the list of images stored in the project.
 */
export function UploadPanel() {
  const { assets } = useEditorState();
  const { resolveSrc } = useProject();
  const { importFiles } = useImageImport();
  const addImage = useAddImage();
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    void importFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>上傳圖片</CardTitle>
          <CardDescription>PNG、JPEG、WebP、GIF，單檔 20 MB 以內。</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-3 py-6 text-center text-xs text-muted-foreground transition-colors",
              dragOver && "border-primary bg-primary/5 text-foreground",
            )}
          >
            <CloudUpload className="size-8" strokeWidth={1.5} />
            將圖片拖放到這裡
            <Button size="sm" variant="outline" onClick={() => void pickImageFiles().then(importFiles)}>
              選擇檔案
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>專案圖片</CardTitle>
          <CardDescription>
            {assets.length === 0
              ? "尚未上傳圖片。"
              : isDesktop
                ? "點擊加入頁面中央。圖片存放在專案資料夾內，隨專案保存。"
                : "點擊加入頁面中央（瀏覽器模式，關閉後不會保留）。"}
          </CardDescription>
        </CardHeader>
        {assets.length > 0 && (
          <CardContent className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button
                key={asset.src}
                type="button"
                title={asset.name}
                onClick={() => addImage(asset.src, asset)}
                className="overflow-hidden rounded-lg border bg-muted transition-shadow hover:ring-2 hover:ring-primary/40"
              >
                <img
                  src={resolveSrc(asset.src)}
                  alt={asset.name}
                  className="aspect-4/3 w-full object-contain"
                  draggable={false}
                />
              </button>
            ))}
          </CardContent>
        )}
      </Card>
    </>
  );
}
