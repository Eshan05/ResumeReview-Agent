import {
  fetchPublicHttpUrl,
  parsePublicHttpUrl,
} from "@/lib/security/public-http";

export type PlatformId =
  | "github"
  | "hackerrank"
  | "huggingface"
  | "leetcode"
  | "linkedin"
  | "portfolio";

export type PlatformCrawlStatus =
  | "blocked"
  | "completed"
  | "failed"
  | "skipped";

export interface PlatformLinks {
  github: string | null;
  hackerrank: string | null;
  huggingface: string | null;
  leetcode: string | null;
  linkedin: string | null;
  portfolio: string | null;
}

export interface PlatformCrawlerResult<TData = unknown> {
  data?: TData;
  durationMs: number;
  evidence: string[];
  findings: string[];
  id: string;
  name: string;
  platform: PlatformId;
  status: PlatformCrawlStatus;
  summary: string;
  url?: string;
}

export interface GitHubCrawlData {
  contributionPattern: string;
  languages: Record<string, number>;
  profileUrl: string | null;
  recentActivity: boolean;
  repos: number;
  topRepos: Array<{
    description: string | null;
    forks: number;
    language: string | null;
    name: string;
    stars: number;
    topics: string[];
    updatedAt: string | null;
    url: string | null;
  }>;
  totalStars: number;
  username: string;
}

export interface LeetCodeCrawlData {
  attendedContests: number | null;
  contestRating: number | null;
  problemsSolved: number;
  ranking: number | null;
  realName: string | null;
  topLanguages: string[];
  username: string;
}

export interface HackerRankCrawlData {
  badges: string[];
  handle: string;
  languages: string[];
  problemsSolved: number | null;
  profileReachable: boolean;
  rank: string | null;
}

export interface HuggingFaceCrawlData {
  contributions: string[];
  datasets: number;
  models: number;
  spaces: number;
  topModels: Array<{
    downloads: number;
    likes: number;
    name: string;
  }>;
  username: string;
}

export interface PlatformCrawlReport {
  agents: PlatformCrawlerResult[];
  evidenceSummary: string;
  githubData: GitHubCrawlData | null;
  links: PlatformLinks;
  platformData: {
    hackerrank?: HackerRankCrawlData;
    huggingface?: HuggingFaceCrawlData;
    leetcode?: LeetCodeCrawlData;
    linkedin?: { isValid: boolean; url: string };
    portfolio?: { isReachable: boolean; status?: number; url: string };
  };
}

const CRAWL_TIMEOUT_MS = 8000;
const USER_AGENT = "ResumeReview platform crawler";

export function extractPlatformLinks(rawText: string): PlatformLinks {
  const headerText =
    rawText.split(/\bEducation\b/i)[0] ?? rawText.slice(0, 900);
  const urls = extractUrls(rawText);
  const headerUrls = extractUrls(headerText);
  const findUrl = (predicate: (url: URL) => boolean) =>
    urls.find((value) => {
      try {
        return predicate(new URL(value));
      } catch {
        return false;
      }
    }) ?? null;

  return {
    github:
      findUrl((url) => isHost(url, "github.com")) ?? inferGithub(headerText),
    hackerrank:
      findUrl((url) => isHost(url, "hackerrank.com")) ??
      inferHandleUrl(headerText, "hackerrank", "https://www.hackerrank.com"),
    huggingface:
      findUrl((url) => isHost(url, "huggingface.co")) ??
      inferHandleUrl(headerText, "huggingface", "https://huggingface.co"),
    leetcode:
      findUrl((url) => isHost(url, "leetcode.com")) ??
      inferHandleUrl(headerText, "leetcode", "https://leetcode.com/u"),
    linkedin:
      findUrl((url) => isHost(url, "linkedin.com")) ??
      inferLinkedIn(headerText),
    portfolio: headerUrls.find(isPortfolioUrl) ?? null,
  };
}

export async function crawlResumePlatforms({
  applicantName,
  rawText,
}: {
  applicantName?: string | null;
  rawText: string;
}): Promise<PlatformCrawlReport> {
  const links = extractPlatformLinks(rawText);
  const agents = await Promise.all([
    crawlGitHubAgent(links.github),
    crawlLeetCodeAgent(links.leetcode, applicantName),
    crawlHackerRankAgent(links.hackerrank, applicantName),
    crawlHuggingFaceAgent(links.huggingface),
    validateLinkedInAgent(links.linkedin),
    validatePortfolioAgent(links.portfolio),
  ]);
  const githubData = getAgentData<GitHubCrawlData>(agents, "github");
  const leetcode = getAgentData<LeetCodeCrawlData>(agents, "leetcode");
  const hackerrank = getAgentData<HackerRankCrawlData>(agents, "hackerrank");
  const huggingface = getAgentData<HuggingFaceCrawlData>(agents, "huggingface");
  const linkedin = links.linkedin
    ? { isValid: isLinkedInProfileUrl(links.linkedin), url: links.linkedin }
    : undefined;
  const portfolioAgent = agents.find((agent) => agent.platform === "portfolio");
  const portfolio = links.portfolio
    ? {
        isReachable: portfolioAgent?.status === "completed",
        status:
          typeof (portfolioAgent?.data as { status?: unknown } | undefined)
            ?.status === "number"
            ? (portfolioAgent?.data as { status: number }).status
            : undefined,
        url: links.portfolio,
      }
    : undefined;

  return {
    agents,
    evidenceSummary: summarizePlatformAgents(agents),
    githubData,
    links,
    platformData: {
      ...(hackerrank ? { hackerrank } : {}),
      ...(huggingface ? { huggingface } : {}),
      ...(leetcode ? { leetcode } : {}),
      ...(linkedin ? { linkedin } : {}),
      ...(portfolio ? { portfolio } : {}),
    },
  };
}

export async function crawlPlatformUrl(url: string) {
  const normalized = normalizeUrl(url);
  const platform = getPlatformForUrl(normalized);
  if (!platform) return null;

  const result = await (async () => {
    switch (platform) {
      case "github":
        return crawlGitHubAgent(normalized);
      case "hackerrank":
        return crawlHackerRankAgent(normalized);
      case "huggingface":
        return crawlHuggingFaceAgent(normalized);
      case "leetcode":
        return crawlLeetCodeAgent(normalized);
      case "linkedin":
        return validateLinkedInAgent(normalized);
      case "portfolio":
        return validatePortfolioAgent(normalized);
    }
  })();

  return {
    content: formatPlatformAgentEvidence(result),
    status: result.status,
    title: `${result.name}: ${result.url ?? normalized}`,
  };
}

export function formatPlatformAgentEvidence(agent: PlatformCrawlerResult) {
  return [
    `${agent.name}`,
    agent.url ? `URL: ${agent.url}` : null,
    `Status: ${agent.status}`,
    `Summary: ${agent.summary}`,
    agent.findings.length ? "Findings:" : null,
    ...agent.findings.map((finding) => `- ${finding}`),
    agent.evidence.length ? "Evidence:" : null,
    ...agent.evidence.map((item) => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizePlatformAgents(agents: PlatformCrawlerResult[]) {
  return agents
    .map(
      (agent) =>
        `${agent.name}: ${agent.status} - ${shorten(agent.summary, 180)}`,
    )
    .join("\n");
}

async function crawlGitHubAgent(url: string | null) {
  return timedAgent<GitHubCrawlData>({
    id: "github-crawler",
    name: "GitHub Crawler Agent",
    platform: "github",
    url,
    run: async () => {
      if (!url) return skipped("No GitHub URL extracted.");
      const target = parseGitHubTarget(url);
      if (!target)
        return failed("GitHub URL was not a public profile or repository.");

      const headers = {
        accept: "application/vnd.github+json",
        "user-agent": USER_AGENT,
        "x-github-api-version": "2022-11-28",
      };

      if (target.repo) {
        const repo = await fetchJson<GitHubRepoResponse>(
          `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`,
          { headers },
        );
        const data = githubDataFromRepos(target.owner, [repo], null);
        return completed({
          data,
          evidence: [formatGitHubRepo(repo)],
          findings: [
            `${repo.full_name} primary language: ${repo.language ?? "unknown"}`,
            `Stars ${repo.stargazers_count ?? 0}, forks ${repo.forks_count ?? 0}`,
          ],
          summary: `Crawled GitHub repository ${repo.full_name}.`,
        });
      }

      const [profile, repos] = await Promise.all([
        fetchJson<GitHubProfileResponse>(
          `https://api.github.com/users/${encodeURIComponent(target.owner)}`,
          { headers },
        ),
        fetchJson<GitHubRepoResponse[]>(
          `https://api.github.com/users/${encodeURIComponent(target.owner)}/repos?per_page=12&sort=updated&type=owner`,
          { headers },
        ).catch(() => []),
      ]);
      const ownedRepos = repos.filter((repo) => !repo.fork);
      const data = githubDataFromRepos(target.owner, ownedRepos, profile);

      return completed({
        data,
        evidence: [formatGitHubProfile(profile, ownedRepos)],
        findings: [
          `${data.repos} public repositories`,
          `${data.totalStars} total stars across sampled owner repositories`,
          `Languages: ${formatLanguageCounts(data.languages) || "unknown"}`,
          data.recentActivity
            ? "Recent repository activity found."
            : "No recent repository activity in sampled repos.",
        ],
        summary: `Crawled GitHub profile ${target.owner} using the public REST API.`,
      });
    },
  });
}

async function crawlLeetCodeAgent(
  url: string | null,
  applicantName?: string | null,
) {
  return timedAgent<LeetCodeCrawlData>({
    id: "leetcode-crawler",
    name: "LeetCode Crawler Agent",
    platform: "leetcode",
    url,
    run: async () => {
      if (!url) return skipped("No LeetCode URL extracted.");
      const username = parseLeetCodeUsername(url);
      if (!username) return failed("LeetCode URL did not contain a username.");
      const data = await fetchLeetCodeProfile(username);

      return completed({
        data,
        evidence: [
          [
            `LeetCode username: ${data.username}`,
            data.realName ? `Real name: ${data.realName}` : null,
            `Problems solved: ${data.problemsSolved}`,
            data.ranking ? `Ranking: ${data.ranking}` : null,
            data.contestRating
              ? `Contest rating: ${Math.round(data.contestRating)}`
              : null,
            data.topLanguages.length
              ? `Top languages: ${data.topLanguages.join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        ],
        findings: [
          `${data.problemsSolved} accepted problems`,
          data.contestRating
            ? `Contest rating ${Math.round(data.contestRating)}`
            : "No contest rating returned.",
          data.topLanguages.length
            ? `Algorithm language evidence: ${data.topLanguages.join(", ")}`
            : "No language distribution returned.",
          applicantName && data.realName
            ? `Profile name signal: ${data.realName}`
            : "Profile name was unavailable or not compared.",
        ],
        summary: `Queried LeetCode public GraphQL profile for ${username}.`,
      });
    },
  });
}

async function crawlHackerRankAgent(
  url: string | null,
  applicantName?: string | null,
) {
  return timedAgent<HackerRankCrawlData>({
    id: "hackerrank-crawler",
    name: "HackerRank Crawler Agent",
    platform: "hackerrank",
    url,
    run: async () => {
      if (!url) return skipped("No HackerRank URL extracted.");
      const handle = parseHackerRankHandle(url);
      if (!handle) return failed("HackerRank URL did not contain a handle.");
      const profileUrl = normalizeHackerRankProfileUrl(handle);
      const response = await fetchWithTimeout(profileUrl, {
        headers: { "user-agent": USER_AGENT },
      });
      const html = await response.text();
      const readable = extractReadableText(html);

      if (!response.ok) {
        return failed(`HackerRank returned HTTP ${response.status}.`);
      }

      if (/cookie support is required|log in|sign up/i.test(readable)) {
        return {
          evidence: [
            `Public HackerRank profile page was not accessible without login/cookies for ${handle}.`,
          ],
          findings: ["HackerRank profile appears blocked or login-gated."],
          status: "blocked" as const,
          summary:
            "HackerRank public profile could not be inspected deeply without an authenticated browser session.",
        };
      }

      const languages = extractKnownLanguages(readable);
      const badges = extractHackerRankBadges(readable);
      const data: HackerRankCrawlData = {
        badges,
        handle,
        languages,
        problemsSolved: extractFirstNumber(readable, /(\d+)\s+problems?/i),
        profileReachable: true,
        rank: extractFirstMatch(readable, /\b([1-5])-star\b/i),
      };

      return completed({
        data,
        evidence: [
          shorten(
            [
              `HackerRank handle: ${handle}`,
              applicantName ? `Applicant name: ${applicantName}` : null,
              readable,
            ]
              .filter(Boolean)
              .join("\n"),
            1200,
          ),
        ],
        findings: [
          "Public HackerRank page responded.",
          languages.length
            ? `Language/profile signals: ${languages.join(", ")}`
            : "No language signals found in public page text.",
          badges.length
            ? `Badge-like signals: ${badges.join(", ")}`
            : "No badge text found in public page text.",
        ],
        summary: `Fetched public HackerRank profile page for ${handle}.`,
      });
    },
  });
}

async function crawlHuggingFaceAgent(url: string | null) {
  return timedAgent<HuggingFaceCrawlData>({
    id: "huggingface-crawler",
    name: "HuggingFace Crawler Agent",
    platform: "huggingface",
    url,
    run: async () => {
      if (!url) return skipped("No HuggingFace URL extracted.");
      const username = parseHuggingFaceUsername(url);
      if (!username)
        return failed("HuggingFace URL did not contain a user/org handle.");
      const [models, datasets, spaces] = await Promise.all([
        fetchJson<HuggingFaceRepo[]>(
          `https://huggingface.co/api/models?author=${encodeURIComponent(username)}&limit=8&sort=downloads&direction=-1`,
        ).catch(() => []),
        fetchJson<HuggingFaceRepo[]>(
          `https://huggingface.co/api/datasets?author=${encodeURIComponent(username)}&limit=8`,
        ).catch(() => []),
        fetchJson<HuggingFaceRepo[]>(
          `https://huggingface.co/api/spaces?author=${encodeURIComponent(username)}&limit=8`,
        ).catch(() => []),
      ]);
      const data: HuggingFaceCrawlData = {
        contributions: [
          ...models.map((item) => item.modelId ?? item.id).filter(isString),
          ...datasets.map((item) => item.id).filter(isString),
          ...spaces.map((item) => item.id).filter(isString),
        ].slice(0, 12),
        datasets: datasets.length,
        models: models.length,
        spaces: spaces.length,
        topModels: models.slice(0, 5).map((model) => ({
          downloads: Number(model.downloads ?? 0),
          likes: Number(model.likes ?? 0),
          name: model.modelId ?? model.id ?? "unknown model",
        })),
        username,
      };

      return completed({
        data,
        evidence: [
          [
            `HuggingFace user/org: ${username}`,
            `Models returned: ${data.models}`,
            `Datasets returned: ${data.datasets}`,
            `Spaces returned: ${data.spaces}`,
            data.topModels.length
              ? `Top models: ${data.topModels
                  .map(
                    (model) => `${model.name} (${model.downloads} downloads)`,
                  )
                  .join("; ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        ],
        findings: [
          `${data.models} model records returned`,
          `${data.datasets} dataset records returned`,
          `${data.spaces} Space records returned`,
        ],
        summary: `Queried open Hugging Face Hub API endpoints for ${username}.`,
      });
    },
  });
}

async function validateLinkedInAgent(url: string | null) {
  return timedAgent<{ isValid: boolean; url: string }>({
    id: "linkedin-validator",
    name: "LinkedIn URL Validator",
    platform: "linkedin",
    url,
    run: async () => {
      if (!url) return skipped("No LinkedIn URL extracted.");
      const isValid = isLinkedInProfileUrl(url);

      return completed({
        data: { isValid, url },
        evidence: [
          isValid
            ? `LinkedIn public profile URL shape is valid: ${url}`
            : `LinkedIn URL did not match expected profile URL shape: ${url}`,
        ],
        findings: [
          isValid
            ? "LinkedIn profile URL present."
            : "LinkedIn URL present but not a standard public profile URL.",
          "No LinkedIn scraping was attempted.",
        ],
        summary: "Validated LinkedIn URL shape without scraping LinkedIn.",
      });
    },
  });
}

async function validatePortfolioAgent(url: string | null) {
  return timedAgent<{ status?: number; url: string }>({
    id: "portfolio-link-validator",
    name: "Portfolio Link Validator",
    platform: "portfolio",
    url,
    run: async () => {
      if (!url) return skipped("No portfolio URL extracted.");
      const response = await fetchPublicHttpUrl(url, {
        headers: { "user-agent": USER_AGENT },
        maxBytes: 500_000,
        timeoutMs: CRAWL_TIMEOUT_MS,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const text = /text|html|json|xml/i.test(contentType)
        ? await response.text()
        : "";

      if (!response.ok) {
        return failed(`Portfolio returned HTTP ${response.status}.`);
      }

      return completed({
        data: { status: response.status, url },
        evidence: [
          `Portfolio URL responded with HTTP ${response.status}.`,
          text
            ? shorten(extractReadableText(text), 900)
            : "No readable text extracted.",
        ],
        findings: ["Portfolio or project URL is reachable."],
        summary: "Validated reachable portfolio/project URL.",
      });
    },
  });
}

async function timedAgent<TData>({
  id,
  name,
  platform,
  run,
  url,
}: {
  id: string;
  name: string;
  platform: PlatformId;
  run: () => Promise<AgentRunResult<TData>>;
  url: string | null;
}) {
  const startedAt = Date.now();
  try {
    const result = await run();

    return {
      ...result,
      durationMs: Date.now() - startedAt,
      id,
      name,
      platform,
      url: url ?? undefined,
    } satisfies PlatformCrawlerResult<TData>;
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      evidence: [
        error instanceof Error ? error.message : "Unknown crawler failure.",
      ],
      findings: ["Crawler failed; evidence should be treated as unavailable."],
      id,
      name,
      platform,
      status: "failed",
      summary:
        error instanceof Error ? error.message : "Unknown crawler failure.",
      url: url ?? undefined,
    } satisfies PlatformCrawlerResult<TData>;
  }
}

type AgentRunResult<TData> = Omit<
  PlatformCrawlerResult<TData>,
  "durationMs" | "id" | "name" | "platform" | "url"
>;

function completed<TData>({
  data,
  evidence,
  findings,
  summary,
}: {
  data?: TData;
  evidence: string[];
  findings: string[];
  summary: string;
}): AgentRunResult<TData> {
  return {
    ...(data ? { data } : {}),
    evidence: evidence.filter(Boolean).map((item) => shorten(item, 1800)),
    findings: findings.filter(Boolean).map((item) => shorten(item, 220)),
    status: "completed",
    summary,
  };
}

function skipped(summary: string): AgentRunResult<never> {
  return {
    evidence: [],
    findings: [summary],
    status: "skipped",
    summary,
  };
}

function failed(summary: string): AgentRunResult<never> {
  return {
    evidence: [summary],
    findings: [summary],
    status: "failed",
    summary,
  };
}

function getAgentData<TData>(
  agents: PlatformCrawlerResult[],
  platform: PlatformId,
) {
  const agent = agents.find(
    (item): item is PlatformCrawlerResult<TData> =>
      item.platform === platform && item.status === "completed",
  );

  return agent?.data ?? null;
}

async function fetchLeetCodeProfile(
  username: string,
): Promise<LeetCodeCrawlData> {
  const response = await fetchWithTimeout("https://leetcode.com/graphql", {
    body: JSON.stringify({
      query: `
        query userProfile($username: String!) {
          matchedUser(username: $username) {
            username
            profile {
              realName
              ranking
              reputation
            }
            submitStats {
              acSubmissionNum {
                difficulty
                count
                submissions
              }
            }
            languageProblemCount {
              languageName
              problemsSolved
            }
          }
          userContestRanking(username: $username) {
            attendedContestsCount
            rating
            globalRanking
            topPercentage
          }
        }
      `,
      variables: { username },
    }),
    headers: {
      "content-type": "application/json",
      referer: `https://leetcode.com/u/${encodeURIComponent(username)}/`,
      "user-agent": USER_AGENT,
    },
    method: "POST",
  });
  const payload = (await response.json()) as LeetCodeGraphQlResponse;

  if (!response.ok || payload.errors?.length) {
    throw new Error(
      `LeetCode GraphQL failed: HTTP ${response.status} ${shorten(
        JSON.stringify(payload.errors ?? payload),
        300,
      )}`,
    );
  }

  const matchedUser = payload.data?.matchedUser;
  if (!matchedUser) {
    throw new Error(`LeetCode user ${username} was not found.`);
  }

  const solved =
    matchedUser.submitStats?.acSubmissionNum?.find(
      (item) => item.difficulty === "All",
    )?.count ?? 0;
  const languages = matchedUser.languageProblemCount ?? [];

  return {
    attendedContests:
      payload.data?.userContestRanking?.attendedContestsCount ?? null,
    contestRating: payload.data?.userContestRanking?.rating ?? null,
    problemsSolved: solved,
    ranking: matchedUser.profile?.ranking ?? null,
    realName: matchedUser.profile?.realName ?? null,
    topLanguages: languages
      .sort((a, b) => b.problemsSolved - a.problemsSolved)
      .slice(0, 5)
      .map((item) => item.languageName),
    username: matchedUser.username,
  };
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(url, {
    ...init,
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${shorten(text, 260)}`);
  }

  return JSON.parse(text) as T;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface GitHubProfileResponse {
  bio?: string | null;
  blog?: string | null;
  company?: string | null;
  html_url?: string | null;
  login: string;
  name?: string | null;
  public_repos?: number;
}

interface GitHubRepoResponse {
  archived?: boolean;
  description?: string | null;
  fork?: boolean;
  forks_count?: number;
  full_name: string;
  html_url?: string | null;
  language?: string | null;
  pushed_at?: string | null;
  stargazers_count?: number;
  topics?: string[];
  updated_at?: string | null;
}

interface LeetCodeGraphQlResponse {
  data?: {
    matchedUser?: {
      languageProblemCount?: Array<{
        languageName: string;
        problemsSolved: number;
      }>;
      profile?: {
        ranking?: number | null;
        realName?: string | null;
      };
      submitStats?: {
        acSubmissionNum?: Array<{
          count: number;
          difficulty: string;
          submissions: number;
        }>;
      };
      username: string;
    } | null;
    userContestRanking?: {
      attendedContestsCount?: number | null;
      globalRanking?: number | null;
      rating?: number | null;
      topPercentage?: number | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

interface HuggingFaceRepo {
  downloads?: number;
  id?: string;
  likes?: number;
  modelId?: string;
}

function githubDataFromRepos(
  owner: string,
  repos: GitHubRepoResponse[],
  profile: GitHubProfileResponse | null,
): GitHubCrawlData {
  const languageEntries = new Map<string, number>();
  let totalStars = 0;
  let recentActivity = false;
  const now = Date.now();
  const topRepos = repos
    .filter((repo) => !repo.fork)
    .slice(0, 8)
    .map((repo) => {
      totalStars += repo.stargazers_count ?? 0;
      if (repo.language) {
        languageEntries.set(
          repo.language,
          (languageEntries.get(repo.language) ?? 0) + 1,
        );
      }
      const activity = repo.pushed_at ?? repo.updated_at;
      if (activity && now - new Date(activity).getTime() < 180 * 86_400_000) {
        recentActivity = true;
      }

      return {
        description: repo.description ?? null,
        forks: repo.forks_count ?? 0,
        language: repo.language ?? null,
        name: repo.full_name,
        stars: repo.stargazers_count ?? 0,
        topics: repo.topics ?? [],
        updatedAt: activity ?? null,
        url: repo.html_url ?? null,
      };
    });

  return {
    contributionPattern: recentActivity
      ? "recent public repository activity"
      : "no recent public repository activity in sampled repos",
    languages: Object.fromEntries(languageEntries),
    profileUrl: profile?.html_url ?? `https://github.com/${owner}`,
    recentActivity,
    repos: profile?.public_repos ?? repos.length,
    topRepos,
    totalStars,
    username: profile?.login ?? owner,
  };
}

function formatGitHubProfile(
  profile: GitHubProfileResponse,
  repos: GitHubRepoResponse[],
) {
  return [
    `GitHub profile: ${profile.login}`,
    profile.name ? `Name: ${profile.name}` : null,
    profile.bio ? `Bio: ${profile.bio}` : null,
    profile.company ? `Company: ${profile.company}` : null,
    profile.blog ? `Blog: ${profile.blog}` : null,
    `Public repositories: ${profile.public_repos ?? "unknown"}`,
    ...repos.slice(0, 8).map(formatGitHubRepo),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGitHubRepo(repo: GitHubRepoResponse) {
  return [
    `GitHub repository: ${repo.full_name}`,
    repo.description ? `description: ${repo.description}` : null,
    repo.language ? `language: ${repo.language}` : null,
    repo.topics?.length ? `topics: ${repo.topics.join(", ")}` : null,
    `stars: ${repo.stargazers_count ?? 0}`,
    `forks: ${repo.forks_count ?? 0}`,
    (repo.pushed_at ?? repo.updated_at)
      ? `recent activity: ${repo.pushed_at ?? repo.updated_at}`
      : null,
    repo.html_url ? `url: ${repo.html_url}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function extractUrls(text: string) {
  return Array.from(
    text.matchAll(
      /(?:https?:\/\/)?(?:www\.)?(?:github\.com|linkedin\.com|leetcode\.com|hackerrank\.com|huggingface\.co|[\w.-]+\.[a-z]{2,})(?:\/[^\s"'<>),;]*)?/gi,
    ),
    (match) => normalizeUrl(match[0]),
  ).filter(isPublicHttpUrl);
}

function getPlatformForUrl(value: string): PlatformId | null {
  try {
    const url = new URL(value);
    if (isHost(url, "github.com")) return "github";
    if (isHost(url, "leetcode.com")) return "leetcode";
    if (isHost(url, "hackerrank.com")) return "hackerrank";
    if (isHost(url, "huggingface.co")) return "huggingface";
    if (isHost(url, "linkedin.com")) return "linkedin";
    return isPortfolioUrl(value) ? "portfolio" : null;
  } catch {
    return null;
  }
}

function parseGitHubTarget(value: string) {
  try {
    const url = new URL(normalizeUrl(value));
    if (!isHost(url, "github.com")) return null;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (!owner || GITHUB_NON_PROFILE_PATHS.has(owner.toLowerCase())) {
      return null;
    }
    if (repo && !GITHUB_NON_REPO_PATHS.has(repo.toLowerCase())) {
      return { owner, repo };
    }
    return { owner, repo: null };
  } catch {
    return null;
  }
}

function parseLeetCodeUsername(value: string) {
  try {
    const url = new URL(normalizeUrl(value));
    if (!isHost(url, "leetcode.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const username =
      parts[0] === "u" || parts[0] === "profile" ? parts[1] : parts[0];
    return isLikelyHandle(username) ? username : null;
  } catch {
    return null;
  }
}

function parseHackerRankHandle(value: string) {
  try {
    const url = new URL(normalizeUrl(value));
    if (!isHost(url, "hackerrank.com")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const handle = parts[0] === "profile" ? parts[1] : parts[0];
    return isLikelyHandle(handle) ? handle : null;
  } catch {
    return null;
  }
}

function parseHuggingFaceUsername(value: string) {
  try {
    const url = new URL(normalizeUrl(value));
    if (!isHost(url, "huggingface.co")) return null;
    const [username] = url.pathname.split("/").filter(Boolean);
    return isLikelyHandle(username) ? username : null;
  } catch {
    return null;
  }
}

function normalizeHackerRankProfileUrl(handle: string) {
  return `https://www.hackerrank.com/profile/${encodeURIComponent(handle)}`;
}

function inferGithub(headerText: string) {
  const labelled = headerText.match(
    /\bgithub\b[^\n]*?(?:github\.com\/)?\/?([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)/i,
  );
  if (labelled?.[1] && !/^github$/i.test(labelled[1])) {
    return `https://github.com/${labelled[1]}`;
  }

  const slashHandles = Array.from(
    headerText.matchAll(/(?:^|\s)\/([a-z0-9][a-z0-9-]{1,38})(?=\s|$)/gi),
    (match) => match[1],
  );
  const handle = slashHandles.find((item) => !/^in$/i.test(item));
  return handle ? `https://github.com/${handle}` : null;
}

function inferLinkedIn(headerText: string) {
  const match = headerText.match(/(?:linkedin\.com)?\/in\/([a-z0-9_%.-]+)/i);
  return match?.[1] ? `https://linkedin.com/in/${match[1]}` : null;
}

function inferHandleUrl(text: string, label: string, baseUrl: string) {
  const match = text.match(
    new RegExp(
      `\\b${label}\\b[^\\n]*?(?:${label}\\.com/)?(?:profile/|u/)?([a-z0-9][a-z0-9_.-]{2,38})`,
      "i",
    ),
  );
  const handle = match?.[1];
  return isLikelyHandle(handle) ? `${baseUrl}/${handle}` : null;
}

function isPublicHttpUrl(value: string) {
  try {
    const url = parsePublicHttpUrl(value);
    if (EMAIL_HOSTS.has(url.hostname.replace(/^www\./i, ""))) return false;
    return true;
  } catch {
    return false;
  }
}

function isPortfolioUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./i, "");
    return (
      isPublicHttpUrl(value) &&
      !isHost(url, "github.com") &&
      !isHost(url, "linkedin.com") &&
      !isHost(url, "leetcode.com") &&
      !isHost(url, "hackerrank.com") &&
      !isHost(url, "huggingface.co") &&
      !EMAIL_HOSTS.has(host) &&
      !/@/.test(value)
    );
  } catch {
    return false;
  }
}

function isLinkedInProfileUrl(value: string) {
  try {
    const url = new URL(value);
    return isHost(url, "linkedin.com") && /^\/(?:in|pub)\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function isHost(url: URL, domain: string) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function normalizeUrl(value: string) {
  const trimmed = value.replace(/[),.;]+$/g, "").trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extractReadableText(value: string) {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

function extractKnownLanguages(value: string) {
  const known = [
    "C++",
    "Go",
    "Java",
    "JavaScript",
    "Python",
    "Ruby",
    "SQL",
    "Swift",
    "TypeScript",
  ];
  const lower = value.toLowerCase();
  return known.filter((language) => lower.includes(language.toLowerCase()));
}

function extractHackerRankBadges(value: string) {
  const badgeTerms = [
    "Algorithms",
    "Data Structures",
    "Java",
    "Problem Solving",
    "Python",
    "SQL",
  ];
  const lower = value.toLowerCase();
  return badgeTerms.filter((badge) => lower.includes(badge.toLowerCase()));
}

function extractFirstNumber(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  if (!match?.[1]) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

function extractFirstMatch(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? null;
}

function formatLanguageCounts(languages: Record<string, number>) {
  return Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => `${language} (${count})`)
    .join(", ");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shorten(value: string, maxLength: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLikelyHandle(value: string | undefined) {
  return Boolean(value && /^[a-z0-9][a-z0-9_.-]{1,38}$/i.test(value));
}

const EMAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.google.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const GITHUB_NON_PROFILE_PATHS = new Set([
  "about",
  "apps",
  "blog",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "search",
  "settings",
  "sponsors",
  "topics",
  "trending",
]);

const GITHUB_NON_REPO_PATHS = new Set([
  "followers",
  "following",
  "packages",
  "projects",
  "repositories",
  "stars",
  "tab",
]);
