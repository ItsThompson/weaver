import { DEFAULT_CONFIG } from "@weaver/shared/types";

vi.mock("../services/config/index", async () => {
  const actual = await vi.importActual("../services/config/index");
  return {
    ...actual,
    readConfig: vi.fn(),
    writeConfig: vi.fn(),
  };
});

vi.mock("../services/event-bus", () => ({
  broadcast: vi.fn(),
  emit: vi.fn(),
  sseReply: vi.fn(),
}));

vi.mock("../services/config/validators/validate-paths", () => ({
  validatePathsExist: vi.fn(),
}));

vi.mock("../services/skill-graph/discover", () => ({
  skillCache: { clear: vi.fn() },
}));

import { readConfig, writeConfig } from "../services/config/index";
import { emit } from "../services/event-bus";
import { validatePathsExist } from "../services/config/validators/validate-paths";
import { skillCache } from "../services/skill-graph/discover";
import Fastify from "fastify";
import { registerConfigRoutes } from "./config";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(writeConfig).mockResolvedValue(undefined);
  vi.mocked(validatePathsExist).mockResolvedValue([]);
  server = Fastify();
  registerConfigRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("PUT /api/config", () => {
  it("emits configChanged SSE after successful write", async () => {
    const config = { ...DEFAULT_CONFIG, dark_mode: false };

    const res = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: config,
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(emit)).toHaveBeenCalledWith({
      event: "configChanged",
      data: expect.objectContaining({ dark_mode: false }),
    });
  });

  it("returns 422 with real validation warning for invalid field", async () => {
    const res = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { ...DEFAULT_CONFIG, dark_mode: "not-a-boolean" },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("dark_mode must be a boolean");
    expect(vi.mocked(emit)).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/config", () => {
  it("merges partial body with current config and returns merged result", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: { ...DEFAULT_CONFIG, ghost_mode: false },
      warnings: [],
    });

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { ghost_mode: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.ghost_mode).toBe(true);
  });

  it("emits configChanged SSE after successful write", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });

    await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { ghost_mode: true },
    });

    expect(vi.mocked(emit)).toHaveBeenCalledWith({
      event: "configChanged",
      data: expect.objectContaining({ ghost_mode: true }),
    });
  });

  it("returns 422 with real validation warning for invalid field", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { ghost_opacity: 5 },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain(
      "ghost_opacity must be a number between 0 and 1",
    );
    expect(vi.mocked(emit)).not.toHaveBeenCalled();
  });

  it("returns current config unchanged when body is empty", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.dark_mode).toBe(DEFAULT_CONFIG.dark_mode);
  });
});

describe("PUT /api/config skill_paths validation", () => {
  it("returns 422 when skill_paths contain invalid paths", async () => {
    vi.mocked(validatePathsExist).mockResolvedValue([
      "/nonexistent: path does not exist",
    ]);

    const res = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { ...DEFAULT_CONFIG, skill_paths: ["/nonexistent"] },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("path does not exist");
    expect(vi.mocked(writeConfig)).not.toHaveBeenCalled();
  });

  it("clears skill cache on successful write", async () => {
    await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: { ...DEFAULT_CONFIG },
    });

    expect(skillCache.clear).toHaveBeenCalled();
  });
});

describe("PATCH /api/config skill_paths validation", () => {
  it("returns 422 when skill_paths contain invalid paths", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });
    vi.mocked(validatePathsExist).mockResolvedValue([
      "/nonexistent: path does not exist",
    ]);

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { skill_paths: ["/nonexistent"] },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("path does not exist");
    expect(vi.mocked(writeConfig)).not.toHaveBeenCalled();
  });

  it("clears skill cache on successful write", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });

    await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: {},
    });

    expect(skillCache.clear).toHaveBeenCalled();
  });
});
