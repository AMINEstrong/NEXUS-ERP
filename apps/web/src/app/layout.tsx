import type { Metadata } from "next";
import { LocaleProvider } from "../lib/locale-provider";
import "./styles.css";
import "./login/login.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "NEXUS ERP | Enterprise workspace",
  description: "A connected operating platform for ambitious businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}
