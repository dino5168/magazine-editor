import { Pencil } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
