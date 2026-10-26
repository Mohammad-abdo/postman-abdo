import { ScopeValue } from '../../../shared/postman/variables';

export interface RunSettings {
  strictSSL?: boolean;
  followRedirects?: boolean;
  /** ms, 0 = no timeout */
  timeout?: number;
  /** MB, 0 = unlimited */
  maxResponseSize?: number;
  disableCookies?: boolean;
  /** Hosts / CIDR ranges the requester must refuse to connect to (SSRF protection). */
  restrictedAddresses?: Record<string, boolean>;
}

export type RuntimeEvent = 'beforeItem' | 'request' | 'console' | 'item';

export interface RunInput {
  collection: unknown;
  /** Item id, or several ids run in the given order. */
  entrypoint?: string | string[];
  environment?: ScopeValue[];
  globals?: ScopeValue[];
  data?: Record<string, unknown>[];
  iterationCount?: number;
  delay?: number;
  settings?: RunSettings;
  cookieJar?: unknown;
  bail?: boolean;
  onEvent?: (event: RuntimeEvent, payload: unknown) => void;
  registerAbort?: (abort: () => void) => void;
}

export interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  error: string | null;
}

export interface SentRequest {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  size: { headers: number; body: number };
}

export interface ReceivedResponse {
  code: number;
  status: string;
  headers: { key: string; value: string }[];
  cookies: Record<string, unknown>[];
  body?: string;
  bodyBase64?: string | null;
  contentType: string;
  isText: boolean;
  responseTime: number;
  size: { body: number; headers: number; total: number };
  timings: Record<string, number> | null;
  network: Record<string, unknown> | null;
  redirects: { url?: string; method?: string; code?: number }[];
}

export interface Execution {
  id: string;
  itemId: string;
  name: string;
  iteration: number;
  path: string[];
  request: SentRequest | null;
  response: ReceivedResponse | null;
  error: string | null;
  tests: TestResult[];
  prerequestError: string | null;
  testError: string | null;
  visualizer: { html: string; error: string | null; data: unknown } | null;
  skipped?: boolean;
}

export interface ConsoleEntry {
  level: string;
  messages: unknown[];
  itemId?: string;
  time: number;
}

export interface RunStats {
  iterations: number;
  requests: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  totalTime: number;
}

export interface RunResult {
  executions: Execution[];
  console: ConsoleEntry[];
  environment: ScopeValue[];
  globals: ScopeValue[];
  collectionVariables: ScopeValue[];
  error: string | null;
  stats: RunStats;
}
