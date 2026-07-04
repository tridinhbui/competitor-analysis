import type { Metadata } from "next";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { TokenTrackerFab } from "@/components/layout/TokenTrackerFab";
import { AuthProvider } from "@/lib/authContext";
import { ProfileProvider } from "@/lib/profileContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Competitor Analysis",
  description: "Corporate analysis, planning, and reporting workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="light"
      style={{ colorScheme: "light" }}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-transparent font-serif text-foreground antialiased">
        <AuthProvider>
          <ProfileProvider>
            <AppShellChrome />
            <main className="min-h-[calc(100dvh-2.5rem)]">{children}</main>
            <TokenTrackerFab />
          </ProfileProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
