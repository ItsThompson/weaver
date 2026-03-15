import { DEFAULT_CONFIG } from "@weaver/shared/types";

vi.mock("../services/config/index", () => ({
  readConfig: vi.fn(),
  parseAndValidateConfig: vi.fn(),
  writeConfig: vi.fn(),
}));

vi.mock("../services/event-bus", () => ({
  broadcast: vi.fn(),
  emit: vi.fn(),
  sseReply: vi.fn(),
}));

import {
  readConfig,
  parseAndValidateConfig,
  writeConfig,
} from "../services/config/index";
import { emit } from "../services/event-bus";
import Fastify from "fastify";
import { registerConfigRoutes } from "./config";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(writeConfig).mockResolvedValue(undefined);
  server = Fastify();
  registerConfigRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("PUT /api/config", () => {
  it("emits configChanged SSE after successful write", async () => {
    const config = { ...DEFAULT_CONFIG, dark_mode: false };
    vi.mocked(parseAndValidateConfig).mockReturnValue({ config, warnings: [] });

    const res = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: config,
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(emit)).toHaveBeenCalledWith({
      event: "configChanged",
      data: { ...config },
    });
  });

  it("does not emit SSE on validation failure", async () => {
    vi.mocked(parseAndValidateConfig).mockReturnValue({
      config: DEFAULT_CONFIG,
      warnings: ["bad field"],
    });

    const res = await server.inject({
      method: "PUT",
      url: "/api/config",
      payload: DEFAULT_CONFIG,
    });

    expect(res.statusCode).toBe(422);
    expect(vi.mocked(emit)).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/config", () => {
  it("merges partial body with current config and returns merged result", async () => {
    const current = { ...DEFAULT_CONFIG, ghost_mode: false };
    const merged = { ...current, ghost_mode: true };
    vi.mocked(readConfig).mockResolvedValue({ config: current, warnings: [] });
    vi.mocked(parseAndValidateConfig).mockReturnValue({
      config: merged,
      warnings: [],
    });

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { ghost_mode: true },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ config: merged });
    expect(vi.mocked(writeConfig)).toHaveBeenCalledWith(merged);
  });

  it("emits configChanged SSE after successful write", async () => {
    const config = { ...DEFAULT_CONFIG, ghost_mode: true };
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });
    vi.mocked(parseAndValidateConfig).mockReturnValue({ config, warnings: [] });

    await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { ghost_mode: true },
    });

    expect(vi.mocked(emit)).toHaveBeenCalledWith({
      event: "configChanged",
      data: { ...config },
    });
  });

  it("returns 422 on validation failure", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });
    vi.mocked(parseAndValidateConfig).mockReturnValue({
      config: DEFAULT_CONFIG,
      warnings: ["ghost_opacity must be a number between 0 and 1"],
    });

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: { ghost_opacity: 5 },
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body)).toEqual({
      error: "ghost_opacity must be a number between 0 and 1",
    });
    expect(vi.mocked(emit)).not.toHaveBeenCalled();
  });

  it("returns current config unchanged when body is empty", async () => {
    vi.mocked(readConfig).mockResolvedValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });
    vi.mocked(parseAndValidateConfig).mockReturnValue({
      config: DEFAULT_CONFIG,
      warnings: [],
    });

    const res = await server.inject({
      method: "PATCH",
      url: "/api/config",
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ config: DEFAULT_CONFIG });
  });
});
