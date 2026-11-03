export type FileBundle = Record<string, string>;
export type SourceManifest = Record<string, string | null>;

export interface Command {
  name: string;
  command: string;
  timeoutMinutes: number;
}

export interface Project {
  version: 1;
  repo: string;
  instructions: string[];
  checks: Command[];
  setup: Command[];
  commands: string[];
  protectedPaths: string[];
  copyPaths: string[];
  readOnlyPaths: string[];
  network: { allowedDomains: string[]; allowLocalBinding: boolean };
  env: Record<string, string>;
}

export interface Preferences {
  settings: { instructions?: string; files?: string[]; checks: Command[] };
  files: FileBundle;
}

export interface SourceLink {
  file: string;
  label?: string;
  line?: number;
  why?: string;
}

export interface Design {
  summary: string;
  components?: { label: string; owns: string }[];
  patterns?: SourceLink[];
}

export interface Block {
  id: string;
  title: string;
  paths: string[];
  dependsOn: string[];
  design?: Design;
}

export interface RepairLimits {
  maxRepairPasses?: number;
  repairMinutes?: number;
}

export interface Plan extends RepairLimits {
  version: 1;
  name: string;
  blocks: Block[];
}

export interface CLIPlan extends Plan {
  model: string;
  maxUsd: number;
  maxTurns: number;
  timeoutMinutes: number;
  delivery: 'diff' | 'commits';
}

export interface NativePlan extends Plan {
  stopAt: string;
  finalReviewAt: string;
}

interface Inputs<P extends Plan> {
  version: 1;
  plan: P;
  brief: string;
  project: Project;
  instructions: FileBundle;
  preferences: Preferences;
  skills: FileBundle;
  runtimeId: string;
  base: string;
}

export interface CLIInputs extends Inputs<CLIPlan> { mode?: 'cli' }
export interface NativeInputs extends Inputs<NativePlan> {
  mode: 'native';
  initialManifest: SourceManifest;
}

export type ReviewAxis = 'standards' | 'spec';
export interface Finding {
  id: string;
  file: string;
  line: number;
  category: 'correctness' | 'architecture' | 'readability' | 'verification';
  blocking: boolean;
  message: string;
  suggestion: string;
}

export interface Review {
  standards: { passed: boolean; findings: Finding[] };
  spec: { passed: boolean; findings: Finding[] };
  summary: string;
  notVerified: string[];
  closed?: { id: string; reason: string }[];
}

export interface CheckResult {
  name: string;
  passed: boolean;
  command?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  output?: string;
  reason?: string | null;
}

export interface Checks {
  passed: boolean;
  tree: string;
  head?: string;
  errors: string[];
  steps: CheckResult[];
  checkedAt?: string;
  environment?: { node: string; platform: string };
}

export interface Failure {
  errors: string[];
  checks: Checks;
  review: Review | null;
}

export interface RepairRecord {
  repairAttempts?: number;
  repairStartedAt?: number;
  repairDeadline?: number;
}

export type BlockStatus = 'pending' | 'running' | 'building' | 'repairing' | 'checking' |
  'awaiting-review' | 'needs-repair' | 'blocked' | 'interrupted' | 'failed' | 'accepted' | 'review_ready';

export interface CLIBlock extends RepairRecord {
  status: BlockStatus;
  repo: string;
  base: string;
  startedAt: string;
  finishedAt?: string;
  head?: string | null;
  tree?: string;
  reason?: string;
  openReview?: Review;
  failure?: Failure;
}

export interface NativeBlock extends RepairRecord {
  status?: BlockStatus;
  baseline: SourceManifest;
  builder?: string;
  reviewer?: string;
  base?: string;
  startedAt?: string;
  files?: string[];
  checks?: Checks;
  review?: Review;
  openReview?: Review;
  reason?: string;
}

export interface CLIState {
  version: 1;
  approvalHash: string;
  base: string;
  acceptedRepo: string;
  acceptedHead: string;
  spentUsd: number;
  costUnknown: boolean;
  deadline?: number;
  blocks: Record<string, CLIBlock>;
}

export interface NativeState {
  version: 2;
  mode: 'native';
  runId: string;
  approvalHash: string;
  startedAt: string;
  deadline: number;
  implementationDeadline: number;
  blocks: Record<string, NativeBlock>;
  builders: string[];
  events: { at: string; action: string; block: string | null; actor: string; reason: string | null }[];
  final?: NativeBlock | null;
  stopped?: boolean;
  stopReason?: string;
}

export interface PrepareArgs {
  task?: string;
  project?: string;
  preferences?: string;
  folder: string;
  approve?: string;
}

export interface CommandContext { repo: string; base: string; folder: string }
export type ModelRole = 'build' | 'repair' | 'review';
export interface ModelCall {
  inputs: CLIInputs;
  folder: string;
  saved: Pick<CLIBlock, 'repo' | 'base'>;
  role: ModelRole;
  prompt: string;
  maxUsd: number;
  timeoutMs: number;
}

export interface ModelResult {
  ok: boolean;
  costUsd: number | null;
  text?: string;
  review?: Review | null;
  error?: string | null;
}
export type InvokeModel = (call: ModelCall) => ModelResult;

export interface EvalCase {
  prompt: string;
  files: FileBundle;
  protected: string[];
  assertions: string;
  review: string;
  commentFiles?: string[];
}
export type EvalCases = Record<string, EvalCase>;

export interface Flags {
  task?: string; project?: string; run?: string; preferences?: string;
  approve?: string; block?: string; reason?: string; action?: string;
  case?: string; folder?: string; cases?: string; input?: string; actor?: string; port?: string;
  execute?: boolean; all?: boolean;
}
