"use client";

import { createAuthClient } from "better-auth/react";

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

const resolveAuthBaseUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_AUTH_BASE_URL;
  if (explicit) {
    return trimTrailingSlash(explicit);
  }

  const backendBaseUrl =
    process.env.NEXT_PUBLIC_AGENT_API_BASE_URL ?? "http://localhost:3001";

  return `${trimTrailingSlash(backendBaseUrl)}/api/auth`;
};

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseUrl(),
  fetchOptions: {
    credentials: "include",
  },
});

export const { signIn, signOut, signUp, useSession } = authClient;
