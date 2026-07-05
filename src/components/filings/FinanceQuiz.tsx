"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BookOpen, CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct: number; // 0-based index
  explanation: string;
  concept: string;
}

const QUIZ: QuizQuestion[] = [
  {
    id: "de",
    concept: "Debt-to-Equity (D/E)",
    question: "A company has total debt of $80M and total equity of $100M. What is its D/E ratio, and how would you interpret it?",
    options: [
      "0.8x — moderate leverage; debt and equity are balanced",
      "1.25x — high leverage; the company is heavily indebted",
      "0.8x — low leverage; conservative balance sheet",
      "1.25x — equity exceeds debt; very safe",
    ],
    correct: 0,
    explanation: "D/E = total debt / total equity = 80/100 = 0.8x. This means debt is 80% of equity — moderate leverage. Typical benchmarks: <0.5x low, 0.5–1.5x moderate, >1.5x high (varies by sector).",
  },
  {
    id: "fcf",
    concept: "Free Cash Flow (FCF)",
    question: "Which formula correctly defines Free Cash Flow?",
    options: [
      "Net Income − Dividends Paid",
      "Operating Cash Flow − Capital Expenditures",
      "Revenue − Operating Expenses",
      "Total Assets − Total Liabilities",
    ],
    correct: 1,
    explanation: "FCF = Operating Cash Flow − CapEx. It represents cash available after maintaining/expanding the business. Used for dividends, buybacks, debt paydown, or M&A.",
  },
  {
    id: "payout",
    concept: "Payout Ratio",
    question: "A company pays $40M in dividends and reports net income of $100M. What is the payout ratio, and is it generally considered sustainable?",
    options: [
      "40% — yes, conservative; room for reinvestment",
      "250% — no, dividends exceed earnings",
      "40% — no, too high to sustain",
      "2.5x — yes, earnings cover dividends well",
    ],
    correct: 0,
    explanation: "Payout ratio = dividends / net income = 40/100 = 40%. Below 60% is typically conservative; 60–80% moderate; above 80% or above FCF is stretched.",
  },
  {
    id: "interest",
    concept: "Interest Coverage",
    question: "Operating income is $50M and interest expense is $10M. What is the interest coverage ratio?",
    options: [
      "5x — company can pay interest 5 times from operating profit",
      "0.2x — interest exceeds operating profit",
      "50x — very strong coverage",
      "10x — weak; refinancing risk",
    ],
    correct: 0,
    explanation: "Interest coverage = Operating Income / Interest Expense = 50/10 = 5x. The company earns 5× its interest bill from operations. >8x very strong; 4–8x healthy; <2x concerning.",
  },
  {
    id: "current",
    concept: "Current Ratio",
    question: "Current assets are $120M and current liabilities are $80M. What does the current ratio tell you?",
    options: [
      "1.5x — insufficient to cover short-term obligations",
      "1.5x — sufficient liquidity; can meet short-term obligations",
      "0.67x — company is illiquid",
      "2x — excessive liquidity; inefficient",
    ],
    correct: 1,
    explanation: "Current ratio = Current Assets / Current Liabilities = 120/80 = 1.5x. Above 1.0 means the company can cover short-term debts. >2x ample; 1–2x normal; <1x potential stress.",
  },
  {
    id: "netdebt",
    concept: "Net Debt",
    question: "Total debt is $100M and cash is $30M. What is net debt, and why does it matter?",
    options: [
      "$130M — gross debt plus cash reserves",
      "$70M — debt minus cash; reflects true leverage",
      "$70M — same as total debt for analysis",
      "$30M — cash net of debt",
    ],
    correct: 1,
    explanation: "Net debt = Total debt − Cash = 100 − 30 = $70M. It reflects leverage net of liquid assets. Used with EBITDA for Net Debt/EBITDA — a key leverage metric.",
  },
  {
    id: "fcfcover",
    concept: "FCF Dividend Coverage",
    question: "FCF is $60M and dividends paid are $20M. FCF covers dividends how many times?",
    options: [
      "3x — dividends exceed FCF; unsustainable",
      "0.33x — FCF covers dividends 3 times",
      "3x — FCF covers dividends comfortably",
      "80% — payout ratio",
    ],
    correct: 2,
    explanation: "Coverage = FCF / Dividends = 60/20 = 3x. FCF could pay dividends 3× over. >2x comfortable; 1–2x adequate; <1x unsustainable long term.",
  },
  {
    id: "reconcile",
    concept: "Balance Sheet Identity",
    question: "Why should Assets ≈ Liabilities + Equity?",
    options: [
      "They don't have to match; it's optional",
      "Accounting identity: assets are financed by debt and equity",
      "Only for banks; different for industrials",
      "Equity is always larger than assets",
    ],
    correct: 1,
    explanation: "Assets = Liabilities + Equity is the fundamental accounting equation. Everything the company owns (assets) is financed by what it owes (liabilities) or owners' stake (equity). A large gap suggests extraction errors.",
  },
  {
    id: "ndebtebitda",
    concept: "Net Debt / EBITDA",
    question: "Net debt is $200M and EBITDA is $80M. Net debt/EBITDA is 2.5x. How would a credit analyst view this?",
    options: [
      "Very high leverage; distressed",
      "Within investment-grade range; manageable",
      "Net cash position; no concern",
      "Irrelevant for credit analysis",
    ],
    correct: 1,
    explanation: "Net debt/EBITDA = 200/80 = 2.5x. Typical ranges: <1x low; 1–2.5x investment grade; 2.5–4x high yield; >4x stressed. 2.5x is at the upper end of IG territory.",
  },
  {
    id: "ocfquality",
    concept: "Cash Flow Quality",
    question: "Operating cash flow is $100M and net income is $80M. OCF/Net Income = 1.25. What does this suggest?",
    options: [
      "Earnings quality concern — OCF trails net income",
      "Strong earnings quality — cash exceeds accrual earnings",
      "Company is losing money",
      "Payout ratio is 125%",
    ],
    correct: 1,
    explanation: "When OCF > Net Income, cash generation exceeds reported earnings. This often indicates conservative accounting, non-cash charges (D&A), or working capital benefits. High-quality earnings signal.",
  },
];

export function FinanceQuiz() {
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const [showResults, setShowResults] = useState(false);

  const q = QUIZ[current];
  const lastQuestionAnswered = current === QUIZ.length - 1 && selected !== null;
  const isComplete = showResults && score.length === QUIZ.length;
  const correctCount = score.filter((s) => s === 1).length;

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    setScore((prev) => [...prev, idx === q.correct ? 1 : 0]);
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (current < QUIZ.length - 1) {
      setCurrent((c) => c + 1);
      setSelected(null);
      setShowExplanation(false);
    }
  };

  const handleRetry = () => {
    setCurrent(0);
    setSelected(null);
    setShowExplanation(false);
    setShowResults(false);
    setScore([]);
    setStarted(false);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between bg-gradient-to-r from-primary/5 via-white to-primary/5 px-3 py-2 text-left sm:px-4 sm:py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-900 sm:text-sm">Practice: Financial Concepts Quiz</p>
            <p className="truncate text-[10px] text-slate-500 sm:text-[11px]">D/E, FCF, payout ratio, leverage</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="border-t border-slate-100 p-4 sm:p-5">
          {!started ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {QUIZ.length} multiple-choice questions on dividend analysis, leverage, cash flow, and balance sheet concepts. Each answer includes an explanation to reinforce learning.
              </p>
              <button
                type="button"
                onClick={() => { setStarted(true); setCurrent(0); }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:bg-primary/90"
              >
                Start Quiz
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${((current + (selected !== null ? 1 : 0)) / QUIZ.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {current + 1}/{QUIZ.length}
                </span>
              </div>

              {!isComplete ? (
                <>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
                    {q.concept}
                  </div>
                  <p className="text-sm font-medium text-slate-900 sm:text-base">{q.question}</p>
                  <div className="space-y-2">
                    {q.options.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelect(idx)}
                        disabled={selected !== null}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition sm:py-3",
                          selected === null &&
                            "border-slate-200 bg-white hover:border-primary/40 hover:bg-primary/5",
                          selected !== null && idx === q.correct &&
                            "border-emerald-200 bg-emerald-50",
                          selected !== null && idx === selected && idx !== q.correct &&
                            "border-red-200 bg-red-50",
                          selected !== null && idx !== selected && idx !== q.correct &&
                            "border-slate-100 bg-slate-50/50 opacity-75"
                        )}
                      >
                        {selected !== null && idx === q.correct && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        )}
                        {selected !== null && idx === selected && idx !== q.correct && (
                          <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                        )}
                        <span className="flex-1">{opt}</span>
                      </button>
                    ))}
                  </div>

                  {showExplanation && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-primary/70">Explanation</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{q.explanation}</p>
                      {current < QUIZ.length - 1 ? (
                        <button
                          type="button"
                          onClick={handleNext}
                          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
                        >
                          Next Question
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowResults(true)}
                          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90"
                        >
                          See Results
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4 text-center">
                  <p className="text-lg font-bold text-slate-900">Quiz Complete</p>
                  <p className="text-2xl font-bold text-primary">
                    {correctCount}/{QUIZ.length} correct ({Math.round((correctCount / QUIZ.length) * 100)}%)
                  </p>
                  <p className="text-sm text-slate-600">
                    {correctCount === QUIZ.length
                      ? "Perfect score! You've mastered these concepts."
                      : "Review the explanations to reinforce the concepts."}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-subtle transition hover:bg-primary/90"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retry Quiz
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
