"use client";

import Link from "next/link";
import { useI18n } from "../lib/i18n";
import { LanguageSelect } from "./language-select";

export function AuthCard({
  topline,
  kicker,
  title,
  description,
  children,
  showFooter = true,
}: {
  topline: string;
  kicker: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  showFooter?: boolean;
}) {
  const { t, dir } = useI18n();
  return (
    <main className="auth-page" dir={dir}>
      <div className="auth-topline">
        <Link className="brand" href="/" aria-label={t("NEXUS ERP home")}>
          <span className="brand-mark">N</span>
          <span>NEXUS<span className="brand-light"> ERP MS</span></span>
        </Link>
        <div className="auth-topline-tools">
          <span>{t(topline)}</span>
          <LanguageSelect className="locale-select-wrap auth-locale" />
        </div>
      </div>
      <section className="auth-card">
        <span className="auth-kicker">{t(kicker)}</span>
        <h1>{t(title)}</h1>
        {description && <p className="auth-description">{t(description)}</p>}
        {children}
      </section>
      {showFooter && (
        <p className="auth-footer">NEXUS ERP MS <span>•</span> <Link href="/">{t("Return to website")}</Link></p>
      )}
    </main>
  );
}
