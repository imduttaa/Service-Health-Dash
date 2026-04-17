import React from 'react';
import { cn } from '../../lib/cn';
import { PanelErrorBoundary } from './error-boundary';

interface PanelWrapperProps {
  title: string;
  panelName: string;
  className?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Consistent panel chrome: title bar, optional actions, error boundary.
 * Each panel is independently isolated — a crash in one does not affect others.
 */
export function PanelWrapper({
  title,
  panelName,
  className,
  headerRight,
  children,
}: PanelWrapperProps) {
  return (
    <section
      className={cn(
        'flex flex-col rounded-xl border border-gray-200 dark:border-gray-700',
        'bg-white dark:bg-gray-900 overflow-hidden',
        className,
      )}
      aria-label={title}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 tracking-tight">
          {title}
        </h2>
        {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
      </div>
      <div className="flex-1 overflow-hidden">
        <PanelErrorBoundary panelName={panelName}>
          {children}
        </PanelErrorBoundary>
      </div>
    </section>
  );
}
