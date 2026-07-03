import { relations } from "drizzle-orm";

import {
  accounts,
  invitations,
  members,
  organizations,
  passkeys,
  sessions,
  twoFactors,
  users,
} from "../auth.schema";
import { agentRuns } from "./agent-runs.schema";
import { auditLogs } from "./audit-logs.schema";
import { candidateCrawlRuns } from "./candidate-crawl-runs.schema";
import { candidateEvidenceChunks } from "./candidate-evidence-chunks.schema";
import { candidateNotes } from "./candidates.schema";
import { emailLogs } from "./email-logs.schema";
import { interviews } from "./interviews.schema";
import { jobPostings } from "./job-postings.schema";
import { resumeResults } from "./resume-results.schema";
import { resumeUploadBatches } from "./resume-upload-batches.schema";
import { resumeUploadItems } from "./resume-upload-items.schema";
import { resumes } from "./resumes.schema";

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
  resumeUploadBatches: many(resumeUploadBatches),
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
  candidateCrawlRuns: many(candidateCrawlRuns),
  candidateEvidenceChunks: many(candidateEvidenceChunks),
  interviews: many(interviews),
  emailLogs: many(emailLogs),
  resumeUploadBatches: many(resumeUploadBatches),
  resumeUploadItems: many(resumeUploadItems),
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
  resumeResults: many(resumeResults),
  agentRuns: many(agentRuns),
  candidateCrawlRuns: many(candidateCrawlRuns),
  candidateEvidenceChunks: many(candidateEvidenceChunks),
  candidateNotes: many(candidateNotes),
  interviews: many(interviews),
  emailLogs: many(emailLogs),
  resumeUploadItems: many(resumeUploadItems),
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
  uploadBatch: one(resumeUploadBatches, {
    fields: [agentRuns.uploadBatchId],
    references: [resumeUploadBatches.id],
  }),
}));

export const resumeUploadBatchesRelations = relations(
  resumeUploadBatches,
  ({ one, many }) => ({
    jobPosting: one(jobPostings, {
      fields: [resumeUploadBatches.jobPostingId],
      references: [jobPostings.id],
    }),
    uploadedByUser: one(users, {
      fields: [resumeUploadBatches.uploadedBy],
      references: [users.id],
    }),
    items: many(resumeUploadItems),
    agentRuns: many(agentRuns),
  }),
);

export const resumeUploadItemsRelations = relations(
  resumeUploadItems,
  ({ one }) => ({
    batch: one(resumeUploadBatches, {
      fields: [resumeUploadItems.batchId],
      references: [resumeUploadBatches.id],
    }),
    jobPosting: one(jobPostings, {
      fields: [resumeUploadItems.jobPostingId],
      references: [jobPostings.id],
    }),
    resume: one(resumes, {
      fields: [resumeUploadItems.resumeId],
      references: [resumes.id],
    }),
  }),
);

export const candidateEvidenceChunksRelations = relations(
  candidateEvidenceChunks,
  ({ one }) => ({
    jobPosting: one(jobPostings, {
      fields: [candidateEvidenceChunks.jobPostingId],
      references: [jobPostings.id],
    }),
    resume: one(resumes, {
      fields: [candidateEvidenceChunks.resumeId],
      references: [resumes.id],
    }),
  }),
);

export const candidateCrawlRunsRelations = relations(
  candidateCrawlRuns,
  ({ one }) => ({
    jobPosting: one(jobPostings, {
      fields: [candidateCrawlRuns.jobPostingId],
      references: [jobPostings.id],
    }),
    resume: one(resumes, {
      fields: [candidateCrawlRuns.resumeId],
      references: [resumes.id],
    }),
  }),
);

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
