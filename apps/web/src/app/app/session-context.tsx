"use client";

import { createContext, useContext } from "react";

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
  joinedAt: string | null;
};

export type NexusSession = {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  mfaEnabled: boolean;
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
