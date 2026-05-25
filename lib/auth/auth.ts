import { passkey } from "@better-auth/passkey";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import {
  admin,
  bearer,
  customSession,
  deviceAuthorization,
  lastLoginMethod,
  multiSession,
  openAPI,
  organization,
  twoFactor
} from "better-auth/plugins";

import { reactInvitationEmail } from "@/lib/email/invitation";
import { resend } from "@/lib/email/resend";
import { reactResetPasswordEmail } from "@/lib/email/reset-password";
import { auditLogs } from "@/lib/db/app.schema";
import { backgroundTasksHandler, buildAuthAuditLog } from "@/lib/auth/helper-functions";

import { authBaseUrl, authSecret, baseURL, cookieDomain } from "@/utils/constants";
import { db } from "@/lib/db/db";
import * as schema from "@/lib/db/schema";
// import * as schema from "@/lib/db/schema";

const from = process.env.BETTER_AUTH_EMAIL || "delivered@resend.dev";
const to = process.env.TEST_EMAIL || "";

const authOptions = {
  appName: "Better Auth Demo",
  baseURL: authBaseUrl,
  basePath: "/api/sessions", // For RESTful naming, the default is '/api/auth'
  secret: authSecret,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    usePlural: true,
    schema
  }),
  session: {
    cookieCache: {
      enabled: false, // Too big session data so no caching
      maxAge: 10 * 60, // Cache duration in seconds
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
    },
  },
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url }) {
      await resend.emails.send({
        from,
        to: user.email,
        subject: "Reset your password",
        react: reactResetPasswordEmail({
          username: user.email,
          resetLink: url,
        }),
      });
    },
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      const res = await resend.emails.send({
        from,
        to: to || user.email,
        subject: "Verify your email address",
        html: `<a href="${url}">Verify your email address</a>`,
      });
      console.log(res, user.email);
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  plugins: [
    organization({
      async sendInvitationEmail(data: {
        id: string;
        email: string;
        organization: { name: string };
        inviter: { user: { name: string; email: string } };
      }) {
        await resend.emails.send({
          from,
          to: data.email,
          subject: "You've been invited to join an organization",
          react: reactInvitationEmail({
            username: data.email,
            invitedByUsername: data.inviter.user.name,
            invitedByEmail: data.inviter.user.email,
            teamName: data.organization.name,
            inviteLink:
              process.env.NODE_ENV === "development"
                ? `http://localhost:3000/accept-invitation/${data.id}`
                : `${process.env.BETTER_AUTH_URL ||
                "https://demo.better-auth.com"
                }/accept-invitation/${data.id}`,
          }),
        });
      },
    }),
    // 
    twoFactor({
      otpOptions: {
        async sendOTP({ user, otp }) {
          await resend.emails.send({
            from,
            to: user.email,
            subject: "Your OTP",
            html: `Your OTP is ${otp}`,
          });
        },
      },
    }),
    passkey(),
    openAPI(),
    bearer(),
    admin(),
    multiSession(),
    lastLoginMethod(),
    nextCookies(),
    deviceAuthorization({
      expiresIn: "3min",
      interval: "5s",
    }),
  ],
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const auditLog = await buildAuthAuditLog({
        body: ctx.body,
        context: ctx.context,
        headers: ctx.headers,
        method: typeof ctx.method === "string" ? ctx.method : undefined,
        path: ctx.path,
      });

      if (!auditLog) return;

      backgroundTasksHandler(
        db.insert(auditLogs).values({
          ...auditLog,
          id: crypto.randomUUID(),
        }),
      );
    }),
  },
  trustedOrigins: [
    "exp://",
    "http://localhost:3000",
    "http://192.168.1.*:3000",
    process.env.NEXT_PUBLIC_BETTER_AUTH_BASE || authBaseUrl,
  ],
  advanced: {
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === "production",
      domain: cookieDomain,
    },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...authOptions,
  plugins: [
    ...(authOptions.plugins ?? []),
    customSession(async ({ user, session }) => ({ user, session }), authOptions),
  ],
});