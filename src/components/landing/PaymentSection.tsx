"use client";

import { CreditCard, Lock, Shield, RefreshCw, BadgeCheck, Wallet } from "lucide-react";
import { motion } from "framer-motion";

const methods = [
  { label: "Visa", sub: "Corporate cards" },
  { label: "Mastercard", sub: "Corporate cards" },
  { label: "Amex", sub: "Executive cards" },
  { label: "ACH", sub: "US bank transfer" },
  { label: "Wire", sub: "Treasury workflow" },
  { label: "Invoice", sub: "AP / procurement" },
] as const;

export function PaymentSection() {
  return (
    <section
      id="payment"
      className="scroll-mt-20 border-t border-border bg-gradient-to-b from-secondary/70 to-white py-16 sm:py-20"
      aria-labelledby="payment-heading"
    >
      <div className="mx-auto max-w-3xl px-4">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Checkout</p>
          <h2 id="payment-heading" className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Finance-controlled checkout (coming soon)
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            This is a <strong className="font-semibold text-foreground">UI preview</strong> - no charges are processed
            in-app yet. When billing goes live, checkout will support annual finance-team plans and procurement-friendly
            payment flows.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
            Secure checkout preview
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="mt-10 rounded-3xl border border-border bg-white p-6 shadow-elevation sm:p-8"
        >
          <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-secondary/55 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Mock checkout card</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Strategic Finance Team | Annual billing</p>
              <p className="mt-1 text-xs text-muted-foreground">5 seats included | next renewal in 365 days</p>
            </div>
            <div className="rounded-xl border border-border bg-white px-4 py-3 text-right shadow-subtle">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Amount due</p>
              <p className="text-xl font-bold tabular-nums text-foreground">$2,490.00</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#cc521d] px-4 py-2.5 text-xs font-semibold text-white shadow-subtle transition hover:bg-[#b7491a] sm:col-span-2"
            >
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              Continue to secure checkout (preview)
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 border-b border-border/60 pb-6">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5">
              <Lock className="h-4 w-4 text-emerald-600" aria-hidden />
              <span className="text-xs font-semibold text-foreground">TLS-encrypted checkout</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5">
              <Shield className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-xs font-semibold text-foreground">Finance and procurement ready</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5">
              <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-xs font-semibold text-foreground">Seat-managed subscriptions</span>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Accepted methods (preview)
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {methods.map((m) => (
              <div
                key={m.label}
                className="flex flex-col items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-white to-secondary px-3 py-4 text-center shadow-subtle"
              >
                <CreditCard className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
                <span className="text-xs font-bold text-foreground">{m.label}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">{m.sub}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-dashed border-border bg-secondary/60 p-4 text-center text-xs text-muted-foreground">
            <p>Procurement terms, seat policies, and billing controls will be published before charges are enabled.</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
