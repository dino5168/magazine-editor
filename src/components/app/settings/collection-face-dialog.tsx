import { useState } from "react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CollectionFace } from "@/lib/project/project-types";
import { cn } from "@/lib/utils";
import { SettingsDialog, SettingsDialogFooter } from "./settings-dialog";

/** What the dialog asks about: one `.ttc` file and its faces. */
export interface CollectionFaceQuestion {
  readonly fileName: string;
  readonly faces: readonly CollectionFace[];
}

interface CollectionFaceDialogProps {
  /** The open question; null = closed. */
  readonly question: CollectionFaceQuestion | null;
  /** The chosen face index, or null when the user skips the file. */
  readonly onChoose: (index: number | null) => void;
}

/**
 * 「這個檔案有 N 個字型」: picks which face of a font collection to import. Faces that cannot be
 * imported are shown with the reason and cannot be chosen.
 *
 * Args:
 *   props: The question and the answer callback (cancel / Esc / ✕ answer null).
 *
 * Returns:
 *   Dialog element.
 */
export function CollectionFaceDialog({ question, onChoose }: CollectionFaceDialogProps) {
  return (
    <SettingsDialog
      open={question !== null}
      onOpenChange={(open) => {
        if (!open) onChoose(null);
      }}
    >
      {question && <FaceList question={question} onChoose={onChoose} />}
    </SettingsDialog>
  );
}

function faceName(face: CollectionFace): string {
  return [face.family, face.style].filter(Boolean).join(" ") || `第 ${face.index + 1} 個字型`;
}

function FaceList({ question, onChoose }: { readonly question: CollectionFaceQuestion; readonly onChoose: (index: number) => void }) {
  const [chosen, setChosen] = useState(() => question.faces.find((face) => face.problem === null)?.index ?? null);
  return (
    <>
      <DialogHeader>
        <DialogTitle>選擇字型</DialogTitle>
        <DialogDescription>
          「{question.fileName}」是字型集合，裡面有 {question.faces.length} 個字型。要加入哪一個？
        </DialogDescription>
      </DialogHeader>
      <ul className="flex max-h-72 flex-col overflow-y-auto rounded-md border p-1" role="radiogroup" aria-label="集合裡的字型">
        {question.faces.map((face) => (
          <li
            key={face.index}
            role="radio"
            aria-checked={face.index === chosen}
            aria-disabled={face.problem !== null}
            className={cn(
              "flex cursor-default items-center gap-3 rounded-sm px-2 py-1.5 text-sm",
              face.index === chosen ? "bg-muted" : face.problem === null && "hover:bg-muted/60",
              face.problem !== null && "opacity-50",
            )}
            onClick={() => {
              if (face.problem === null) setChosen(face.index);
            }}
            onDoubleClick={() => {
              if (face.problem === null) onChoose(face.index);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{faceName(face)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{face.problem ?? `字重 ${face.weight}`}</span>
          </li>
        ))}
      </ul>
      <SettingsDialogFooter applyLabel="加入" applyDisabled={chosen === null} onApply={() => chosen !== null && onChoose(chosen)} />
    </>
  );
}
