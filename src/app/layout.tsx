import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AuthProvider } from "@/lib/authContext";
import { ProfileProvider } from "@/lib/profileContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dividend IQ · Analyst",
  description: "Intelligent Financial Analysis & Reporting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body className="min-h-dvh bg-transparent font-[Inter] text-foreground antialiased">
        <AuthProvider>
          <ProfileProvider>
            <AppShellChrome />
            <main className="min-h-[calc(100dvh-2.5rem)]">{children}</main>
          </ProfileProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
