import type { auth } from "./auth";
import { authClient as client } from "./auth-client";

export type Session = typeof auth.$Infer.Session;
// export type ActiveOrganization = typeof client.$Infer.ActiveOrganization;
// export type Invitation = typeof client.$Infer.Invitation;