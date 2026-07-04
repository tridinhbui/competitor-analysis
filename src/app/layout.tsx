import type { Metadata } from "next";
import { Merriweather, Montserrat } from "next/font/google";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { TokenTrackerFab } from "@/components/layout/TokenTrackerFab";
import { AuthProvider } from "@/lib/authContext";
import { ProfileProvider } from "@/lib/profileContext";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-heading",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Strategy Hub",
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
      className={`light ${montserrat.variable} ${merriweather.variable}`}
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
