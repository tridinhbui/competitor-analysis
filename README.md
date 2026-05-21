# Dividend - 10-Q / SEC Analysis

This [Next.js](https://nextjs.org) app extracts **balance sheet, cash flow, debt structure**, and **dividend analysis** from:

- **Ticker symbols**: the server pipeline calls **SEC EDGAR** (XBRL) and streams progress over SSE (`GET /api/analyze?ticker=`).
- **10-Q PDF files**: processed **in the browser** with pdf.js and the worker in `public/pdf.worker.min.mjs`.

Results are shown in the dashboard as charts and tables, can be exported to **Excel**, and support **analysis chat** (OpenAI) with a reduced JSON context payload.

## Environment variables

Create `.env.local` and do not commit it:

| Variable | Required | Description |
|------|----------|--------|
| `OPENAI_API_KEY` | For chat | [OpenAI API keys](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `SEC_EDGAR_USER_AGENT` | **Recommended in production** | String following [SEC fair access](https://www.sec.gov/os/webmaster-faq#code-support), for example: `TenQAnalyzer/1.0 (you@company.com)` |

If `OPENAI_API_KEY` is missing, the chat button still appears but the API returns `503` with a clear message.

If `SEC_EDGAR_USER_AGENT` is not set, the server uses a default value with a placeholder email. Replace it with a real contact email before running in production.

See the sample file: [`.env.example`](.env.example).

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

## Internal API

- `GET /api/analyze?ticker=AAPL` - SSE stream of pipeline steps plus an `event: result` payload containing `FullAnalysis`.
- `POST /api/chat` - JSON body: `{ messages, context? }` (the OpenAI key stays server-side only).

## Deploy

- Set `OPENAI_API_KEY` and `SEC_EDGAR_USER_AGENT` on your host (Vercel / environment variables); do not commit keys into the repo.
- Respect SEC access limits and do not call `data.sec.gov` directly from the browser. This app already routes those requests through the server.
