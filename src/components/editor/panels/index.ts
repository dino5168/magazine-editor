import type { ComponentType } from "react";
import type { PanelId } from "@/lib/dock/panels";
import { BackgroundPanel } from "./background-panel";
import { ElementsPanel } from "./elements-panel";
import { LayersPanel } from "./layers-panel";
import { PagesPanel } from "./pages-panel";
import { PhotosPanel } from "./photos-panel";
import { DrawPanel } from "./placeholder-panels";
import { PropertiesPanel } from "./properties-panel";
import { TemplatesPanel } from "./templates-panel";
import { TextPanel } from "./text-panel";
import { UploadPanel } from "./upload-panel";

/** Panel content for each tool panel; a missing entry is a compile error. */
export const PANELS = {
  templates: TemplatesPanel,
  text: TextPanel,
  photos: PhotosPanel,
  elements: ElementsPanel,
  draw: DrawPanel,
  upload: UploadPanel,
  background: BackgroundPanel,
  pages: PagesPanel,
  properties: PropertiesPanel,
  layers: LayersPanel,
} as const satisfies Record<PanelId, ComponentType>;
