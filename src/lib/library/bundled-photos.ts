/**
 * 內建範例相片（「素材」面板的「內建範例」）。CSP 不允許載入外部圖片，所以隨 App 打包；
 * 換成實際照片時只要更換 src/assets/photos/ 的檔案與這份清單。
 *
 * 不在素材庫（library.json）裡：放到頁面時才經 `importBundled` 複製進專案、加入「未分類」。
 */
import photoAbstract from "@/assets/photos/photo-abstract.svg";
import photoCity from "@/assets/photos/photo-city.svg";
import photoDesert from "@/assets/photos/photo-desert.svg";
import photoForest from "@/assets/photos/photo-forest.svg";
import photoMountain from "@/assets/photos/photo-mountain.svg";
import photoOcean from "@/assets/photos/photo-ocean.svg";

export interface BundledPhoto {
  readonly id: string;
  /** Display name; also the library item name once it is placed. */
  readonly label: string;
  /** URL bundled by Vite. */
  readonly src: string;
}

export const BUNDLED_PHOTOS: readonly BundledPhoto[] = [
  { id: "mountain", label: "山景", src: photoMountain },
  { id: "ocean", label: "海洋", src: photoOcean },
  { id: "forest", label: "森林", src: photoForest },
  { id: "city", label: "城市夜景", src: photoCity },
  { id: "abstract", label: "抽象", src: photoAbstract },
  { id: "desert", label: "沙漠", src: photoDesert },
];
