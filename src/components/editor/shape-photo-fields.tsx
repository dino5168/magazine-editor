import { useState, type ReactElement } from "react";
import { ImagePlus, Trash } from "lucide-react";
import { LibraryThumb } from "@/components/library/library-card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clampFocus, clampZoom, SHAPE_IMAGE_FIT_LABELS, shapeImageOf } from "@/lib/editor/shape-image";
import type { ElementPatch, ShapeElement, ShapeImage, ShapeImageFit } from "@/lib/editor/types";
import { SHAPE_IMAGE_FITS, SHAPE_IMAGE_ZOOM_MAX } from "@/lib/editor/validation";
import { useLibrary } from "@/lib/library/library-context";
import type { ImageItem } from "@/lib/library/types";
import { useProject } from "@/lib/project/project-context";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { NumberField } from "./number-field";
import { Row } from "./style-controls";

interface ShapePhotoFieldsProps {
  readonly shape: ShapeElement;
  readonly update: (patch: ElementPatch) => void;
}

/**
 * 「照片」in the 樣式 tab: turns the shape into an image frame. Pick a photo from the project's
 * library, change or remove it, and set how it fills the frame (fit, focus, zoom). Every change is
 * one `element/update` (one undo step).
 *
 * Args:
 *   props: The selected shape and the panel's update function.
 *
 * Returns:
 *   Fields for the photo.
 */
export function ShapePhotoFields({ shape, update }: ShapePhotoFieldsProps) {
  const { image } = shape;
  const library = useLibrary();
  const { resolveSrc } = useProject();
  const photos = library.items.filter((item): item is ImageItem => item.kind === "image" && item.trashed === null);
  const current = image ? photos.find((item) => item.src === image.src) : undefined;
  const setImage = (next: ShapeImage | null) => update({ image: next });
  const setLook = (patch: Partial<Pick<ShapeImage, "fit" | "focusX" | "focusY" | "zoom">>) => image && setImage({ ...image, ...patch });
  // 換照片時保留填滿方式、對焦與縮放；第一次放照片用預設（填滿、置中）
  const choose = (item: ImageItem) =>
    setImage(image ? { ...image, src: item.src, imageWidth: item.width, imageHeight: item.height } : shapeImageOf(item.src, item));

  if (!image) {
    return (
      <Row label="照片">
        <PhotoPicker photos={photos} resolveSrc={resolveSrc} onChoose={choose}>
          <Button variant="outline" size="sm" className="h-7">
            <ImagePlus />
            選擇照片...
          </Button>
        </PhotoPicker>
      </Row>
    );
  }

  const percent = (value: number) => Math.round(value * 1000) / 10;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0">照片</span>
        <img src={resolveSrc(image.src)} alt="" className="ml-auto size-9 shrink-0 rounded-sm object-cover ring-1 ring-border" />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={current?.name}>
          {current?.name ?? "照片"}
        </span>
        <PhotoPicker photos={photos} resolveSrc={resolveSrc} onChoose={choose}>
          <Button variant="outline" size="sm" className="h-7">
            更換
          </Button>
        </PhotoPicker>
        <IconButton label="移除照片" onClick={() => setImage(null)}>
          <Trash />
        </IconButton>
      </div>
      <Row label="填滿方式">
        <div className="flex gap-0.5" role="group" aria-label="填滿方式">
          {SHAPE_IMAGE_FITS.map((fit: ShapeImageFit) => (
            <Button
              key={fit}
              variant="outline"
              size="sm"
              aria-pressed={image.fit === fit}
              className={cn("h-7", image.fit === fit && "bg-muted")}
              onClick={() => setLook({ fit })}
            >
              {SHAPE_IMAGE_FIT_LABELS[fit]}
            </Button>
          ))}
        </div>
      </Row>
      {/* key：值從外面改變（復原、換照片）時重新取值 */}
      <NumberField
        key={`fx:${image.focusX}`}
        label="水平對焦"
        labelClassName="w-16"
        unit="%"
        value={percent(image.focusX)}
        step={{ size: 10, min: 0, max: 100 }}
        onCommit={(value) => setLook({ focusX: clampFocus(value / 100) })}
      />
      <NumberField
        key={`fy:${image.focusY}`}
        label="垂直對焦"
        labelClassName="w-16"
        unit="%"
        value={percent(image.focusY)}
        step={{ size: 10, min: 0, max: 100 }}
        onCommit={(value) => setLook({ focusY: clampFocus(value / 100) })}
      />
      <NumberField
        key={`z:${image.zoom}`}
        label="縮放"
        labelClassName="w-16"
        unit="%"
        value={percent(image.zoom)}
        step={{ size: 10, min: 100, max: SHAPE_IMAGE_ZOOM_MAX * 100 }}
        onCommit={(value) => setLook({ zoom: clampZoom(value / 100) })}
      />
      <p className="text-xs text-muted-foreground">對焦：照片比框大時保留哪一部分（0% 左 / 上、50% 置中、100% 右 / 下）。</p>
    </div>
  );
}

interface PhotoPickerProps {
  readonly photos: readonly ImageItem[];
  readonly resolveSrc: (src: string) => string;
  readonly onChoose: (item: ImageItem) => void;
  /** The trigger button. */
  readonly children: ReactElement;
}

// 素材庫的圖片（不含垃圾桶）；點一下放進圖形並關閉
function PhotoPicker({ photos, resolveSrc, onChoose, children }: PhotoPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-72" aria-label="選擇照片">
        {photos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">素材庫還沒有圖片。先在「素材」面板匯入照片。</p>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto p-0.5">
            {photos.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.name}
                className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => {
                  onChoose(item);
                  setOpen(false);
                }}
              >
                <LibraryThumb item={item} resolveSrc={resolveSrc} className="aspect-square w-full" />
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
