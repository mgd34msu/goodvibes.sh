// ============================================================================
// TOAST STORE - Notification toasts
// ============================================================================

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

let toastId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastId}`;
    const newToast: Toast = { ...toast, id };

    set((state) => ({ toasts: [...state.toasts, newToast] }));

    // Auto-remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => set({ toasts: [] }),
}));

// Convenience functions
export const toast = {
  success: (message: string, options?: Partial<Toast>) =>
    useToastStore.getState().addToast({ type: 'success', message, ...options }),
  error: (message: string, options?: Partial<Toast>) =>
    useToastStore.getState().addToast({ type: 'error', message, ...options }),
  warning: (message: string, options?: Partial<Toast>) =>
    useToastStore.getState().addToast({ type: 'warning', message, ...options }),
  info: (message: string, options?: Partial<Toast>) =>
    useToastStore.getState().addToast({ type: 'info', message, ...options }),
};
