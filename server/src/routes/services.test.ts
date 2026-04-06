import type { ServicesStatusResponse } from "@weaver/shared/types";

const mockGetStatus = vi.fn<() => Promise<ServicesStatusResponse>>();

vi.mock("../services/service-manager-instance", () => ({
  serviceManager: { getStatus: (...args: unknown[]) => mockGetStatus(...args) },
}));

import Fastify from "fastify";
import { registerServicesRoute } from "./services";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerServicesRoute(server);
  await server.ready();
});

afterEach(() => server.close());

describe("GET /api/services/status", () => {
  it("returns service status from the service manager", async () => {
    const status: ServicesStatusResponse = {
      ready: true,
      services: {
        whisper: { state: "running" },
        ollama: { state: "running" },
      },
    };
    mockGetStatus.mockResolvedValue(status);

    const response = await server.inject({
      method: "GET",
      url: "/api/services/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(status);
  });

  it("returns not_configured when dictation is disabled", async () => {
    const status: ServicesStatusResponse = {
      ready: true,
      services: {
        whisper: { state: "not_configured" },
        ollama: { state: "not_configured" },
      },
    };
    mockGetStatus.mockResolvedValue(status);

    const response = await server.inject({
      method: "GET",
      url: "/api/services/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(status);
  });

  it("returns error states with error messages", async () => {
    const status: ServicesStatusResponse = {
      ready: true,
      services: {
        whisper: { state: "error", error: "Whisper failed to start" },
        ollama: { state: "error", error: "Ollama not found" },
      },
    };
    mockGetStatus.mockResolvedValue(status);

    const response = await server.inject({
      method: "GET",
      url: "/api/services/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(status);
  });
});
