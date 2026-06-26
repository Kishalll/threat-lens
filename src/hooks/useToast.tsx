import { useCallback, useState } from "react";
import Toast, { type ToastVariant } from "../components/Toast";

export type { ToastVariant };

interface ToastState {
  message: string | null;
  variant: ToastVariant;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({ message: null, variant: "info" });

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    setToast({ message, variant });
  }, []);

  const hideToast = useCallback(() => {
    setToast({ message: null, variant: "info" });
  }, []);

  return {
    showToast,
    ToastComponent: <Toast message={toast.message} variant={toast.variant} onHide={hideToast} />,
  };
}
