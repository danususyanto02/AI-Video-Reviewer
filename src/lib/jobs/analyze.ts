import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCopyrightAgent } from "../agents/copyright";
import { runFacebookAgent } from "../agents/facebook";
import { runLegalAgent } from "../agents/legal_id";
import { runPackagingPrivacyAgent } from "../agents/packaging_privacy";
import { runTiktokAgent } from "../agents/tiktok";
import { runYoutubeAgent } from "../agents/youtube";
import { AgentResult as AgentResultSchema, RuleFile as RuleFileSchema } from "../contracts/schemas";
import type {
  AgentName,
  AgentProgress,
  AgentProgressState,
  AgentResult,
  EvidenceBundle,
  FinalReport,
  RuleFile,
} from "../contracts/schemas";
import { buildEvidenceBundle } from "../evidence/bundle";
import type { EvidenceInput } from "../evidence/bundle";
import { mergeReports } from "../merge/merge";
import type { MetaClient } from "../meta/client";

export type ReasonFn = (systemPrompt: string, userPayload: unknown) => Promise<unknown>;

export type AgentRunner = (
  bundle: EvidenceBundle,
  rules: RuleFile,
  reason: ReasonFn,
) => Promise<AgentResult>;

export type AgentRunners = Record<AgentName, AgentRunner>;

export interface AnalyzeOptions {
  agentTimeoutMs?: number;
  retryDelayMs?: number;
  runners?: Partial<AgentRunners>;
}

const ALL_AGENTS: AgentName[] = [
  "youtube",
  "tiktok",
  "facebook",
  "copyright",
  "legal_id",
  "packaging_privacy",
];

const DEFAULT_AGENT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 2_000;

const DEFAULT_RUNNERS: AgentRunners = {
  youtube: runYoutubeAgent,
  tiktok: runTiktokAgent,
  facebook: runFacebookAgent,
  copyright: runCopyrightAgent,
  legal_id: runLegalAgent,
  packaging_privacy: runPackagingPrivacyAgent,
};

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

class AgentTimeoutError extends Error {
  constructor(agent: AgentName, timeoutMs: number) {
    super(`Agen ${agent} melebihi batas waktu ${timeoutMs}ms.`);
    this.name = "AgentTimeoutError";
  }
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof AgentTimeoutError;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function rulesDirCandidates(): string[] {
  const dirs: string[] = [];
  dirs.push(join(process.cwd(), "data", "rules"));
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    dirs.push(join(here, "../../../data/rules"));
    dirs.push(join(here, "../../../../data/rules"));
  } catch {
    // process.cwd() candidate already covers the normal case.
  }
  return [...new Set(dirs)];
}

async function readRuleJson(fileName: string): Promise<unknown> {
  let lastError: unknown;
  for (const dir of rulesDirCandidates()) {
    try {
      const raw = await readFile(join(dir, fileName), "utf-8");
      return JSON.parse(raw) as unknown;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Rule file ${fileName} could not be read.`);
}

async function loadRuleFile(fileName: string): Promise<RuleFile> {
  const raw = await readRuleJson(fileName);
  return RuleFileSchema.parse(raw);
}

interface LoadedRules {
  youtube: RuleFile;
  tiktok: RuleFile;
  facebook: RuleFile;
  copyright: RuleFile;
  legal_id: RuleFile;
  packaging_privacy: RuleFile;
}

function buildPackagingRules(
  youtube: RuleFile,
  tiktok: RuleFile,
  facebook: RuleFile,
): RuleFile {
  const wanted = new Set(["privasi_data_pribadi", "spam_clickbait_reupload"]);
  const rules = [...youtube.rules, ...tiktok.rules, ...facebook.rules].filter((rule) =>
    wanted.has(rule.category),
  );
  return RuleFileSchema.parse({
    version: youtube.version,
    updated_at: youtube.updated_at,
    source: youtube.source,
    rules,
  });
}

async function loadAllRules(): Promise<LoadedRules> {
  const [youtube, tiktok, facebook, copyright, legal_id] = await Promise.all([
    loadRuleFile("youtube.json"),
    loadRuleFile("tiktok.json"),
    loadRuleFile("facebook.json"),
    loadRuleFile("copyright.json"),
    loadRuleFile("legal_id.json"),
  ]);
  const packaging_privacy = buildPackagingRules(youtube, tiktok, facebook);
  return { youtube, tiktok, facebook, copyright, legal_id, packaging_privacy };
}

function rulesForAgent(agent: AgentName, rules: LoadedRules): RuleFile {
  switch (agent) {
    case "youtube":
      return rules.youtube;
    case "tiktok":
      return rules.tiktok;
    case "facebook":
      return rules.facebook;
    case "copyright":
      return rules.copyright;
    case "legal_id":
      return rules.legal_id;
    case "packaging_privacy":
      return rules.packaging_privacy;
  }
}

function withTimeout<T>(
  agent: AgentName,
  factory: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new AgentTimeoutError(agent, timeoutMs));
    }, timeoutMs);

    let inner: Promise<T>;
    try {
      inner = factory();
    } catch (err) {
      settled = true;
      clearTimeout(timer);
      reject(err);
      return;
    }
    inner.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function runAgentWithRetry(
  agent: AgentName,
  runner: AgentRunner,
  bundle: EvidenceBundle,
  rules: RuleFile,
  meta: MetaClient,
  timeoutMs: number,
  retryDelayMs: number,
): Promise<AgentResult> {
  const reason: ReasonFn = (systemPrompt, userPayload) =>
    meta.reasonJson(systemPrompt, userPayload);

  let lastError: unknown;
  let lastWasTimeout = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await withTimeout(agent, () => runner(bundle, rules, reason), timeoutMs);
      const parsed = AgentResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `Agent output ${agent} is invalid: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
        );
      }
      if (parsed.data.agent !== agent) {
        return { ...parsed.data, agent };
      }
      return parsed.data;
    } catch (err) {
      lastError = err;
      lastWasTimeout = isTimeoutError(err);
      if (attempt === 0) {
        if (retryDelayMs > 0) await delay(retryDelayMs);
        continue;
      }
    }
  }

  const message = errorMessage(lastError);
  if (lastWasTimeout) {
    return {
      agent,
      status: "batas_waktu",
      risk_level: "rendah",
      findings: [],
      error: message,
    };
  }
  return {
    agent,
    status: "gagal",
    risk_level: "rendah",
    findings: [],
    error: message,
  };
}

function mapStatusToProgress(status: AgentResult["status"]): AgentProgressState {
  switch (status) {
    case "selesai":
      return "done";
    case "gagal":
      return "failed";
    case "batas_waktu":
      return "timeout";
  }
}

export async function analyzeReview(
  input: EvidenceInput,
  meta: MetaClient,
  onProgress: (progress: AgentProgress[]) => void,
  opts?: AnalyzeOptions,
): Promise<FinalReport> {
  const bundle = await buildEvidenceBundle(input, meta);
  const rules = await loadAllRules();

  const agentTimeoutMs = opts?.agentTimeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const retryDelayMs = opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const runners: AgentRunners = { ...DEFAULT_RUNNERS, ...(opts?.runners ?? {}) };

  const stateByAgent = new Map<AgentName, AgentProgressState>(
    ALL_AGENTS.map((agent) => [agent, "queued" as AgentProgressState]),
  );

  const snapshot = (): AgentProgress[] =>
    ALL_AGENTS.map((agent) => ({ agent, state: stateByAgent.get(agent) ?? "queued" }));

  const emit = () => {
    try {
      onProgress(snapshot());
    } catch {
      // A progress callback must never fail the analysis.
    }
  };

  emit();

  const promises = ALL_AGENTS.map(async (agent) => {
    stateByAgent.set(agent, "running");
    emit();
    const result = await runAgentWithRetry(
      agent,
      runners[agent],
      bundle,
      rulesForAgent(agent, rules),
      meta,
      agentTimeoutMs,
      retryDelayMs,
    );
    stateByAgent.set(agent, mapStatusToProgress(result.status));
    emit();
    return result;
  });

  const settled = await Promise.allSettled(promises);
  const results: AgentResult[] = settled.map((entry, index) => {
    if (entry.status === "fulfilled") return entry.value;
    const agent = ALL_AGENTS[index] as AgentName;
    return {
      agent,
      status: "gagal",
      risk_level: "rendah",
      findings: [],
      error: errorMessage(entry.reason),
    };
  });

  // Jaga snapshot akhir konsisten bila ada jalur tak terduga di atas.
  let needsFinalEmit = false;
  results.forEach((result) => {
    const expected = mapStatusToProgress(result.status);
    if (stateByAgent.get(result.agent) !== expected) {
      stateByAgent.set(result.agent, expected);
      needsFinalEmit = true;
    }
  });
  if (needsFinalEmit) emit();

  return mergeReports(results, rules.youtube.version);
}
