"use client";

import { LanguageSelect } from "../components/language-select";
import { useI18n } from "../lib/i18n";

export default function HomePage() {
  const { t } = useI18n();
  return (
    <main className="shell">
      <nav className="topbar" aria-label={t("Main navigation")}>
        <a className="brand" href="#top" aria-label={t("NEXUS home")}>
          <span className="brand-mark">N</span>
          <span>NEXUS<span className="brand-light">ERP</span></span>
        </a>
        <div className="nav-links">
          <a href="#platform">{t("Platform")}</a>
          <a href="#modules">{t("Modules")}</a>
          <a href="#about">{t("About")}</a>
        </div>
        <div className="nav-actions">
          <LanguageSelect className="nav-locale" />
          <a className="nav-login" href="/login">{t("Sign in")} <span aria-hidden="true">↗</span></a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> {t("ONE PLATFORM. EVERY WORKFLOW.")}</div>
          <h1>{t("Clarity for every")}<br />{t("part of")} <em>{t("business.")}</em></h1>
          <p className="hero-description">{t("Bring finance, operations and people into one clear view. NEXUS connects the moving parts so your team can focus on what comes next.")}</p>
          <div className="hero-actions">
            <a className="button-primary" href="#platform">{t("Explore the platform")} <span aria-hidden="true">→</span></a>
            <a className="text-link" href="#about">{t("See how it fits")} <span aria-hidden="true">↗</span></a>
          </div>
          <div className="trust-note"><span className="trust-dot" /> {t("Built for teams that move business forward")}</div>
        </div>

        <div className="hero-visual" aria-label={t("Illustration of a unified business workspace")}>
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="workspace-card">
            <div className="workspace-head">
              <div><div className="micro-label">{t("WORKSPACE OVERVIEW")}</div><div className="workspace-title">{t("One clear view of work")} <span>✳</span></div></div>
              <div className="avatar">AK</div>
            </div>
            <div className="workspace-period">{t("Operations")} <span>·</span> {t("Finance")} <span>·</span> {t("People")}</div>
            <div className="metric-grid">
              <div className="metric"><span>{t("REVENUE")}</span><strong>— —</strong><small>{t("Connect your data")}</small></div>
              <div className="metric"><span>{t("OPEN ORDERS")}</span><strong>— —</strong><small>{t("Ready when you are")}</small></div>
            </div>
            <div className="chart-panel">
              <div className="chart-head"><span>{t("Business pulse")}</span><span className="chart-filter">{t("Last 30 days")}⌄</span></div>
              <div className="chart-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              <div className="chart-labels"><span>01</span><span>08</span><span>15</span><span>22</span><span>30</span></div>
            </div>
            <div className="activity-row"><span className="activity-icon">↗</span><span>{t("Everything in one workspace")}</span><span className="activity-status">{t("CONNECTED")}</span></div>
          </div>
          <div className="float-tag tag-finance"><span className="tag-icon">◒</span><span><b>{t("Finance")}</b><small>{t("In sync")}</small></span><span className="tag-arrow">↗</span></div>
          <div className="float-tag tag-operations"><span className="tag-icon">⌘</span><span><b>{t("Operations")}</b><small>{t("In motion")}</small></span><span className="tag-arrow">↗</span></div>
          <div className="visual-caption">{t("ONE CONNECTED WORKSPACE")} <span>01 / 03</span></div>
        </div>
      </section>

      <section className="capabilities" id="platform">
        <div className="cap-intro"><span className="section-kicker">{t("A BETTER WAY TO WORK")}</span><h2>{t("Built around the way")}<br />{t("your business")} <em>{t("moves.")}</em></h2></div>
        <p>{t("From the first customer conversation to the final financial report, your teams share one source of truth.")}</p>
        <div className="cap-card" id="modules"><span className="cap-number">01</span><div className="cap-symbol">◌</div><h3>{t("See the whole picture")}</h3><p>{t("Finance and operations, connected in real time.")}</p></div>
        <div className="cap-card"><span className="cap-number">02</span><div className="cap-symbol">↗</div><h3>{t("Move with confidence")}</h3><p>{t("Clear workflows with every next step in reach.")}</p></div>
        <div className="cap-card" id="about"><span className="cap-number">03</span><div className="cap-symbol">⌘</div><h3>{t("Grow on your terms")}</h3><p>{t("A flexible foundation for the business ahead.")}</p></div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">ERP</span></span></a><span>{t("One platform for the work that moves you.")}</span><span>© 2026 NEXUS ERP</span></footer>
    </main>
  );
}
