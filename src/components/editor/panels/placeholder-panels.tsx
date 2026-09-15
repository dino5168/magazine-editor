import { Pencil, Scaling } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivePage } from "@/lib/editor/editor-context";
import { formatPageSize } from "@/lib/editor/units";

/**
 * Placeholder for freehand drawing.
 *
 * Returns:
 *   Informational card.
 */
export function DrawPanel() {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pencil className="size-4" />
          自由繪圖
        </CardTitle>
        <CardDescription>自由繪圖將於後續版本提供。</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * Shows the current page size; resizing is not implemented yet.
 *
 * Returns:
 *   Informational card with the page size.
 */
export function ResizePanel() {
  const page = useActivePage();
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scaling className="size-4" />
          頁面尺寸
        </CardTitle>
        <CardDescription>變更尺寸將於後續版本提供。</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">{formatPageSize(page)}</p>
      </CardContent>
    </Card>
  );
}
