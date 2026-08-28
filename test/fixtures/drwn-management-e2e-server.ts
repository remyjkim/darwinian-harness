// ABOUTME: Provides contract-derived HTTPS behavior for the hermetic management Bash journey.
// ABOUTME: Persists replay-safe public state while retaining no bearer, secret value, or response body.

import { readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { parseRouteRequest } from "../../cli/core/management/schemas";
import type { ManagementJsonObject } from "../../cli/core/management/contracts";
import type { ManagementRouteKey } from "../../cli/core/management/routes";
import {
  assertDeploymentBundleBytes,
  assertDeploymentBundleRequestIdentity,
} from "../../cli/core/management/deployment-bundle";

interface DeploymentState {
  deploymentId: string;
  artifactRef: string;
  status: "active" | "created";
  createdAt: string;
}

interface FixtureState {
  schema: "drwn.management-e2e-fixture";
  schemaVersion: 1;
  headerErrors: string[];
  routeKeys: string[];
  requestIds: string[];
  registerRequestIds: string[];
  workerRevision: number;
  bindingRevision: number;
  retired: boolean;
  secretValueObserved: boolean;
  runReadCount: number;
  artifacts: Record<string, number>;
  deployments: DeploymentState[];
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`fixture server requires ${name}`);
  return value;
}

const port = Number(process.env.DRWN_E2E_PORT ?? "9443");
const statePath = requiredEnv("DRWN_E2E_STATE_FILE");
const token = requiredEnv("DRWN_E2E_TOKEN");
const certPath = requiredEnv("DRWN_E2E_TLS_CERT");
const keyPath = requiredEnv("DRWN_E2E_TLS_KEY");
const delayFirstRegister = process.env.DRWN_E2E_DELAY_FIRST_REGISTER === "1";
if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error("fixture server requires a bounded port");

function initialState(): FixtureState {
  return {
    schema: "drwn.management-e2e-fixture",
    schemaVersion: 1,
    headerErrors: [],
    routeKeys: [],
    requestIds: [],
    registerRequestIds: [],
    workerRevision: 1,
    bindingRevision: 1,
    retired: false,
    secretValueObserved: false,
    runReadCount: 0,
    artifacts: {},
    deployments: [],
  };
}

function loadState(): FixtureState {
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as FixtureState;
  } catch {
    return initialState();
  }
}

let state = loadState();
async function persist(): Promise<void> {
  const temporary = `${statePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, statePath);
}

function routeFor(method: string, pathname: string): { routeKey: ManagementRouteKey; path: ManagementJsonObject } | null {
  if (method === "GET" && pathname === "/api/organizations") return { routeKey: "organizations.list", path: {} };
  const organization = pathname.match(/^\/api\/organizations\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/);
  if (method === "GET" && organization) return { routeKey: "organizations.read", path: { organizationId: organization[1]! } };
  if (method === "POST" && pathname === "/api/deployed-workers/register") return { routeKey: "deployed_workers.register", path: {} };
  if (method === "GET" && pathname === "/api/deployed-workers") return { routeKey: "deployed_workers.list", path: {} };
  const artifact = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/deployment-artifacts\/([a-f0-9]{64})$/);
  if (method === "PUT" && artifact) return { routeKey: "deployment_artifacts.put", path: { deployedWorkerId: artifact[1]!, artifactSha256: artifact[2]! } };
  const rollback = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/deployments\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/rollback$/);
  if (method === "POST" && rollback) return { routeKey: "deployments.rollback", path: { deployedWorkerId: rollback[1]!, deploymentId: rollback[2]! } };
  const deployments = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/deployments$/);
  if (deployments) return {
    routeKey: method === "POST" ? "deployments.create" : "deployments.list",
    path: { deployedWorkerId: deployments[1]! },
  };
  const secret = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/secrets\/([A-Z][A-Z0-9_]*)$/);
  if (method === "PUT" && secret) return { routeKey: "secrets.set", path: { deployedWorkerId: secret[1]!, name: secret[2]! } };
  const run = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/runs\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/);
  if (method === "GET" && run) return { routeKey: "runs.read", path: { deployedWorkerId: run[1]!, runId: run[2]! } };
  const runs = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/runs$/);
  if (method === "POST" && runs) return { routeKey: "runs.create", path: { deployedWorkerId: runs[1]! } };
  const retire = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\/retire$/);
  if (method === "POST" && retire) return { routeKey: "deployed_workers.retire", path: { deployedWorkerId: retire[1]! } };
  const worker = pathname.match(/^\/api\/deployed-workers\/([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$/);
  if (method === "GET" && worker) return { routeKey: "deployed_workers.read", path: { deployedWorkerId: worker[1]! } };
  return null;
}

function queryObject(url: URL): ManagementJsonObject {
  const result: ManagementJsonObject = {};
  for (const [key, value] of url.searchParams) {
    result[key] = key === "limit" ? Number(value) : value;
  }
  return result;
}

function worker() {
  return {
    organizationId: "org_acme",
    workerId: "worker_alpha",
    deployedWorkerId: "deployed_worker_alpha",
    name: "worker-alpha",
    environment: "staging",
    workerRevision: state.workerRevision,
    bindingRevision: state.bindingRevision,
    retired: state.retired,
  };
}

function response(requestId: string, data: ManagementJsonObject, status = 200): Response {
  return Response.json({ requestId, ...data }, { status });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const matched = routeFor(request.method, url.pathname);
  const requestId = request.headers.get("X-Request-Id") ?? "00000000-0000-4000-8000-000000000000";
  const headerChecks: Array<[string, boolean]> = [
    ["Authorization", request.headers.get("Authorization") === `Bearer ${token}`],
    ["X-Drwn-Protocol", request.headers.get("X-Drwn-Protocol") === "deployed-worker.v1"],
    ["X-Drwn-Version", request.headers.get("X-Drwn-Version") === "1.4.2"],
    ["X-Request-Id", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)],
  ];
  for (const [name, valid] of headerChecks) if (!valid && !state.headerErrors.includes(name)) state.headerErrors.push(name);
  if (!matched || state.headerErrors.length > 0) {
    await persist();
    return Response.json({
      error: "client_protocol_unsupported",
      receivedProtocol: request.headers.get("X-Drwn-Protocol"),
      requiredProtocol: "deployed-worker.v1",
      minimumDrwnVersion: "1.4.2",
    }, { status: 426 });
  }

  let body: ManagementJsonObject = {};
  let rawBundle: Buffer | undefined;
  if (matched.routeKey === "deployment_artifacts.put") {
    const contentLength = request.headers.get("Content-Length");
    const contentType = request.headers.get("Content-Type");
    const contentEncoding = request.headers.get("Content-Encoding");
    if (contentType !== "application/vnd.darwinian.worker-deploy-bundle.v1+tar") state.headerErrors.push("Content-Type");
    if (contentLength === null || !/^[1-9][0-9]*$/.test(contentLength)) state.headerErrors.push("Content-Length");
    if (contentEncoding !== null) state.headerErrors.push("Content-Encoding");
    if (state.headerErrors.length > 0) {
      await persist();
      return Response.json({ requestId, error: "validation_failed" }, { status: 400 });
    }
    rawBundle = Buffer.from(await request.arrayBuffer());
    assertDeploymentBundleBytes(rawBundle);
    body.byteLength = Number(contentLength);
  } else if (request.method !== "GET") {
    body = await request.json() as ManagementJsonObject;
  }
  const candidate = parseRouteRequest(matched.routeKey, {
    requestId,
    ...matched.path,
    ...queryObject(url),
    ...body,
  });
  state.routeKeys.push(matched.routeKey);
  state.requestIds.push(requestId);

  if (matched.routeKey === "organizations.list") {
    await persist();
    return response(requestId, { organizations: [{ organizationId: "org_acme", displayName: "Acme", revision: 1 }], nextCursor: null });
  }
  if (matched.routeKey === "organizations.read") {
    await persist();
    return response(requestId, { organization: { organizationId: "org_acme", displayName: "Acme", revision: 1 } });
  }
  if (matched.routeKey === "deployed_workers.register") {
    if (!state.registerRequestIds.includes(requestId)) state.registerRequestIds.push(requestId);
    await persist();
    if (delayFirstRegister && state.registerRequestIds.length === 1) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
    return response(requestId, {
      organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
      workerRevision: state.workerRevision, bindingRevision: state.bindingRevision,
    });
  }
  if (matched.routeKey === "deployed_workers.list") {
    await persist();
    return response(requestId, { workers: [worker()], nextCursor: null });
  }
  if (matched.routeKey === "deployed_workers.read") {
    await persist();
    return response(requestId, { worker: worker() });
  }
  if (matched.routeKey === "deployment_artifacts.put") {
    const sha = String(candidate.artifactSha256);
    const bytes = rawBundle!;
    assertDeploymentBundleRequestIdentity(candidate, bytes);
    const existed = Object.hasOwn(state.artifacts, sha);
    state.artifacts[sha] = bytes.byteLength;
    await persist();
    return response(requestId, {
      deployedWorkerId: "deployed_worker_alpha", artifactRef: `deployment_artifact:sha256:${sha}`,
      artifactSha256: sha, byteLength: bytes.byteLength, status: existed ? "existing" : "created",
    });
  }
  if (matched.routeKey === "deployments.create") {
    if (candidate.expectedWorkerRevision !== state.workerRevision) throw new Error("deployment revision mismatch");
    state.workerRevision += 1;
    const deploymentId = `deployment_attempt_${String(state.deployments.length + 1).padStart(4, "0")}`;
    for (const deployment of state.deployments) deployment.status = "created";
    state.deployments.push({
      deploymentId,
      artifactRef: String(candidate.artifactRef),
      status: "active",
      createdAt: `2026-08-25T12:0${state.deployments.length}:00Z`,
    });
    await persist();
    return response(requestId, {
      deployedWorkerId: "deployed_worker_alpha", deploymentId, workerRevision: state.workerRevision,
      createdAt: state.deployments.at(-1)!.createdAt,
    });
  }
  if (matched.routeKey === "deployments.list") {
    await persist();
    return response(requestId, {
      deployments: state.deployments.map((deployment) => ({ ...deployment, deployedWorkerId: "deployed_worker_alpha" })),
      nextCursor: null,
    });
  }
  if (matched.routeKey === "deployments.rollback") {
    if (candidate.expectedWorkerRevision !== state.workerRevision) throw new Error("rollback revision mismatch");
    const selected = state.deployments.find((deployment) => deployment.deploymentId === candidate.deploymentId);
    if (!selected) throw new Error("rollback target missing");
    for (const deployment of state.deployments) deployment.status = deployment === selected ? "active" : "created";
    state.workerRevision += 1;
    await persist();
    return response(requestId, {
      deployedWorkerId: "deployed_worker_alpha", deploymentId: selected.deploymentId,
      workerRevision: state.workerRevision, activatedAt: "2026-08-25T12:05:00Z",
    });
  }
  if (matched.routeKey === "secrets.set") {
    if (candidate.expectedWorkerRevision !== state.workerRevision) throw new Error("secret revision mismatch");
    state.secretValueObserved = typeof candidate.value === "string" && candidate.value.length > 0;
    state.workerRevision += 1;
    await persist();
    return response(requestId, {
      deployedWorkerId: "deployed_worker_alpha", name: String(candidate.name), secretRevision: 1,
      workerRevision: state.workerRevision, observedAt: "2026-08-25T12:10:00Z",
    });
  }
  if (matched.routeKey === "runs.create") {
    state.runReadCount = 0;
    await persist();
    return response(requestId, {
      deployedWorkerId: "deployed_worker_alpha", runId: "run_0001", status: "queued",
      createdAt: "2026-08-25T12:15:00Z",
    });
  }
  if (matched.routeKey === "runs.read") {
    state.runReadCount += 1;
    const succeeded = state.runReadCount >= 2;
    await persist();
    return response(requestId, { run: {
      runId: "run_0001", deployedWorkerId: "deployed_worker_alpha", status: succeeded ? "succeeded" : "queued",
      ...(succeeded ? { output: "Release ledger summarized." } : {}),
      createdAt: "2026-08-25T12:15:00Z", updatedAt: succeeded ? "2026-08-25T12:16:00Z" : "2026-08-25T12:15:01Z",
    } });
  }
  if (matched.routeKey === "deployed_workers.retire") {
    if (candidate.expectedWorkerRevision !== state.workerRevision || candidate.expectedBindingRevision !== state.bindingRevision) {
      throw new Error("retirement revision mismatch");
    }
    state.workerRevision += 1;
    state.bindingRevision += 1;
    state.retired = true;
    await persist();
    return response(requestId, {
      organizationId: "org_acme", workerId: "worker_alpha", deployedWorkerId: "deployed_worker_alpha",
      workerRevision: state.workerRevision, bindingRevision: state.bindingRevision, retiredAt: "2026-08-25T12:20:00Z",
    });
  }
  throw new Error(`unhandled ${matched.routeKey}`);
}

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  tls: { cert: readFileSync(certPath), key: readFileSync(keyPath) },
  fetch: handle,
  error(error) {
    process.stderr.write(`fixture request failed: ${error instanceof Error ? error.message : "unknown"}\n`);
    return new Response(null, { status: 500 });
  },
});

process.stdout.write(`drwn management fixture listening on ${server.url.origin}\n`);
