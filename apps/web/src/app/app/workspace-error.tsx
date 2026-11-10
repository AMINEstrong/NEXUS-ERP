"use client";

import { useI18n } from "../../lib/i18n";

export function WorkspaceError({ kind }: { kind: "unreachable" | "failed" }) {
  const { t, dir } = useI18n();
  const unreachable = kind === "unreachable";
  return (
    <main className="private-error" dir={dir}>
      <div>
        <span className="auth-kicker">{t("WORKSPACE UNAVAILABLE")}</span>
        <h1>{t(unreachable ? "Can’t reach the NEXUS API" : "Couldn’t load your workspace")}</h1>
        <p>
          {t(
            unreachable
              ? "The web app is running, but the signed-in workspace needs the API and database. Start those services, then reload this page."
              : "The API returned an error while checking your session. Please retry in a moment.",
          )}
        </p>
        <a className="auth-submit auth-submit-link" href={unreachable ? "/login" : "/app"}>
          {t(unreachable ? "Back to sign in" : "Try again")} <span aria-hidden="true">{unreachable ? "→" : "↻"}</span>
        </a>
      </div>
    </main>
  );
}
