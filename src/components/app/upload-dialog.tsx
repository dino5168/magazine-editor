import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fontsToCheckBeforePublishing } from "@/lib/editor/font-catalog";
import { buildExportRequest } from "@/lib/export/export-request";
import { measureLineWidth, measureTextLayout } from "@/lib/export/text-layout";
import { usePreferences, useSetPreferences } from "@/lib/preferences/preferences-context";
import { useProject } from "@/lib/project/project-context";
import { describeCommandError } from "@/lib/project/project-api";
import { CommandError } from "@/lib/project/project-types";
import type { ConfirmFontLicense } from "@/lib/project/use-project-commands";
import { UPLOAD_PROGRESS_EVENT, uploadApi, type UploadBook, type UploadResult, type UploadSession } from "@/lib/upload/upload-api";
import {
  bookStatusText,
  needsHostConfirmation,
  previewServer,
  progressPercent,
  progressText,
  rememberHost,
  stepAfterError,
  waitText,
  type UploadProgress,
  type UploadStep,
} from "@/lib/upload/upload-flow";
import { cn } from "@/lib/utils";

/** 「新建一本書」in the book list. */
const NEW_BOOK = "new";

export interface UploadDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The flip book export's font licence reminder (an upload publishes the font files too). */
  readonly confirmFontLicense: ConfirmFontLicense;
}

/**
 * 檔案 → 上傳到網站...：登入 → 選書或新建 → 上傳（進度、取消）→ 結果。
 * 網路請求與 token 都在 Rust（`commands/upload.rs`）；這裡只有畫面。計畫：docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md。
 */
export function UploadDialog({ open, onOpenChange, confirmFontLicense }: UploadDialogProps) {
  // 上傳中不能關（Esc、點外面、✕）：先按「取消上傳」
  const [locked, setLocked] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (next || !locked) && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!locked}>
        {open && <UploadFlow onLockChange={setLocked} onClose={() => onOpenChange(false)} confirmFontLicense={confirmFontLicense} />}
      </DialogContent>
    </Dialog>
  );
}

interface UploadFlowProps {
  readonly onLockChange: (locked: boolean) => void;
  readonly onClose: () => void;
  readonly confirmFontLicense: ConfirmFontLicense;
}

function UploadFlow({ onLockChange, onClose, confirmFontLicense }: UploadFlowProps) {
  const preferences = usePreferences();
  const setPreferences = useSetPreferences();
  const { getSnapshot } = useProject();

  const [step, setStep] = useState<UploadStep>("login");
  const [session, setSession] = useState<UploadSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  // 登入太多次：到這個時間（ms）之前停用登入
  const [retryUntil, setRetryUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [server, setServer] = useState(preferences.upload.server);
  const [email, setEmail] = useState(preferences.upload.email);
  const [password, setPassword] = useState("");
  // 第一次連到這台主機：先問一次「要把密碼送到這裡嗎」
  const [confirmingHost, setConfirmingHost] = useState<string | null>(null);

  const [books, setBooks] = useState<readonly UploadBook[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState(() => getSnapshot().content.document.name);
  // 上傳時發現登入過期：重新登入後自動再上傳這本
  const retryBookRef = useRef<string | null>(null);

  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<{ readonly title: string; readonly data: UploadResult } | null>(null);

  useEffect(() => onLockChange(step === "uploading"), [step, onLockChange]);

  useEffect(() => {
    if (retryUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryUntil) setRetryUntil(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const fail = useCallback((failure: Error, from: UploadStep) => {
    const details = failure instanceof CommandError ? failure.upload : undefined;
    if (details?.retryAfter) {
      setRetryUntil(Date.now() + details.retryAfter * 1000);
      setNow(Date.now());
    }
    const next = stepAfterError(details?.code, from);
    if (next === "login" && from !== "login") setSession(null);
    setStep(next);
    setError(describeCommandError(failure));
    return next;
  }, []);

  const loadBooks = useCallback(
    async (after: string | null) => {
      setWorking(true);
      const page = await uploadApi.listBooks(after);
      setWorking(false);
      if (page.error) {
        fail(page.error, "books");
        return;
      }
      setBooks((current) => (after === null ? page.data.books : [...current, ...page.data.books]));
      setNextCursor(page.data.nextCursor);
    },
    [fail],
  );

  // 一小時內登入過（token 在 Rust 記憶體）：直接到選書
  useEffect(() => {
    void uploadApi.session().then((current) => {
      if (!current.data) return;
      setSession(current.data);
      setStep("books");
      void loadBooks(null);
    });
  }, [loadBooks]);

  const upload = useCallback(
    async (bookId: string, title: string) => {
      setError(null);
      setStep("uploading");
      setProgress({ stage: "building", sent: 0, total: 0 });
      const unlisten = await listen<UploadProgress>(UPLOAD_PROGRESS_EVENT, ({ payload }) => setProgress(payload));
      try {
        const request = buildExportRequest(getSnapshot().content.document, measureTextLayout, measureLineWidth);
        const uploaded = await uploadApi.upload(bookId, request);
        if (uploaded.error) {
          if (fail(uploaded.error, "uploading") === "login") retryBookRef.current = bookId;
          if (uploaded.error instanceof CommandError && uploaded.error.upload?.code === "notFound") void loadBooks(null);
          return;
        }
        if (uploaded.data === null) {
          setStep("books");
          setError("已取消上傳，網站上的書沒有改變");
          return;
        }
        setResult({ title, data: uploaded.data });
        setStep("done");
      } finally {
        unlisten();
        setProgress(null);
      }
    },
    [fail, getSnapshot, loadBooks],
  );

  const preview = previewServer(server);
  const waiting = retryUntil !== null && now < retryUntil;

  const login = async (event: FormEvent) => {
    event.preventDefault();
    if (!preview?.allowed) {
      setError("請輸入伺服器網址，例如 https://magazine.example.com");
      return;
    }
    if (needsHostConfirmation(preview.host, preferences.upload.confirmedHosts) && confirmingHost !== preview.host) {
      setConfirmingHost(preview.host);
      return;
    }
    setError(null);
    setWorking(true);
    const loggedIn = await uploadApi.login(server, email, password);
    setWorking(false);
    if (loggedIn.error) {
      fail(loggedIn.error, "login");
      return;
    }
    setPassword("");
    setConfirmingHost(null);
    const host = loggedIn.data.host;
    setPreferences((current) => ({
      ...current,
      upload: { server: server.trim(), email: email.trim(), confirmedHosts: rememberHost(current.upload.confirmedHosts, host) },
    }));
    setSession(loggedIn.data);
    setStep("books");
    void loadBooks(null);
    const retry = retryBookRef.current;
    retryBookRef.current = null;
    if (retry !== null) void upload(retry, books.find((book) => book.id === retry)?.title ?? newTitle);
  };

  const startUpload = async () => {
    if (selected === null) return;
    const fonts = fontsToCheckBeforePublishing(getSnapshot().content.document);
    if (fonts.length > 0 && !(await confirmFontLicense(fonts.map((font) => font.name)))) return;
    if (selected !== NEW_BOOK) {
      await upload(selected, books.find((book) => book.id === selected)?.title ?? "");
      return;
    }
    setError(null);
    setWorking(true);
    const created = await uploadApi.createBook(newTitle);
    setWorking(false);
    if (created.error) {
      fail(created.error, "books");
      return;
    }
    // 之後重試或再上傳，都用這本，不再新建
    setBooks((current) => [created.data, ...current]);
    setSelected(created.data.id);
    await upload(created.data.id, created.data.title);
  };

  const logout = async () => {
    await uploadApi.logout();
    setSession(null);
    setBooks([]);
    setSelected(null);
    setStep("login");
  };

  const openReader = async () => {
    const opened = await uploadApi.openReader();
    if (opened.error) setError(describeCommandError(opened.error));
  };

  const selectedBook = books.find((book) => book.id === selected);
  const errorLine = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );

  if (step === "login") {
    return (
      <form onSubmit={(event) => void login(event)} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>上傳到網站</DialogTitle>
          <DialogDescription>把目前的文件做成翻頁電子書，上傳到雜誌網站。密碼不會儲存；登入一小時內再上傳不用重新輸入。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="upload-server">伺服器網址</Label>
          <Input id="upload-server" value={server} onChange={(event) => setServer(event.target.value)} placeholder="https://magazine.example.com" autoComplete="url" />
          {preview && !preview.allowed && (
            <p className="text-xs text-destructive">網際網路上的伺服器要用 https://；http:// 只能連這台電腦或區域網路（例如 192.168.x.x）</p>
          )}
          {preview?.allowed && (
            <p className={cn("text-xs", preview.insecure ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
              將傳送密碼到 <strong className="font-medium">{preview.host}</strong>
              {preview.insecure && "（連線未加密，只適合本機或區域網路測試）"}
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="upload-email">Email</Label>
          <Input id="upload-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="upload-password">密碼</Label>
          <Input id="upload-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </div>
        {confirmingHost !== null && confirmingHost === preview?.host && (
          <div className="grid gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <p>
              第一次連到 <strong className="font-medium">{confirmingHost}</strong>。請確認這是你的雜誌網站，再按「確認並登入」：密碼會送到這台主機。
            </p>
          </div>
        )}
        {errorLine}
        {waiting && retryUntil !== null && <p className="text-sm text-muted-foreground">請 {waitText((retryUntil - now) / 1000)}後再試</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={working || waiting || email.trim() === "" || password === "" || !preview?.allowed}>
            {working ? "登入中…" : confirmingHost !== null && confirmingHost === preview?.host ? "確認並登入" : "登入"}
          </Button>
        </DialogFooter>
      </form>
    );
  }

  if (step === "books") {
    const canStart = selected !== null && !working && (selected !== NEW_BOOK || newTitle.trim() !== "");
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>選擇要上傳的書</DialogTitle>
          <DialogDescription>
            {session ? `${session.displayName}（${session.host}）` : ""}：選一本覆蓋，或新建一本。新書是草稿，到網站設定公開。
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-1" role="listbox" aria-label="書">
          {session?.canCreateBooks && (
            <BookOption selected={selected === NEW_BOOK} onSelect={() => setSelected(NEW_BOOK)}>
              <span className="font-medium">＋ 新建一本書</span>
            </BookOption>
          )}
          {books.map((book) => (
            <BookOption key={book.id} selected={selected === book.id} onSelect={() => setSelected(book.id)}>
              <span className="truncate">{book.title || "（沒有書名）"}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {bookStatusText(book.status)} · {book.pageCount === null ? "還沒有內容" : `${book.pageCount} 頁`}
              </span>
            </BookOption>
          ))}
          {books.length === 0 && !working && <p className="p-2 text-sm text-muted-foreground">還沒有書。</p>}
          {nextCursor !== null && (
            <Button variant="ghost" size="sm" disabled={working} onClick={() => void loadBooks(nextCursor)}>
              載入更多
            </Button>
          )}
        </div>
        {selected === NEW_BOOK && (
          <div className="grid gap-2">
            <Label htmlFor="upload-title">書名</Label>
            <Input id="upload-title" value={newTitle} maxLength={200} onChange={(event) => setNewTitle(event.target.value)} />
          </div>
        )}
        {!session?.canCreateBooks && <p className="text-xs text-muted-foreground">系統管理者不屬於出版社，不能新建書，只能覆蓋既有的書。</p>}
        {selectedBook?.status === "PUBLIC" && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">這本書是公開的：上傳完成後，讀者會立刻看到新的內容。</p>
        )}
        {errorLine}
        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void logout()}>
            登出
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="button" disabled={!canStart} onClick={() => void startUpload()}>
              上傳
            </Button>
          </div>
        </DialogFooter>
      </div>
    );
  }

  if (step === "uploading") {
    const percent = progress ? progressPercent(progress) : null;
    return (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>上傳中</DialogTitle>
          <DialogDescription>上傳完成前請不要關閉程式。</DialogDescription>
        </DialogHeader>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
          <div className={cn("h-full bg-primary transition-[width]", percent === null && "w-full animate-pulse opacity-60")} style={percent === null ? undefined : { width: `${percent}%` }} />
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {progress ? progressText(progress) : ""}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={progress?.stage === "processing"} onClick={() => void uploadApi.cancel()}>
            取消上傳
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>上傳完成</DialogTitle>
        <DialogDescription>
          已上傳「{result?.title}」（{result?.data.pageCount} 頁）。
        </DialogDescription>
      </DialogHeader>
      {result && !result.data.coverUploaded && <p className="text-sm text-muted-foreground">封面圖沒有產生成功，網站保留原本的封面。</p>}
      {result && result.data.skippedImages > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">有 {result.data.skippedImages} 張圖片找不到檔案或無法輸出，已略過。</p>
      )}
      {errorLine}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => void openReader()}>
          在瀏覽器開啟
        </Button>
        <Button type="button" onClick={onClose}>
          完成
        </Button>
      </DialogFooter>
    </div>
  );
}

function BookOption({ selected, onSelect, children }: { readonly selected: boolean; readonly onSelect: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted", selected && "bg-accent text-accent-foreground")}
    >
      {children}
    </button>
  );
}
