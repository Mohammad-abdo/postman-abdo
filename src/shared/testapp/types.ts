/** Shared data shapes of the Collection-to-Test-App generator. Pure data, no I/O. */

export type Provenance = 'documented' | 'inferred' | 'user' | 'ai' | 'unknown';

export interface Warning {
  code: string;
  message: string;
  endpoint?: string;
}

export interface Param {
  name: string;
  in: 'path' | 'query' | 'header' | 'body' | 'form';
  example?: string;
  /** Only set when the collection documents it. Never guessed. */
  required?: boolean;
  description?: string;
  /** form-data field kind */
  kind?: 'text' | 'file';
}

export interface ExampleModel {
  name: string;
  code: number;
  headers: Record<string, string>;
  /** Parsed JSON body (undefined when not JSON). */
  body?: unknown;
  raw: string;
}

export interface Endpoint {
  /** Stable key: `METHOD /normalized/{param}/path`, suffixed `#2` for duplicates. */
  key: string;
  id: string;
  name: string;
  method: string;
  urlTemplate: string;
  /** Normalized path (no host/query), literals kept, params as `{name}`. */
  path: string;
  /** Segments used for resource grouping (version prefixes such as `api`/`v1` removed). */
  segments: string[];
  host: string | null;
  folderPath: string[];
  /** Original collection order — metadata only. */
  order: number;
  pathParams: Param[];
  query: Param[];
  headers: Param[];
  body: { mode: string; fields: Param[]; example?: unknown; contentType?: string };
  auth: { type: string; inherited: boolean };
  examples: ExampleModel[];
  scriptHints: { sets: string[]; extracts: { variable: string; expression: string }[]; reads: string[] };
  flags: { external: boolean; multipart: boolean; fileUpload: boolean };
}

export interface ApiModel {
  meta: { name: string; sourceHash: string; endpointCount: number; folderCount: number };
  endpoints: Endpoint[];
  warnings: Warning[];
}

/* ---------- contract ---------- */

export interface SchemaNode {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | 'unknown';
  format?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  /** Keys present in every observed example (needs ≥2 examples to be a candidate). */
  requiredCandidates?: string[];
  nullable?: boolean;
  example?: unknown;
  /** confirmed = documented schema; inferred = merged from examples; missing = nothing known. */
  status: 'confirmed' | 'inferred' | 'missing';
  seenIn: number;
}

export interface ContractEndpoint {
  key: string;
  requestId: string;
  auth: { type: string };
  request: { pathParams: Param[]; query: Param[]; headers: Param[]; body?: SchemaNode };
  responses: Record<string, { schema: SchemaNode; exampleCount: number; status: SchemaNode['status'] }>;
}

export interface Contract {
  version: string;
  sourceHash: string;
  endpoints: Record<string, ContractEndpoint>;
}

/* ---------- relationships ---------- */

export type Role =
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'patch'
  | 'delete'
  | 'search'
  | 'action'
  | 'nested-list'
  | 'nested-create'
  | 'nested-get'
  | 'nested-update'
  | 'nested-delete'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.refresh'
  | 'auth.session'
  | 'unknown';

export interface Resource {
  /** e.g. `orders` or `orders.items` */
  id: string;
  name: string;
  parent?: string;
  endpoints: { key: string; role: Role }[];
  confidence: number;
  provenance: Provenance;
  evidence: string[];
}

export interface Edge {
  from: string;
  to: string;
  type: 'childOf' | 'producesFor' | 'requiresAuth';
  confidence: number;
  provenance: Provenance;
  evidence: string[];
}

export interface RelationshipGraph {
  resources: Resource[];
  edges: Edge[];
  roles: Record<string, { role: Role; resource: string | null; verb?: string }>;
  authLogin: string | null;
  cycles: string[][];
  unresolved: { endpoint: string; reason: string }[];
}

/* ---------- mapping / application schema ---------- */

export interface Disposition {
  state: 'mapped' | 'excluded' | 'background' | 'explorer';
  reason?: string;
  ruleId: string;
  provenance: Provenance;
}

export interface FieldDef {
  name: string;
  in: 'path' | 'query' | 'body' | 'form' | 'header';
  input: 'text' | 'number' | 'password' | 'email' | 'date' | 'checkbox' | 'select' | 'file' | 'textarea';
  options?: string[];
  example?: string;
}

export interface Component {
  id: string;
  type: 'table' | 'detail' | 'form' | 'button' | 'tabs' | 'section' | 'responseViewer' | 'actionPanel' | 'idPrompt';
  [key: string]: any;
}

export interface Screen {
  id: string;
  title: string;
  kind: 'list' | 'detail' | 'modal' | 'login' | 'profile' | 'explorer' | 'page';
  resource?: string;
  sources: string[];
  components: Component[];
  requiresAuth?: boolean;
  ruleId: string;
  provenance: Provenance;
}

export interface ActionDef {
  id: string;
  label: string;
  endpoint: string;
  kind: string;
  confirm?: string;
  inputs: FieldDef[];
  ruleId: string;
  provenance: Provenance;
}

export interface Proposal {
  slot: string;
  value: any;
  ruleId: string;
  layer: 'user' | 'collection' | 'project' | 'builtin' | 'ai';
  priority: number;
  provenance: Provenance;
}

export interface Conflict {
  slot: string;
  candidates: { ruleId: string; layer: string }[];
  chosen: string;
}

export interface TraceEntry {
  slot: string;
  winner: string;
  losers: string[];
}

export interface AppSchema {
  schemaVersion: 1;
  app: { name: string; sourceHash: string; contractVersion: string; ruleSetVersion: string; seed: number };
  nav: { id: string; label: string; screen: string; requiresAuth: boolean; action?: string; order?: number }[];
  screens: Screen[];
  actions: Record<string, ActionDef>;
  endpoints: Record<string, { requestId: string; method: string; path: string; role: Role; resource: string | null }>;
  dispositions: Record<string, Disposition>;
  workflows: { id: string; name: string; steps: string[]; provenance: Provenance }[];
  review: { endpoint: string; reason: string }[];
  conflicts: Conflict[];
  trace: TraceEntry[];
}

export interface Override {
  target: string;
  decision: { exclude?: string; include?: boolean; title?: string };
}

export interface GenerateOptions {
  seed?: number;
  overrides?: Override[];
  disabledRules?: string[];
}

export interface Bundle {
  model: ApiModel;
  contract: Contract;
  graph: RelationshipGraph;
  schema: AppSchema;
  stats: {
    endpoints: number;
    mapped: number;
    explorer: number;
    excluded: number;
    background: number;
    screens: number;
    actions: number;
    warnings: number;
    conflicts: number;
  };
}
