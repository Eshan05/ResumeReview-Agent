import { passkeyClient } from "@better-auth/passkey/client";
import {
  adminClient,
  deviceAuthorizationClient,
  genericOAuthClient,
  lastLoginMethodClient,
  multiSessionClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { toast } from "sonner";
import { baseURL } from "@/utils/constants";
export const authClient = createAuthClient({
  // baseURL: "http://192.168.1.7:3000",
  baseURL:
    process.env.NODE_ENV === "development"
      ? (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001")
      : baseURL,
  basePath: "/api/sessions",
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    passkeyClient(),
    adminClient(),
    multiSessionClient(),
    genericOAuthClient(),
    deviceAuthorizationClient(),
    lastLoginMethodClient(),
  ],
  fetchOptions: {
    onError(e) {
      if (e.error.status === 429)
        toast.error("Too many requests. Please try again later.");
    },
  },
});

export const {
  signUp,
  signIn,
  signOut,
  useSession,
  deleteUser,
  requestPasswordReset,
  device,
  getSession,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  updateUser,
} = authClient;
