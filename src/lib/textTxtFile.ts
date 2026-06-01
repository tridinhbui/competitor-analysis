/** Minimum pasted character count before we materialize a .txt File (ChatGPT-style attachment). */
export const TEXT_TXT_AUTO_ATTACH_CHARS = 500;

const TEXT_LIKE_EXTENSIONS = new Set(["txt", "text", "md", "markdown", "log", "csv"]);

export function isTextLikeFile(file: File): boolean {
  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
  if (ext && TEXT_LIKE_EXTENSIONS.has(ext)) return true;
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json") return true;
  return false;
}

export function sanitizeTxtBaseName(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/i, "").trim() || "document";
  const safe = withoutExt.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe.slice(0, 72) || "document";
}

/** Build an in-memory UTF-8 .txt file from string content. */
export function textContentToTxtFile(content: string, baseName: string): File {
  const base = sanitizeTxtBaseName(baseName);
  return new File([content], `${base}.txt`, {
    type: "text/plain;charset=utf-8",
    lastModified: Date.now(),
  });
}

/** Read any text-like upload and re-wrap as a normalized .txt File. */
export async function normalizeUploadToTxtFile(file: File): Promise<{ file: File; text: string }> {
  const text = await file.text();
  const wrapped = textContentToTxtFile(text, file.name);
  return { file: wrapped, text };
}

export function formatTxtFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readTxtFileContent(file: File | null): Promise<string> {
  if (!file) return "";
  return file.text();
}

export function truncateTxtFileName(name: string, maxLen = 32): string {
  if (name.length <= maxLen) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const baseLen = Math.max(8, maxLen - ext.length - 1);
  return `${name.slice(0, baseLen)}…${ext}`;
}

/** Display name for a saved analysis source (persisted or derived). */
export function resolveSourceTxtFileName(opts: {
  sourceFileName?: string;
  textFileName?: string;
  pdfFileName?: string;
  sessionTitle?: string;
}): string {
  if (opts.sourceFileName?.trim()) return opts.sourceFileName.trim();
  if (opts.textFileName?.trim()) return opts.textFileName.trim();
  if (opts.pdfFileName?.trim()) {
    return `${sanitizeTxtBaseName(opts.pdfFileName)}-transcript.txt`;
  }
  return `${sanitizeTxtBaseName(opts.sessionTitle ?? "transcript")}.txt`;
}
