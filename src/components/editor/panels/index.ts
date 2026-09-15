import type { ComponentType } from "react";
import type { SiderButtonId } from "@/components/app/app-siderbutton";
import { BackgroundPanel } from "./background-panel";
import { ElementsPanel } from "./elements-panel";
import { LayersPanel } from "./layers-panel";
import { PhotosPanel } from "./photos-panel";
import { DrawPanel, ResizePanel } from "./placeholder-panels";
import { TemplatesPanel } from "./templates-panel";
import { TextPanel } from "./text-panel";
import { UploadPanel } from "./upload-panel";

/** Panel content for each sider button; a missing entry is a compile error. */
export const PANELS = {
  templates: TemplatesPanel,
  text: TextPanel,
  photos: PhotosPanel,
  elements: ElementsPanel,
  draw: DrawPanel,
  upload: UploadPanel,
  background: BackgroundPanel,
  layers: LayersPanel,
  resize: ResizePanel,
} as const satisfies Record<SiderButtonId, ComponentType>;
