// ============================================================================
// VIRTUAL LIST COMPONENT
// Reusable virtualized list using @tanstack/react-virtual
// ============================================================================

import { useRef, useCallback, useEffect, type ReactNode, type RefObject } from 'react';
import { useVirtualizer, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { clsx } from 'clsx';

// ============================================================================
// Types
// ============================================================================

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number, virtualItem: VirtualItem) => ReactNode;
  /** Estimated height of each item (for variable height) */
  estimateSize?: (index: number) => number;
  /** Fixed height of each item (use this OR estimateSize) */
  itemHeight?: number;
  /** Extra items to render outside visible area */
  overscan?: number;
  /** Container className */
  className?: string;
  /** Inner container className */
  innerClassName?: string;
  /** Unique key extractor for items */
  getItemKey?: (index: number) => string | number;
  /** Callback when scrolling */
  onScroll?: (scrollTop: number) => void;
  /** Callback when reaching end of list */
  onEndReached?: () => void;
  /** Threshold for onEndReached (pixels from bottom) */
  endReachedThreshold?: number;
  /** Loading indicator at bottom */
  loadingIndicator?: ReactNode;
  /** Whether more items are being loaded */
  isLoading?: boolean;
  /** Empty state when no items */
  emptyState?: ReactNode;
  /** Gap between items in pixels */
  gap?: number;
  /** Horizontal mode */
  horizontal?: boolean;
  /** Ref to access virtualizer instance */
  virtualizerRef?: RefObject<Virtualizer<HTMLDivElement, Element> | null>;
  /** ARIA label for the list */
  ariaLabel?: string;
  /** ARIA role for the list (defaults to 'list') */
  role?: string;
  /** Initial scroll offset */
  initialOffset?: number;
}

export interface VirtualListHandle {
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void;
  scrollToOffset: (offset: number) => void;
  getVirtualizer: () => Virtualizer<HTMLDivElement, Element> | null;
}

// ============================================================================
// Component
// ============================================================================

export function VirtualList<T>({
  items,
  renderItem,
  estimateSize,
  itemHeight = 48,
  overscan = 5,
  className,
  innerClassName,
  getItemKey,
  onScroll,
  onEndReached,
  endReachedThreshold = 200,
  loadingIndicator,
  isLoading = false,
  emptyState,
  gap = 0,
  horizontal = false,
  virtualizerRef,
  ariaLabel,
  role = 'list',
  initialOffset = 0,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const hasTriggeredEndReached = useRef(false);

  // Default size estimator
  const defaultEstimateSize = useCallback(() => itemHeight, [itemHeight]);

  // Virtualizer instance
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize || defaultEstimateSize,
    overscan,
    getItemKey,
    horizontal,
    initialOffset,
  });

  // Expose virtualizer ref if provided
  useEffect(() => {
    if (virtualizerRef && 'current' in virtualizerRef) {
      (virtualizerRef as React.MutableRefObject<Virtualizer<HTMLDivElement, Element> | null>).current = virtualizer;
    }
  }, [virtualizer, virtualizerRef]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    const element = parentRef.current;
    const scrollTop = horizontal ? element.scrollLeft : element.scrollTop;
    const scrollHeight = horizontal ? element.scrollWidth : element.scrollHeight;
    const clientHeight = horizontal ? element.clientWidth : element.clientHeight;

    // Call onScroll callback
    onScroll?.(scrollTop);

    // Check for end reached
    if (onEndReached && !isLoading) {
      const distanceFromEnd = scrollHeight - scrollTop - clientHeight;

      if (distanceFromEnd < endReachedThreshold) {
        if (!hasTriggeredEndReached.current) {
          hasTriggeredEndReached.current = true;
          onEndReached();
        }
      } else {
        hasTriggeredEndReached.current = false;
      }
    }
  }, [horizontal, onScroll, onEndReached, endReachedThreshold, isLoading]);

  // Reset end reached trigger when items change
  useEffect(() => {
    hasTriggeredEndReached.current = false;
  }, [items.length]);

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  // Empty state
  if (items.length === 0 && !isLoading) {
    return emptyState ? <>{emptyState}</> : null;
  }

  // Calculate total size with gaps
  const totalSize = virtualizer.getTotalSize() + (items.length > 1 ? (items.length - 1) * gap : 0);

  return (
    <div
      ref={parentRef}
      className={clsx(
        'overflow-auto',
        horizontal ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden',
        className
      )}
      onScroll={handleScroll}
      role={role}
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <div
        className={clsx('relative', innerClassName)}
        style={{
          [horizontal ? 'width' : 'height']: `${totalSize}px`,
          [horizontal ? 'height' : 'width']: '100%',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          // Calculate offset including gaps
          const offsetWithGap = virtualItem.start + virtualItem.index * gap;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              role="listitem"
              className="absolute left-0 top-0 w-full"
              style={{
                [horizontal ? 'left' : 'top']: 0,
                transform: horizontal
                  ? `translateX(${offsetWithGap}px)`
                  : `translateY(${offsetWithGap}px)`,
                [horizontal ? 'height' : 'width']: '100%',
              }}
            >
              {renderItem(item, virtualItem.index, virtualItem)}
            </div>
          );
        })}
      </div>

      {/* Loading indicator */}
      {isLoading && loadingIndicator && (
        <div className="flex justify-center py-4">{loadingIndicator}</div>
      )}
    </div>
  );
}

// ============================================================================
// Variable Height Virtual List
// For items with dynamic/variable heights that need measuring
// ============================================================================

export interface VariableHeightVirtualListProps<T> extends Omit<VirtualListProps<T>, 'itemHeight'> {
  /** Minimum estimated height for unmeasured items */
  minItemHeight?: number;
}

export function VariableHeightVirtualList<T>({
  minItemHeight = 40,
  ...props
}: VariableHeightVirtualListProps<T>) {
  return (
    <VirtualList
      {...props}
      estimateSize={props.estimateSize || (() => minItemHeight)}
    />
  );
}

// ============================================================================
// Grid Virtual List
// For virtualized grids with fixed columns
// ============================================================================

export interface VirtualGridProps<T> {
  /** Array of items to render */
  items: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number) => ReactNode;
  /** Number of columns */
  columns: number;
  /** Height of each row */
  rowHeight: number;
  /** Gap between items */
  gap?: number;
  /** Container className */
  className?: string;
  /** Extra rows to render outside visible area */
  overscan?: number;
  /** Empty state when no items */
  emptyState?: ReactNode;
  /** ARIA label for the grid */
  ariaLabel?: string;
}

export function VirtualGrid<T>({
  items,
  renderItem,
  columns,
  rowHeight,
  gap = 8,
  className,
  overscan = 3,
  emptyState,
  ariaLabel,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate rows
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan,
  });

  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={clsx('overflow-auto', className)}
      role="grid"
      aria-label={ariaLabel}
    >
      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              role="row"
              className="absolute left-0 w-full"
              style={{
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                height: `${rowHeight}px`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: `${gap}px`,
              }}
            >
              {rowItems.map((item, colIndex) => (
                <div key={startIndex + colIndex} role="gridcell">
                  {renderItem(item, startIndex + colIndex)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export type { VirtualItem, Virtualizer };
