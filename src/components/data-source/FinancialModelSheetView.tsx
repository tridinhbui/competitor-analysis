"use client";

import { FinancialModelExcelGrid } from "@/components/data-source/FinancialModelExcelGrid";
import type { FinancialModelContext, FinancialModelSheetKey } from "@/lib/dataSourceFinancialModel";
import type { FinancialShortcutTarget } from "@/lib/financialModelGrid";

interface FinancialModelSheetViewProps {
  variant: FinancialModelSheetKey;
  context: FinancialModelContext;
  storageKey: string;
  scrollToSectionId: string | null;
  onScrolledToSection: () => void;
  onShortcut: (target: FinancialShortcutTarget) => void;
}

export function FinancialModelSheetView({
  variant,
  context,
  storageKey,
  scrollToSectionId,
  onScrolledToSection,
  onShortcut,
}: FinancialModelSheetViewProps) {
  return (
    <FinancialModelExcelGrid
      sheetKey={variant}
      context={context}
      storageKey={storageKey}
      scrollToSectionId={scrollToSectionId}
      onScrolledToSection={onScrolledToSection}
      onShortcut={onShortcut}
    />
  );
}
