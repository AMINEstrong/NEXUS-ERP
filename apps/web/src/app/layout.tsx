import type { Metadata } from "next";
import "./styles.css";
import "./login/login.css";

export const metadata: Metadata = {
  title: "NEXUS ERP | Enterprise workspace",
  description: "A connected operating platform for ambitious businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
