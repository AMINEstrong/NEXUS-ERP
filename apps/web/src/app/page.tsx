export default function HomePage() {
  return (
    <main className="shell">
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="NEXUS home">
          <span className="brand-mark">N</span>
          <span>NEXUS<span className="brand-light">ERP</span></span>
        </a>
        <div className="nav-links">
          <a href="#platform">Platform</a>
          <a href="#modules">Modules</a>
          <a href="#about">About</a>
        </div>
        <a className="nav-login" href="/login">Sign in <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse" /> ONE PLATFORM. EVERY WORKFLOW.</div>
          <h1>Clarity for every<br />part of <em>business.</em></h1>
          <p className="hero-description">Bring finance, operations and people into one clear view. NEXUS connects the moving parts so your team can focus on what comes next.</p>
          <div className="hero-actions">
            <a className="button-primary" href="#platform">Explore the platform <span aria-hidden="true">→</span></a>
            <a className="text-link" href="#about">See how it fits <span aria-hidden="true">↗</span></a>
          </div>
          <div className="trust-note"><span className="trust-dot" /> Built for teams that move business forward</div>
        </div>

        <div className="hero-visual" aria-label="Illustration of a unified business workspace">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="workspace-card">
            <div className="workspace-head">
              <div><div className="micro-label">WORKSPACE OVERVIEW</div><div className="workspace-title">One clear view of work <span>✳</span></div></div>
              <div className="avatar">AK</div>
            </div>
            <div className="workspace-period">Operations <span>·</span> Finance <span>·</span> People</div>
            <div className="metric-grid">
              <div className="metric"><span>REVENUE</span><strong>— —</strong><small>Connect your data</small></div>
              <div className="metric"><span>OPEN ORDERS</span><strong>— —</strong><small>Ready when you are</small></div>
            </div>
            <div className="chart-panel">
              <div className="chart-head"><span>Business pulse</span><span className="chart-filter">Last 30 days⌄</span></div>
              <div className="chart-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              <div className="chart-labels"><span>01</span><span>08</span><span>15</span><span>22</span><span>30</span></div>
            </div>
            <div className="activity-row"><span className="activity-icon">↗</span><span>Everything in one workspace</span><span className="activity-status">CONNECTED</span></div>
          </div>
          <div className="float-tag tag-finance"><span className="tag-icon">◒</span><span><b>Finance</b><small>In sync</small></span><span className="tag-arrow">↗</span></div>
          <div className="float-tag tag-operations"><span className="tag-icon">⌘</span><span><b>Operations</b><small>In motion</small></span><span className="tag-arrow">↗</span></div>
          <div className="visual-caption">ONE CONNECTED WORKSPACE <span>01 / 03</span></div>
        </div>
      </section>

      <section className="capabilities" id="platform">
        <div className="cap-intro"><span className="section-kicker">A BETTER WAY TO WORK</span><h2>Built around the way<br />your business <em>moves.</em></h2></div>
        <p>From the first customer conversation to the final financial report, your teams share one source of truth.</p>
        <div className="cap-card" id="modules"><span className="cap-number">01</span><div className="cap-symbol">◌</div><h3>See the whole picture</h3><p>Finance and operations, connected in real time.</p></div>
        <div className="cap-card"><span className="cap-number">02</span><div className="cap-symbol">↗</div><h3>Move with confidence</h3><p>Clear workflows with every next step in reach.</p></div>
        <div className="cap-card" id="about"><span className="cap-number">03</span><div className="cap-symbol">⌘</div><h3>Grow on your terms</h3><p>A flexible foundation for the business ahead.</p></div>
      </section>

      <footer><a className="brand" href="#top"><span className="brand-mark">N</span><span>NEXUS<span className="brand-light">ERP</span></span></a><span>One platform for the work that moves you.</span><span>© 2026 NEXUS ERP</span></footer>
    </main>
  );
}
