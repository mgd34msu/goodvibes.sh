// ============================================================================
// CONFIRM MODAL COMPONENT
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { AlertTriangle } from 'lucide-react';
import { FocusTrap } from '../common/FocusTrap';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the cancel button by default for destructive actions
      confirmButtonRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: 'btn-danger',
    warning: 'btn-warning',
    default: 'btn-primary',
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <FocusTrap>
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-message"
          className="relative z-10 w-full max-w-md mx-4 bg-surface-800 rounded-lg shadow-xl"
        >
          <div className="p-6">
            {/* Icon */}
            {variant === 'danger' && (
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-error-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-error-500" size={24} />
              </div>
            )}
            {variant === 'warning' && (
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-warning-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning-500" size={24} />
              </div>
            )}

            {/* Title */}
            <h2
              id="confirm-modal-title"
              className="text-lg font-semibold text-surface-100 text-center"
            >
              {title}
            </h2>

            {/* Message */}
            <p
              id="confirm-modal-message"
              className="mt-2 text-sm text-surface-400 text-center"
            >
              {message}
            </p>

            {/* Actions */}
            <div className="mt-6 flex gap-3 justify-center">
              <button
                onClick={onCancel}
                className="btn btn-secondary"
              >
                {cancelText}
              </button>
              <button
                ref={confirmButtonRef}
                onClick={onConfirm}
                className={clsx('btn', variantStyles[variant])}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </FocusTrap>
    </div>,
    document.body
  );
}

// ============================================================================
// HOOK FOR USING CONFIRM MODAL
// ============================================================================

interface UseConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface UseConfirmResult {
  isOpen: boolean;
  confirm: () => Promise<boolean>;
  ConfirmDialog: () => React.JSX.Element | null;
}

export function useConfirm(options: UseConfirmOptions): UseConfirmResult {
  const [isOpen, setIsOpen] = React.useState(false);
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback(() => {
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = React.useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const ConfirmDialog = React.useCallback(() => (
    <ConfirmModal
      isOpen={isOpen}
      title={options.title}
      message={options.message}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      variant={options.variant}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ), [isOpen, options, handleConfirm, handleCancel]);

  return { isOpen, confirm, ConfirmDialog };
}
