vi.mock("../../services/snippets/index", () => ({
  readSnippets: vi.fn().mockResolvedValue([]),
  writeSnippet: vi.fn(),
  updateSnippet: vi.fn(),
  deleteSnippet: vi.fn(),
}));

import Fastify from "fastify";
import {
  readSnippets,
  writeSnippet,
  updateSnippet,
  deleteSnippet,
} from "../../services/snippets/index";
import { registerSnippetRoutes } from "./snippets";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify({ ajv: { customOptions: { coerceTypes: false } } });
  registerSnippetRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

const SNIPPET = { id: "s1", trigger: "greeting", expansion: "Hello, world!" };

describe("GET /api/snippets", () => {
  it("returns empty array when no snippets exist", async () => {
    vi.mocked(readSnippets).mockResolvedValue([]);
    const res = await server.inject({ method: "GET", url: "/api/snippets" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ snippets: [] });
  });

  it("returns all snippets", async () => {
    vi.mocked(readSnippets).mockResolvedValue([SNIPPET]);
    const res = await server.inject({ method: "GET", url: "/api/snippets" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ snippets: [SNIPPET] });
  });
});

describe("POST /api/snippets", () => {
  it("creates a snippet and returns 201", async () => {
    vi.mocked(writeSnippet).mockResolvedValue(SNIPPET);
    const res = await server.inject({
      method: "POST",
      url: "/api/snippets",
      payload: { trigger: "greeting", expansion: "Hello, world!" },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ snippet: SNIPPET });
    expect(writeSnippet).toHaveBeenCalledWith({
      trigger: "greeting",
      expansion: "Hello, world!",
    });
  });

  it("returns 400 when trigger is missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/snippets",
      payload: { expansion: "Hello" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when expansion is missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/snippets",
      payload: { trigger: "greeting" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /api/snippets/:id", () => {
  it("updates and returns the snippet", async () => {
    vi.mocked(updateSnippet).mockResolvedValue(SNIPPET);
    const res = await server.inject({
      method: "PUT",
      url: "/api/snippets/s1",
      payload: { trigger: "greeting", expansion: "Hello, world!" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ snippet: SNIPPET });
  });

  it("returns 404 for non-existent ID", async () => {
    vi.mocked(updateSnippet).mockResolvedValue(null);
    const res = await server.inject({
      method: "PUT",
      url: "/api/snippets/missing",
      payload: { trigger: "greeting", expansion: "Hello" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when trigger is missing", async () => {
    const res = await server.inject({
      method: "PUT",
      url: "/api/snippets/s1",
      payload: { expansion: "Hello" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/snippets/:id", () => {
  it("returns 204 for existing snippet", async () => {
    vi.mocked(deleteSnippet).mockResolvedValue(true);
    const res = await server.inject({
      method: "DELETE",
      url: "/api/snippets/s1",
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 for non-existent ID", async () => {
    vi.mocked(deleteSnippet).mockResolvedValue(false);
    const res = await server.inject({
      method: "DELETE",
      url: "/api/snippets/missing",
    });
    expect(res.statusCode).toBe(404);
  });
});
