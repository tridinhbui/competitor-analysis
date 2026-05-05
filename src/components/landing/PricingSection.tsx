"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, BadgeCheck, Users } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const monthlyPlans = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    period: "mo",
    blurb: "Solo analysts exploring filings at your own pace.",
    highlight: false,
    badge: null as string | null,
    features: ["SEC ticker + PDF 10-Q ingest", "Core dashboard & ratios", "Excel export", "5 saved analyses / mo", "Email support"],
    cta: "Choose plan",
    href: "#payment",
  },
  {
    id: "pro",
    name: "Pro",
    price: 129,
    period: "mo",
    blurb: "Teams that live in comps, decks, and quarterly refresh cycles.",
    highlight: true,
    badge: "Most popular",
    features: [
      "Everything in Starter",
      "Unlimited saved analyses",
      "PPTX deck export",
      "Workspace & peer comparison",
      "Priority support",
      "Shared team workspace (3 seats)",
    ],
    cta: "Choose plan",
    href: "#payment",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: 1499,
    period: "once",
    blurb: "One payment for long-horizon research desks and power users.",
    highlight: false,
    badge: "Best value",
    features: ["All Pro features", "Lifetime product updates", "Early access to new modules", "Dedicated onboarding call"],
    cta: "Buy now",
    href: "#payment",
  },
] as const;

const yearlyPlans = monthlyPlans.map((p) => {
  if (p.id === "lifetime") return { ...p, price: p.price, period: "once" as const };
  const y = p.id === "starter" ? 470 : 1240;
  return { ...p, price: y, period: "yr" as const, blurb: `${p.blurb} (billed annually)` };
});

export function PricingSection() {
  const [yearly, setYearly] = useState(true);
  const [activePlan, setActivePlan] = useState("pro");
  const plans = yearly ? yearlyPlans : monthlyPlans;

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-border bg-white/70 py-16 sm:py-20" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Pricing</p>
          <h2 id="pricing-heading" className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Plans for filing-heavy workflows
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Transparent tiers for analysts and desks. Toggle billing - numbers are illustrative until checkout goes live.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
              <Users className="h-3 w-3" aria-hidden />
              Used by analysts & finance teams
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
              <BadgeCheck className="h-3 w-3 text-primary" aria-hidden />
              Cancel anytime (subscription tiers)
            </span>
          </div>

          <div
            className="mx-auto mt-8 inline-flex rounded-full border border-border bg-secondary p-1 shadow-subtle"
            role="group"
            aria-label="Billing period"
          >
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                "rounded-full px-5 py-2 text-xs font-semibold transition",
                !yearly ? "bg-white text-foreground shadow-subtle" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                "rounded-full px-5 py-2 text-xs font-semibold transition",
                yearly ? "bg-white text-foreground shadow-subtle" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Yearly
              <span className="ml-1.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Save</span>
            </button>
          </div>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.article
              key={plan.id}
              onMouseEnter={() => setActivePlan(plan.id)}
              onFocusCapture={() => setActivePlan(plan.id)}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white/95 p-6 shadow-subtle transition-all hover:-translate-y-1 hover:shadow-elevation sm:p-7",
                plan.highlight
                  ? "border-primary/35 ring-2 ring-primary/15 lg:scale-[1.02]"
                  : "border-border",
                activePlan === plan.id && "ring-2 ring-primary/20 border-primary/35"
              )}
            >
              {plan.badge && (
                <div
                  className={cn(
                    "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-subtle",
                    plan.highlight ? "bg-[#cc521d]" : "bg-[#5f3221]"
                  )}
                >
                  {plan.badge}
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{plan.blurb}</p>
                </div>
                {plan.highlight && <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
              </div>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-bold tabular-nums tracking-tight text-foreground">${plan.price}</span>
                <span className="text-sm font-medium text-muted-foreground">
                  {plan.period === "once" ? " once" : plan.period === "yr" ? " / yr" : " / mo"}
                </span>
              </div>
              {plan.period !== "once" && (
                <p className="mt-2 text-[11px] font-medium text-muted-foreground">Cancel anytime. No lock-in contract.</p>
              )}
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={cn(
                  "mt-8 inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold transition focus-visible:ring-4 focus-visible:outline-none",
                  plan.highlight
                    ? "bg-[#cc521d] text-white shadow-elevation hover:bg-[#b7491a] focus-visible:ring-[#cc521d]/30"
                    : "border border-[#e7c7b7] bg-[#fff6f1] text-[#8c3a15] hover:bg-white focus-visible:ring-[#cc521d]/15"
                )}
              >
                {plan.cta}
              </Link>
            </motion.article>
          ))}
        </div>

        <div className="mx-auto mt-8 grid max-w-4xl gap-3 rounded-2xl border border-border bg-white/90 p-4 shadow-subtle sm:grid-cols-3 sm:p-5">
          <div>
            <p className="text-xs font-semibold text-foreground">FAQ: Can I switch plans later?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Yes. You can upgrade or downgrade at renewal.</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">FAQ: Do you support team seats?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Pro includes shared workspace seats. Enterprise is custom.</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">FAQ: Is my data isolated?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Yes, billing and workspace controls are scoped per account.</p>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Need SOC2, SSO, or a custom data retention policy?{" "}
          <a href="mailto:sales@example.com" className="font-semibold text-primary hover:underline">
            Contact sales
          </a>
        </p>
      </div>
    </section>
  );
}
