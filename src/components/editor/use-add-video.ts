import { useCallback } from "react";
import { toast } from "sonner";
import { useActivePage, useEditorDispatch } from "@/lib/editor/editor-context";
import { createMediaElement } from "@/lib/editor/element-factory";
import { pageCenter } from "@/lib/editor/geometry";
import type { PageId, Point } from "@/lib/editor/types";
import { posterOf, videoNotice } from "@/lib/media/media-insert";
import type { YouTubeVideo } from "@/lib/media/youtube-url";
import { fetchVideoInfo } from "@/lib/media/video-info";
import { useProject } from "@/lib/project/project-context";
import type { YouTubeInfo } from "@/lib/project/project-types";

/** Where a video goes: a page (or master) and the center of the new box on it. */
export interface VideoTarget {
  readonly pageId: PageId;
  readonly point: Point;
}

export interface AddVideo {
  /** Adds the video with what was already fetched (the insert dialog shows it first). */
  readonly add: (video: YouTubeVideo, info: YouTubeInfo | null, target?: VideoTarget) => void;
  /** Fetches poster and title, then adds the video (Ctrl+V / dropping a link); refuses missing videos. */
  readonly fetchAndAdd: (video: YouTubeVideo, target?: VideoTarget) => Promise<void>;
}

/**
 * Adding a YouTube video to a page: one `element/add` (one undo step), selected, with the fetched
 * poster and title. Without a target it goes to the center of the active page.
 *
 * Returns:
 *   `add` and `fetchAndAdd`.
 */
export function useAddVideo(): AddVideo {
  const page = useActivePage();
  const dispatch = useEditorDispatch();
  const { getSnapshot } = useProject();

  const add = useCallback(
    (video: YouTubeVideo, info: YouTubeInfo | null, target?: VideoTarget) => {
      const { pages, masters } = getSnapshot().content.document;
      const sheet = target ? [...pages, ...masters].find((candidate) => candidate.id === target.pageId) : undefined;
      const size = sheet ?? page;
      const element = createMediaElement({ kind: "youtube", ...video }, size, target?.point ?? pageCenter(size), {
        poster: posterOf(info),
        title: info?.title ?? "",
      });
      dispatch({ type: "element/add", element, ...(sheet && sheet.id !== page.id && { pageId: sheet.id }) });
    },
    [dispatch, getSnapshot, page],
  );

  const fetchAndAdd = useCallback(
    async (video: YouTubeVideo, target?: VideoTarget) => {
      const loading = toast.loading("正在取得影片資訊…");
      const info = await fetchVideoInfo(video.videoId);
      toast.dismiss(loading);
      const notice = videoNotice(info);
      if (notice?.level === "error") {
        toast.error(notice.message);
        return;
      }
      add(video, info, target);
      if (notice) toast.warning(notice.message);
    },
    [add],
  );

  return { add, fetchAndAdd };
}
