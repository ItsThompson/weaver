import "../../__tests__/mocks/services";

import { registerAdapter } from "@weaver/shared/adapter-registry";
import { kiroAdapter } from "@weaver/binding-kiro";
import Fastify from "fastify";
import { registerSkillRoutes } from "./skills";
import {
  buildSkillGraph,
  getSkillDetail,
} from "../../services/skill-graph/index";
import { readConfig } from "../../services/config/index";
import { DEFAULT_CONFIG } from "@weaver/shared/types";

registerAdapter(kiroAdapter);

vi.mock("../../services/config/index", () => ({
  readConfig: vi.fn(),
}));

let server: ReturnType<typeof Fastify>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(readConfig).mockResolvedValue({
    config: { ...DEFAULT_CONFIG },
    warnings: [],
  });
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
          id: "skill-a::my-app",
          name: "Skill A",
          skillName: "skill-a",
          description: "desc",
          category: "core",
          source: "workspace",
          project: "my-app",
        },
      ],
      edges: [{ from: "skill-a::my-app", to: "skill-b::global" }],
    });

    const res = await server.inject({ method: "GET", url: "/api/skills" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].skillName).toBe("skill-a");
    expect(body.nodes[0].project).toBe("my-app");
  });

  it("passes config skill_paths to buildSkillGraph", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      skill_paths: ["/projects/my-app/.kiro/skills"],
      skill_graph: { categories: { core: { skills: ["skill-a"] } } },
    };
    vi.mocked(readConfig).mockResolvedValue({ config, warnings: [] });
    vi.mocked(buildSkillGraph).mockResolvedValue({ nodes: [], edges: [] });

    await server.inject({ method: "GET", url: "/api/skills" });

    expect(buildSkillGraph).toHaveBeenCalledWith(
      expect.arrayContaining([
        { path: "/projects/my-app/.kiro/skills", source: "workspace" },
      ]),
      { core: { skills: ["skill-a"] } },
    );
  });
});

describe("GET /api/skills/:name", () => {
  it("returns 200 with project field for existing skill", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue({
      frontmatter: { name: "skill-a", description: "desc" },
      body: "# Skill A",
      source: "workspace",
      category: "core",
      project: "my-app",
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/skills/skill-a",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.project).toBe("my-app");
  });

  it("passes project query param to getSkillDetail", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue({
      frontmatter: {},
      body: "",
      source: "workspace",
      category: null,
      project: "my-app",
    });

    await server.inject({
      method: "GET",
      url: "/api/skills/skill-a?project=my-app",
    });

    expect(getSkillDetail).toHaveBeenCalledWith(
      "skill-a",
      [],
      expect.any(Object),
      "my-app",
      undefined,
    );
  });

  it("passes source=global query param to getSkillDetail", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue({
      frontmatter: {},
      body: "",
      source: "global",
      category: null,
      project: null,
    });

    await server.inject({
      method: "GET",
      url: "/api/skills/skill-a?source=global",
    });

    expect(getSkillDetail).toHaveBeenCalledWith(
      "skill-a",
      [],
      expect.any(Object),
      undefined,
      "global",
    );
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
});
