import { useCallback, useState } from "react";

interface Pending<P, T> {
  readonly payload: P;
  readonly resolve: (choice: T) => void;
}

/**
 * State for a dialog that is opened by code and answers with a Promise.
 *
 * Returns:
 *   `pending` (the payload while the dialog is open, else null), `ask` to open it and wait for the
 *   answer, and `choose` to answer and close it.
 */
export function usePendingChoice<P, T>(): {
  readonly pending: { readonly payload: P } | null;
  readonly ask: (payload: P) => Promise<T>;
  readonly choose: (choice: T) => void;
} {
  const [pending, setPending] = useState<Pending<P, T> | null>(null);

  const ask = useCallback(
    (payload: P) => new Promise<T>((resolve) => setPending({ payload, resolve })),
    [],
  );

  const choose = (choice: T): void => {
    pending?.resolve(choice);
    setPending(null);
  };

  return { pending, ask, choose };
}
