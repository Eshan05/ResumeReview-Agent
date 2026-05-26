import { relations } from "drizzle-orm";

import {
  users,
  sessions,
  accounts,
  organizations,
  members,
  invitations,
  twoFactors,
  passkeys,
} from "../auth.schema";
import { auditLogs } from "./audit-logs.schema";
import { jobPostings } from "./job-postings.schema";
import { resumes } from "./resumes.schema";
import { resumeResults } from "./resume-results.schema";
import { agentRuns } from "./agent-runs.schema";
import { candidateNotes } from "./candidates.schema";
import { interviews } from "./interviews.schema";
import { emailLogs } from "./email-logs.schema";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  members: many(members),
  invitations: many(invitations),
  twoFactors: many(twoFactors),
  passkeys: many(passkeys),
  jobPostings: many(jobPostings),
  resumes: many(resumes),
  candidateNotes: many(candidateNotes),
  interviews: many(interviews),
  auditLogs: many(auditLogs),
  emailLogs: many(emailLogs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  users: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  users: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
  jobPostings: many(jobPostings),
}));

export const membersRelations = relations(members, ({ one }) => ({
  organizations: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
  users: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organizations: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  users: one(users, {
    fields: [invitations.inviterId],
    references: [users.id],
  }),
}));

export const twoFactorsRelations = relations(twoFactors, ({ one }) => ({
  users: one(users, {
    fields: [twoFactors.userId],
    references: [users.id],
  }),
}));

export const passkeysRelations = relations(passkeys, ({ one }) => ({
  users: one(users, {
    fields: [passkeys.userId],
    references: [users.id],
  }),
}));

export const jobPostingsRelations = relations(jobPostings, ({ one, many }) => ({
  user: one(users, {
    fields: [jobPostings.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [jobPostings.organizationId],
    references: [organizations.id],
  }),
  resumes: many(resumes),
  agentRuns: many(agentRuns),
  interviews: many(interviews),
  emailLogs: many(emailLogs),
}));

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  jobPosting: one(jobPostings, {
    fields: [resumes.jobPostingId],
    references: [jobPostings.id],
  }),
  uploadedByUser: one(users, {
    fields: [resumes.uploadedBy],
    references: [users.id],
  }),
  resumeResult: one(resumeResults),
  agentRuns: many(agentRuns),
  candidateNotes: many(candidateNotes),
  interviews: many(interviews),
  emailLogs: many(emailLogs),
}));

export const resumeResultsRelations = relations(resumeResults, ({ one }) => ({
  resume: one(resumes, {
    fields: [resumeResults.resumeId],
    references: [resumes.id],
  }),
}));

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  resume: one(resumes, {
    fields: [agentRuns.resumeId],
    references: [resumes.id],
  }),
  jobPosting: one(jobPostings, {
    fields: [agentRuns.jobPostingId],
    references: [jobPostings.id],
  }),
}));

export const candidateNotesRelations = relations(candidateNotes, ({ one }) => ({
  resume: one(resumes, {
    fields: [candidateNotes.resumeId],
    references: [resumes.id],
  }),
  user: one(users, {
    fields: [candidateNotes.userId],
    references: [users.id],
  }),
}));

export const interviewsRelations = relations(interviews, ({ one }) => ({
  resume: one(resumes, {
    fields: [interviews.resumeId],
    references: [resumes.id],
  }),
  jobPosting: one(jobPostings, {
    fields: [interviews.jobPostingId],
    references: [jobPostings.id],
  }),
  scheduledByUser: one(users, {
    fields: [interviews.scheduledBy],
    references: [users.id],
  }),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  user: one(users, {
    fields: [emailLogs.userId],
    references: [users.id],
  }),
  resume: one(resumes, {
    fields: [emailLogs.resumeId],
    references: [resumes.id],
  }),
  jobPosting: one(jobPostings, {
    fields: [emailLogs.jobPostingId],
    references: [jobPostings.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
