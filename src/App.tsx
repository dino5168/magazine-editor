import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

// Konva 體積較大，延遲載入讓視窗先顯示
const HomePage = lazy(() =>
  import("@/pages/home-page").then((m) => ({ default: m.HomePage })),
);

const fallback = (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    載入中...
  </div>
);

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen overflow-hidden">
        <Suspense fallback={fallback}>
          <HomePage />
        </Suspense>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
