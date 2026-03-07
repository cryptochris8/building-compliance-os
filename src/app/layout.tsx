import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Building Compliance OS - LL97 Compliance Made Simple",
    template: "%s | Building Compliance OS",
  },
  description:
    "Building Compliance OS is the easiest way to track NYC Local Law 97 compliance. Calculate building emissions, track deadlines, and generate reports.",
  keywords: [
    "local law 97 compliance software",
    "ll97 calculator",
    "building emissions calculator",
    "nyc building compliance",
    "local law 97",
    "ll97",
    "building emissions tracking",
    "carbon emissions calculator",
    "nyc ll97 penalty calculator",
  ],
  openGraph: {
    title: "Building Compliance OS - LL97 Compliance Made Simple",
    description:
      "Calculate building emissions, track compliance deadlines, and generate reports for NYC Local Law 97.",
    type: "website",
    siteName: "Building Compliance OS",
  },
  twitter: {
    card: "summary_large_image",
    title: "Building Compliance OS - LL97 Compliance Made Simple",
    description:
      "Calculate building emissions, track compliance deadlines, and generate reports for NYC Local Law 97.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
