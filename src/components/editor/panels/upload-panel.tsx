import { useRef, useState, type DragEvent } from "react";
import { CloudUpload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState } from "@/lib/editor/editor-context";
import { createId } from "@/lib/editor/element-factory";
import { loadImageSize } from "@/lib/editor/image";
import { ALLOWED_IMAGE_TYPES, validateImageFile } from "@/lib/editor/validation";
import { useAddImage } from "./use-add-image";

/**
 * Panel for uploading local images and adding them to the page.
 *
 * Returns:
 *   Drop zone, file picker and the list of images uploaded this session.
 */
export function UploadPanel() {
  const { uploads } = useEditorState();
  const dispatch = useEditorDispatch();
  const addImage = useAddImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: readonly File[]): Promise<void> => {
    for (const file of files) {
      const checked = validateImageFile(file);
      if (checked.error) {
        toast.error(checked.error.message);
        continue;
      }
      // blob URL 在本工作階段內不 revoke：undo 可能讓已刪除的圖片物件回來
      const src = URL.createObjectURL(checked.data);
      // MIME 由副檔名推斷，實際解碼成功才接受，避免改副檔名的非圖片檔
      const size = await loadImageSize(src);
      if (size.error) {
        URL.revokeObjectURL(src);
        toast.error(`「${file.name}」${size.error.message}`);
        continue;
      }
      dispatch({ type: "upload/add", image: { id: createId(), name: file.name, src, ...size.data } });
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    void handleFiles(Array.from(event.dataTransfer.files));
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
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              選擇檔案
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                // 清空值，才能再次選擇同一個檔案
                event.target.value = "";
                void handleFiles(files);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>本次上傳</CardTitle>
          <CardDescription>
            {uploads.length === 0 ? "尚未上傳圖片。" : "點擊加入頁面中央（關閉程式後不會保留）。"}
          </CardDescription>
        </CardHeader>
        {uploads.length > 0 && (
          <CardContent className="grid grid-cols-2 gap-2">
            {uploads.map((upload) => (
              <button
                key={upload.id}
                type="button"
                title={upload.name}
                onClick={() => void addImage(upload.src, upload)}
                className="overflow-hidden rounded-lg border bg-muted transition-shadow hover:ring-2 hover:ring-primary/40"
              >
                <img src={upload.src} alt={upload.name} className="aspect-4/3 w-full object-contain" draggable={false} />
              </button>
            ))}
          </CardContent>
        )}
      </Card>
    </>
  );
}
