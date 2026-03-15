vi.mock("../../services/skill-graph/index", () => ({
  buildSkillGraph: vi.fn(),
  getSkillDetail: vi.fn(),
}));

vi.mock("../../utils/logger", () => ({
  log: vi.fn(),
}));

import Fastify from "fastify";
import { registerSkillRoutes } from "./skills";
import {
  buildSkillGraph,
  getSkillDetail,
} from "../../services/skill-graph/index";
import type { SkillCategory } from "@weaver/shared/types";

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
          name: "skill-a",
          description: "desc",
          category: "core" as SkillCategory,
          source: "workspace",
        },
      ],
      edges: [{ from: "skill-a", to: "skill-b" }],
    });

    const res = await server.inject({ method: "GET", url: "/api/skills" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("nodes");
    expect(body).toHaveProperty("edges");
    expect(body.nodes).toHaveLength(1);
    expect(body.edges).toHaveLength(1);
  });
});

describe("GET /api/skills/:name", () => {
  it("returns 200 with frontmatter and body for existing skill", async () => {
    vi.mocked(getSkillDetail).mockResolvedValue({
      frontmatter: { name: "skill-a", description: "desc" },
      body: "# Skill A",
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/skills/skill-a",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.frontmatter).toEqual({ name: "skill-a", description: "desc" });
    expect(body.body).toBe("# Skill A");
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
