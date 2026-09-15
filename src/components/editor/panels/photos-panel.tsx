import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import photoAbstract from "@/assets/photos/photo-abstract.svg";
import photoCity from "@/assets/photos/photo-city.svg";
import photoDesert from "@/assets/photos/photo-desert.svg";
import photoForest from "@/assets/photos/photo-forest.svg";
import photoMountain from "@/assets/photos/photo-mountain.svg";
import photoOcean from "@/assets/photos/photo-ocean.svg";
import { useAddImage } from "./use-add-image";

// 內建佔位圖（CSP 不允許載入外部圖片）；替換成實際照片時只需更換 src/assets/photos/ 內的檔案
const PHOTOS: readonly { readonly id: string; readonly label: string; readonly src: string }[] = [
  { id: "mountain", label: "山景", src: photoMountain },
  { id: "ocean", label: "海洋", src: photoOcean },
  { id: "forest", label: "森林", src: photoForest },
  { id: "city", label: "城市夜景", src: photoCity },
  { id: "abstract", label: "抽象", src: photoAbstract },
  { id: "desert", label: "沙漠", src: photoDesert },
];

/**
 * Panel listing bundled sample photos.
 *
 * Returns:
 *   Two-column photo grid.
 */
export function PhotosPanel() {
  const addImage = useAddImage();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>範例相片</CardTitle>
        <CardDescription>點擊加入頁面中央。</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {PHOTOS.map((photo) => (
          <button
            key={photo.id}
            type="button"
            title={photo.label}
            onClick={() => void addImage(photo.src)}
            className="group overflow-hidden rounded-lg border bg-muted transition-shadow hover:ring-2 hover:ring-primary/40"
          >
            <img src={photo.src} alt={photo.label} className="aspect-4/3 w-full object-cover" draggable={false} />
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
