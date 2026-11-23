import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  hostExecutor: { name: "host" },
  container: null as string | null,
  containerProvider: vi.fn(),
  hostProvider: vi.fn(),
  detectPaths: vi.fn(),
}));

vi.mock("@repo/db", () => ({ repos: {} }));
vi.mock("../src/engine/lib/ssh-manager", () => ({
  sshManager: {
    probeReachable: async () => true,
    withExecutor: async (_id: string, fn: (executor: unknown) => unknown) => fn(h.hostExecutor),
  },
}));
vi.mock("../src/engine/lib/cache-store/index", () => ({
  cacheStore: async () => ({
    get: async () => undefined,
    set: async () => {},
    delete: async () => {},
  }),
}));
vi.mock("../src/engine/lib/edge-provider-options", () => ({
  resolveEdgeProviderOptions: async () => ({}),
}));
vi.mock("@repo/adapters", () => ({
  resolveOurEdgeContainer: async () => h.container,
  containerEdgeProvider: async (executor: unknown, container: string) => {
    h.containerProvider(executor, container);
    return { kind: "container", container };
  },
  detectOpenRestyPaths: async () => h.detectPaths(),
  rootOrDegrade: async (executor: unknown) => executor,
  NginxProvider: class {
    kind = "host";
    constructor(opts: unknown) {
      h.hostProvider(opts);
    }
  },
}));

const { withServerEdgeRouting } = await import("../src/engine/lib/openresty-paths");

beforeEach(() => {
  vi.clearAllMocks();
  h.container = null;
  h.detectPaths.mockResolvedValue({ sitesDir: "/etc/openresty/sites-enabled" });
});

it("drives the edge container when the server runs one, not the host OpenResty", async () => {
  // #1864: the Lua preflight and vhost writes must run where the edge lives.
  h.container = "openship-edge";
  const routing = await withServerEdgeRouting("srv_1", async (r) => r);
  expect(routing).toEqual({ kind: "container", container: "openship-edge" });
  expect(h.containerProvider).toHaveBeenCalledExactlyOnceWith(h.hostExecutor, "openship-edge");
  expect(h.hostProvider).not.toHaveBeenCalled();
  expect(h.detectPaths).not.toHaveBeenCalled();
});

it("keeps using the host OpenResty when no edge container is running", async () => {
  const routing = await withServerEdgeRouting("srv_1", async (r) => r);
  expect(routing).toMatchObject({ kind: "host" });
  expect(h.containerProvider).not.toHaveBeenCalled();
  expect(h.hostProvider).toHaveBeenCalledOnce();
});
