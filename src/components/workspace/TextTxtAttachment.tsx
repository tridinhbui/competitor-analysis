"use client";

import { SourceTxtFileCard } from "@/components/workspace/SourceTxtFileCard";
import { cn } from "@/lib/utils";

interface TextTxtAttachmentProps {
  file: File;
  onRemove: () => void;
  className?: string;
  startCollapsed?: boolean;
  onExpandRequest?: () => void;
}

export function TextTxtAttachment({
  file,
  onRemove,
  className,
  startCollapsed,
  onExpandRequest,
}: TextTxtAttachmentProps) {
  return (
    <SourceTxtFileCard
      fileName={file.name}
      sizeBytes={file.size}
      onRemove={onRemove}
      className={cn(className)}
      startCollapsed={startCollapsed}
      onExpandRequest={onExpandRequest}
    />
  );
}
