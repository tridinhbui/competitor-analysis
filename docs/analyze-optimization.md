# Tối ưu trang `/analyze` — đã làm gì

Tài liệu ghi lại các thay đổi nhằm **giảm JS client bundle** và **giảm tải không cần thiết lúc idle**, giữ nguyên pipeline SEC (SSE) và PDF.

## Branch và đợt commit (nhỏ, dễ review)

**Branch:** `feat/analyze-optimization-split` — push: `git push -u origin feat/analyze-optimization-split`.

Các commit được tách theo chủ đề (đọc PR/commit lần lượt):

| Đợt | Commit | Nội dung |
|-----|--------|----------|
| 1 | `0d1b520` | `chatJsonRunner` (retry 429/5xx, `safeJsonParse`, log metadata); `filingTextExtractor` dùng runner; `analyzePdf/verboseLog` + ghi chú `ANALYZE_PDF_DEBUG` trong `debugLogger` |
| 2 | `075acbf` | Prompt LLM analyze-pdf → `src/lib/prompts/analyzePdf/*` |
| 3 | `a1d4ce9` | Pipeline → `src/lib/analyzePdf/*` + `route.ts` chỉ HTTP; sửa map segment bị corrupt |
| 4 | `ad67294` | Client `/analyze`: `analyzeDynamic.tsx`, thư mục `analysis-dashboard/*`, lazy Snapshot, bounded events |
| 5 | _(docs)_ | Cập nhật `docs/analyze-optimization.md`: mục branch, bảng đợt commit; xem `git log --oneline -- docs/analyze-optimization.md` |

## Code splitting (lazy load)

| Thành phần | Cách làm | File |
|------------|----------|------|
| Dashboard (recharts nặng) | `next/dynamic`, `ssr: false`, skeleton khi tải chunk | `src/components/filings/analyzeDynamic.tsx` → dùng trong `TenQDropAnalyzer.tsx` |
| PDF viewer (canvas + pdf.js) | `next/dynamic`, `ssr: false`, placeholder “Loading PDF viewer…” | Cùng `analyzeDynamic.tsx` |
| Chat panel (react-markdown) | `next/dynamic`, `ssr: false` | Cùng `analyzeDynamic.tsx` |
| Tab Snapshot | `OverviewSnapshotPanel` chỉ load khi user vào tab Snapshot | `src/components/filings/AnalyzeHub.tsx` |

**Kết quả mong đợi:** tab Extract idle không kéo theo chunk lớn của dashboard, chat (markdown), viewer PDF, hay snapshot recharts cho đến khi luồng UI thực sự cần.

## Bounded pipeline events

- Giới hạn mảng `events` (SSE + bước PDF client) tối đa **400** phần tử, tránh phình bộ nhớ khi stream dài.
- Hàm `appendPipelineEvent` dùng chung cho SEC và PDF trong `TenQDropAnalyzer.tsx`.

## Ghi chú pdf.js (hai entry, cùng on-demand)

- **`src/lib/pdfAnalysis.ts`:** trích text cho pipeline → load `/public/pdf.min.mjs` khi chạy analyze PDF.
- **`src/components/filings/PdfViewer.tsx`:** preview canvas → load cùng script khi component mount với file.

Không bundle pdfjs qua npm cho luồng này; trình duyệt tải từ `/public` khi cần.

## Tách `AnalysisDashboard` → `src/components/filings/analysis-dashboard/`

- **`AnalysisDashboard.tsx`**: compose + tab bar + `dynamic()` tab **Insights** (chunk + skeleton “Loading insights…”).
- **`traceTypes.ts`**: `TraceMetric` (re-export từ `AnalysisDashboard.tsx`).
- **`analysisDashboardConstants.ts`**, **`analysisDashboardPrimitives.tsx`**, **`analysisDashboardCharts.tsx`** (`ChartFrame`).
- **Tab:** `AnalysisDashboardSummaryTab`, `IncomeTab`, `BalanceTab`, `CashflowTab`, `DeepDiveTab`.
- **`AnalysisDashboardInsightsTab.tsx`**: compose tab Insights; logic trong `useInsightsTabModel.ts`, UI tách section (`InsightsTab*Section.tsx`).

## Server — `analyze-pdf` pipeline

- **`src/app/api/analyze-pdf/route.ts`**: chỉ HTTP (env, body, `shouldRunExtraction`, gọi pipeline, `NextResponse`).
- **`src/lib/analyzePdf/`**: `runPipeline.ts` (orchestrate OpenAI + merge + `assembleAnalysis`), `sectionExtractor.ts`, `extractionTypes.ts`, `aiItems.ts`, `numerics.ts`, `repairFinancial.ts`, `tokensFor.ts`, `verboseLog.ts` (log chi tiết khi `ANALYZE_PDF_DEBUG=1` và không phải production).
- **`src/lib/prompts/analyzePdf/`**: prompt BS, IS+CF, qualitative, segments.
- **`src/lib/openai/chatJsonRunner.ts`**: gọi Chat Completions `json_object`, retry 429/5xx, timeout, `safeJsonParse`; log metadata qua `debugLog` (tắt ở production). `filingTextExtractor.ts` dùng chung runner cho các call OpenAI tương tự.

## File đã chạm

- `src/components/filings/analyzeDynamic.tsx` (mới)
- `src/components/filings/TenQDropAnalyzer.tsx`
- `src/components/filings/AnalyzeHub.tsx`
- `src/components/filings/AnalysisDashboard.tsx` + `src/components/filings/analysis-dashboard/*`
- `src/lib/pdfAnalysis.ts` (comment)
- `src/components/filings/PdfViewer.tsx` (comment)
- `src/app/api/analyze-pdf/route.ts`, `src/lib/analyzePdf/*`, `src/lib/prompts/analyzePdf/*`, `src/lib/openai/chatJsonRunner.ts`, `src/lib/filingTextExtractor.ts`, `src/lib/debugLogger.ts` (comment)

**Chưa đổi (theo scope cũ):** `src/app/api/analyze/route.ts`. `analyze-pdf` đã tách module như mục trên.

## Cách tự kiểm tra

1. **Chức năng:** `/analyze` — Extract: idle, ticker SEC, upload PDF, lỗi, reset; tab Snapshot: load overview.
2. **Network (DevTools):** so sánh số request/chunk JS khi mới vào Extract idle trước và sau (sau refactor, idle nhẹ hơn vì dashboard/chat/pdf/snapshot tách chunk).
3. **Build:** `npm run build` — đảm bảo không lỗi TypeScript/build.

## Gợi ý bước tiếp (chưa làm)

- Cài `@next/bundle-analyzer` để có báo cáo chunk theo route.
- Lazy thêm các tab dashboard ít dùng (nếu đo được lợi ích so với UX).
