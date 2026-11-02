export type MetaErrorCode = "timeout" | "http" | "network" | "config";

export class MetaError extends Error {
  readonly code: MetaErrorCode;

  constructor(code: MetaErrorCode, message: string) {
    super(message);
    this.name = "MetaError";
    this.code = code;
  }
}

export interface MetaTimeouts {
  transcribe: number;
  video: number;
  image: number;
  sam: number;
  reason: number;
}

export const DEFAULT_TIMEOUTS: MetaTimeouts = {
  transcribe: 120_000,
  video: 120_000,
  image: 60_000,
  sam: 30_000,
  reason: 60_000,
};

export interface MetaConfig {
  mock: boolean;
  apiKey: string | undefined;
  baseUrl: string | undefined;
}

export interface MetaConfigOverrides {
  forceMock?: boolean;
  apiKey?: string;
  baseUrl?: string;
}

export function loadMetaConfig(overrides: MetaConfigOverrides = {}): MetaConfig {
  const mock =
    overrides.forceMock ?? (process.env.META_MOCK === "1" ? true : process.env.META_MOCK === "0" ? false : undefined);
  return {
    mock: mock === true,
    apiKey: overrides.apiKey ?? process.env.META_API_KEY,
    baseUrl: overrides.baseUrl ?? process.env.META_BASE_URL,
  };
}
