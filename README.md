# Dividend — Phân tích 10-Q / SEC

Ứng dụng [Next.js](https://nextjs.org) trích xuất **bảng cân đối, dòng tiền, cấu trúc nợ** và **đánh giá cổ tức** từ:

- **Mã cổ phiếu**: pipeline server gọi **SEC EDGAR** (XBRL), stream tiến trình qua SSE (`GET /api/analyze?ticker=`).
- **File PDF 10-Q**: xử lý **trên trình duyệt** (pdf.js + worker trong `public/pdf.worker.min.mjs`).

Kết quả hiển thị trên dashboard (biểu đồ, bảng), xuất **Excel**, và **chat phân tích** (OpenAI) có kèm context JSON rút gọn.

## Biến môi trường

Tạo `.env.local` (không commit):

| Biến | Bắt buộc | Mô tả |
|------|----------|--------|
| `OPENAI_API_KEY` | Cho chat | [OpenAI API keys](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | Không | Mặc định `gpt-4o-mini` |
| `SEC_EDGAR_USER_AGENT` | **Khuyến nghị khi deploy** | Chuỗi theo [SEC fair access](https://www.sec.gov/os/webmaster-faq#code-support), ví dụ: `TenQAnalyzer/1.0 (you@company.com)` |

Nếu thiếu `OPENAI_API_KEY`, nút chat vẫn hiện nhưng API trả `503` và thông báo rõ.

Nếu không đặt `SEC_EDGAR_USER_AGENT`, server dùng giá trị mặc định có placeholder email — **hãy đổi sang email thật** trước khi chạy production.

Xem mẫu: [`.env.example`](.env.example).

## Chạy local

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

## API nội bộ

- `GET /api/analyze?ticker=AAPL` — SSE: các bước pipeline + sự kiện `event: result` chứa `FullAnalysis`.
- `POST /api/chat` — body JSON: `{ messages, context? }` (key OpenAI chỉ trên server).

## Deploy

- Đặt `OPENAI_API_KEY` và `SEC_EDGAR_USER_AGENT` trên host (Vercel / env), không đưa key vào repo.
- Tuân thủ giới hạn truy cập SEC; không gọi `data.sec.gov` trực tiếp từ trình duyệt người dùng (ứng dụng đã gọi từ server).
