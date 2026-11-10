"use client";

import { createContext, useContext, useMemo } from "react";

export type CompanyRole = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
};

export type CompanyMembership = {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  currencyCode: string;
  defaultLocale: string;
  timeZone: string;
  membershipId: string;
  role: { key: string; name: string };
  roles: CompanyRole[];
  permissions: string[];
  isOwner: boolean;
  isAdministrator: boolean;
  joinedAt: string | null;
};

export type NexusSession = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
  locale: string;
  createdAt: string;
  activeCompanyId: string | null;
  memberships: CompanyMembership[];
};

const SessionContext = createContext<NexusSession | null>(null);

export function SessionProvider({ value, children }: { value: NexusSession; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useNexusSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("NEXUS session context is unavailable");
  return value;
}

export type SessionAccess = {
  membership: CompanyMembership | null;
  roles: CompanyRole[];
  permissions: Set<string>;
  isOwner: boolean;
  isAdministrator: boolean;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  canAll: (...permissions: string[]) => boolean;
};

export function usePermissions(): SessionAccess {
  const session = useNexusSession();
  return useMemo(() => buildAccess(session), [session]);
}

export function buildAccess(session: NexusSession): SessionAccess {
  const membership = session.memberships.find((item) => item.id === session.activeCompanyId) ?? null;
  const permissions = new Set(membership?.permissions ?? []);
  return {
    membership,
    roles: membership?.roles ?? [],
    permissions,
    isOwner: membership?.isOwner ?? false,
    isAdministrator: membership?.isAdministrator ?? false,
    can: (permission) => permissions.has(permission),
    canAny: (...required) => required.some((permission) => permissions.has(permission)),
    canAll: (...required) => required.every((permission) => permissions.has(permission)),
  };
}

export function activeCompany(session: NexusSession): CompanyMembership | null {
  return session.memberships.find((item) => item.id === session.activeCompanyId) ?? null;
}
