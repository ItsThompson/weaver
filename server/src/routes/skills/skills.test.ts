import "../../__tests__/mocks/services";

import Fastify from "fastify";
import { registerSkillRoutes } from "./skills";
import {
  buildSkillGraph,
  getSkillDetail,
} from "../../services/skill-graph/index";

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  server = Fastify();
  registerSkillRoutes(server);
  await server.ready();
});

afterEach(() => server.close());

describe("GET /api/skills", () => {
  it("returns 200 with nodes and edges", async () => {
    vi.mocked(buildSkillGraph).mockResolvedValue({
      nodes: [
        {
          id: "skill-a",
          name: "Skill A",
          description: "desc",
          category: "core",
          source: "workspace",
          project: "my-app",
          variants: [{ source: "workspace", project: "my-app" }],
        },
      ],
      edges: [{ from: "skill-a", to: "skill-b" }],
    });

    const res = await server.inject({ method: "GET", url: "/api/skills" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.nodes).toHaveLength(1);
    expect(body.edges).toHaveLength(1);
  });

  it("calls buildSkillGraph with no arguments", async () => {
    vi.mocked(buildSkillGraph).mockResolvedValue({ nodes: [], edges: [] });

    await server.inject({ method: "GET", url: "/api/skills" });

    expect(buildSkillGraph).toHaveBeenCalledWith();
  });
});

describe("GET /api/skills/:name", () => {
  it("returns 200 with frontmatter, body, category, and project", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue({
      frontmatter: { name: "skill-a", description: "desc" },
      body: "# Skill A",
      source: "global",
      category: "core",
      project: null,
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/skills/skill-a",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.frontmatter).toEqual({ name: "skill-a", description: "desc" });
    expect(body.body).toBe("# Skill A");
    expect(body.category).toBe("core");
    expect(body.project).toBeNull();
  });

  it("returns 404 for nonexistent skill", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue(null);

    const res = await server.inject({
      method: "GET",
      url: "/api/skills/nonexistent",
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Skill not found" });
  });

  it("passes project query param to getSkillDetail", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue(null);

    await server.inject({
      method: "GET",
      url: "/api/skills/skill-a?project=my-app",
    });

    expect(getSkillDetail).toHaveBeenCalledWith("skill-a", {
      project: "my-app",
      source: undefined,
    });
  });

  it("passes source query param to getSkillDetail", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue(null);

    await server.inject({
      method: "GET",
      url: "/api/skills/skill-a?source=global",
    });

    expect(getSkillDetail).toHaveBeenCalledWith("skill-a", {
      project: undefined,
      source: "global",
    });
  });

  it("calls getSkillDetail with undefined options when no query params", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue(null);

    await server.inject({
      method: "GET",
      url: "/api/skills/skill-a",
    });

    expect(getSkillDetail).toHaveBeenCalledWith("skill-a", undefined);
  });
});
