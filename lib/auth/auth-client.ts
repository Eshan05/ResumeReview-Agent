import { baseURL } from "@/utils/constants";
import {
  adminClient,
  deviceAuthorizationClient,
  genericOAuthClient,
  lastLoginMethodClient,
  multiSessionClient,
  oidcClient,
  twoFactorClient
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { toast } from "sonner";
export const authClient = createAuthClient({
  // baseURL: "http://192.168.1.7:3000",
  baseURL: process.env.NODE_ENV === 'development' ? "http://localhost:3000" : baseURL,
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
    oidcClient(),
    genericOAuthClient(),
    deviceAuthorizationClient(),
    lastLoginMethodClient(),
  ],
  fetchOptions: {
    onError(e) {
      if (e.error.status === 429) toast.error("Too many requests. Please try again later.");
    },
  },
})

export const {
  signUp,
  signIn,
  signOut,
  useSession,
} = authClient;