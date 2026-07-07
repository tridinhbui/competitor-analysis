"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Globe,
  Clock,
  BarChart2,
  FileText,
  Star,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useProfile } from "@/lib/profileContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import type { UserProfile } from "@/lib/profileContext";
import { cn } from "@/lib/utils";

// ── constants ────────────────────────────────────────────────────────────────

const ROLES = [
  { value: "analyst", label: "Analyst" },
  { value: "investor", label: "Investor" },
  { value: "founder", label: "Founder" },
  { value: "student", label: "Student" },
] as const;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "vi", label: "Vietnamese" },
] as const;

const DEPTHS = [
  { value: "quick", label: "Quick", desc: "Key takeaways only" },
  { value: "standard", label: "Standard", desc: "Balanced depth" },
  { value: "deep", label: "Deep", desc: "Full analysis" },
] as const;

const OUTPUT_STYLES = [
  { value: "bullet", label: "Bullet", desc: "Concise bullets" },
  { value: "executive", label: "Executive", desc: "Exec summary style" },
  { value: "report", label: "Report", desc: "Full narrative" },
] as const;

const MODULES = [
  "Revenue",
  "Margins",
  "Cash Flow",
  "Leverage",
  "Dividends",
  "Valuation",
  "Peer Comparison",
  "Macro Insights",
  "Segment Analysis",
  "Guidance",
] as const;

// ── helpers ───────────────────────────────────────────────────────────────────

function SelectField({
  label,
  icon: Icon,
  value,
  onChange,
  options,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string; desc?: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}{o.desc ? ` — ${o.desc}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>
    </div>
  );
}

function ModuleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      {label}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfilePageContent />
    </RequireAuth>
  );
}

function ProfilePageContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, upsertProfile } = useProfile();

  const [form, setForm] = useState<{
    full_name: string;
    role: string;
    language: string;
    timezone: string;
    default_analysis_depth: string;
    default_output_style: string;
    favorite_modules: string[];
  }>({
    full_name: "",
    role: "",
    language: "en",
    timezone: "",
    default_analysis_depth: "standard",
    default_output_style: "bullet",
    favorite_modules: [],
  });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        role: profile.role ?? "",
        language: profile.language ?? "en",
        timezone: profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        default_analysis_depth: profile.default_analysis_depth ?? "standard",
        default_output_style: profile.default_output_style ?? "bullet",
        favorite_modules: profile.favorite_modules ?? [],
      });
    } else if (!profileLoading && user) {
      setForm((f) => ({
        ...f,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }));
    }
  }, [profile, profileLoading, user]);

  const toggleModule = (m: string) => {
    setForm((f) => ({
      ...f,
      favorite_modules: f.favorite_modules.includes(m)
        ? f.favorite_modules.filter((x) => x !== m)
        : [...f.favorite_modules, m],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    setSaveError(null);

    const err = await upsertProfile({
      full_name: form.full_name || null,
      role: (form.role || null) as UserProfile["role"],
      language: form.language as UserProfile["language"],
      timezone: form.timezone || null,
      default_analysis_depth: form.default_analysis_depth as UserProfile["default_analysis_depth"],
      default_output_style: form.default_output_style as UserProfile["default_output_style"],
      favorite_modules: form.favorite_modules,
    });

    setSaving(false);
    if (err) {
      setSaveStatus("error");
      setSaveError(err);
    } else {
      setSaveStatus("success");
      setTimeout(() => router.replace("/analyze"), 1200);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!user) return null;

  const avatarUrl =
    profile?.avatar_url ??
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;
  const email = profile?.email ?? user.email ?? "";
  const provider = profile?.provider ?? "email";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-xl font-bold tracking-tight text-slate-900">
        My Profile
      </h1>

      <div className="space-y-4">
        {/* ── Header card ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
          <div className="relative flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={form.full_name || "avatar"}
                referrerPolicy="no-referrer"
                className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-200"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-2 ring-slate-200">
                <User className="h-8 w-8 text-primary" />
              </div>
            )}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                provider === "google"
                  ? "bg-blue-100 text-blue-600"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {provider}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="space-y-1.5">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Your name"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
                />
              </div>
              <div className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Preferences ─────────────────────────────────────────────── */}
        <Section title="Preferences">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Role"
              icon={User}
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              options={[{ value: "", label: "Select your role" }, ...ROLES]}
            />
            <SelectField
              label="Language"
              icon={Globe}
              value={form.language}
              onChange={(v) => setForm((f) => ({ ...f, language: v }))}
              options={LANGUAGES}
            />
            <SelectField
              label="Analysis Depth"
              icon={BarChart2}
              value={form.default_analysis_depth}
              onChange={(v) => setForm((f) => ({ ...f, default_analysis_depth: v }))}
              options={DEPTHS}
            />
            <SelectField
              label="Output Style"
              icon={FileText}
              value={form.default_output_style}
              onChange={(v) => setForm((f) => ({ ...f, default_output_style: v }))}
              options={OUTPUT_STYLES}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Clock className="h-3.5 w-3.5" />
              Timezone
            </label>
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              placeholder="e.g. Asia/Ho_Chi_Minh"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </Section>

        {/* ── Favourite modules ────────────────────────────────────────── */}
        <Section title="Favourite Modules">
          <p className="mb-3 text-xs text-slate-500">
            Modules you care about most — shown first in analyses.
          </p>
          <div className="flex flex-wrap gap-2">
            {MODULES.map((m) => (
              <ModuleChip
                key={m}
                label={m}
                active={form.favorite_modules.includes(m)}
                onClick={() => toggleModule(m)}
              />
            ))}
          </div>
          {form.favorite_modules.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-400">
              <Star className="mr-0.5 inline h-3 w-3 text-amber-400" />
              {form.favorite_modules.length} selected
            </p>
          )}
        </Section>

        {/* ── Save ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-3">
          {saveStatus === "success" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Profile saved successfully.
            </p>
          )}
          {saveStatus === "error" && saveError && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertCircle className="h-4 w-4" />
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
