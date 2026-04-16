import "../../__tests__/mocks/fs";
import "../../__tests__/mocks/logger";

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolveConfiguredSkills } from "./resolve-configured";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveConfiguredSkills", () => {
  describe("default agent (agentName = null)", () => {
    it("lists skills from provided search paths", async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        return (
          path === "/project/.kiro/skills" ||
          path === `${homedir()}/.kiro/skills` ||
          path === "/project/.kiro/skills/skill-a/SKILL.md" ||
          path === `${homedir()}/.kiro/skills/skill-b/SKILL.md`
        );
      });

      vi.mocked(readdir).mockImplementation(async (dirPath) => {
        const path = String(dirPath);
        if (path === "/project/.kiro/skills") {
          return [{ name: "skill-a", isDirectory: () => true }] as any;
        }
        if (path === `${homedir()}/.kiro/skills`) {
          return [{ name: "skill-b", isDirectory: () => true }] as any;
        }
        return [];
      });

      const result = await resolveConfiguredSkills(null, [
        "/project/.kiro/skills",
        `${homedir()}/.kiro/skills`,
      ]);
      expect(result).toEqual(["skill-a", "skill-b"]);
    });

    it("deduplicates skills present in both locations", async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        return (
          path === "/project/.kiro/skills" ||
          path === `${homedir()}/.kiro/skills` ||
          path === "/project/.kiro/skills/shared-skill/SKILL.md" ||
          path === `${homedir()}/.kiro/skills/shared-skill/SKILL.md`
        );
      });

      vi.mocked(readdir).mockImplementation(async (dirPath) => {
        const path = String(dirPath);
        if (
          path === "/project/.kiro/skills" ||
          path === `${homedir()}/.kiro/skills`
        ) {
          return [{ name: "shared-skill", isDirectory: () => true }] as any;
        }
        return [];
      });

      const result = await resolveConfiguredSkills(null, [
        "/project/.kiro/skills",
        `${homedir()}/.kiro/skills`,
      ]);
      expect(result).toEqual(["shared-skill"]);
    });

    it("returns empty when skill directories do not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const result = await resolveConfiguredSkills(null, [
        "/project/.kiro/skills",
      ]);
      expect(result).toEqual([]);
    });

    it("skips entries without SKILL.md", async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        return (
          path === "/project/.kiro/skills" ||
          path === `${homedir()}/.kiro/skills`
        );
      });

      vi.mocked(readdir).mockImplementation(async (dirPath) => {
        const path = String(dirPath);
        if (path === "/project/.kiro/skills") {
          return [{ name: "no-skill-file", isDirectory: () => true }] as any;
        }
        return [];
      });

      const result = await resolveConfiguredSkills(null, [
        "/project/.kiro/skills",
        `${homedir()}/.kiro/skills`,
      ]);
      expect(result).toEqual([]);
    });
  });

  describe("custom agent", () => {
    const mockLoadConfig = vi.fn();

    it("resolves skill:// URIs from agent config", async () => {
      const agentConfig = {
        name: "dev",
        resources: ["skill://~/.config/amazonq/global/skills/*/SKILL.md"],
      };
      mockLoadConfig.mockResolvedValue(agentConfig);

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        return (
          path === `${homedir()}/.config/amazonq/global/skills` ||
          path ===
            `${homedir()}/.config/amazonq/global/skills/coding-practices/SKILL.md` ||
          path === `${homedir()}/.config/amazonq/global/skills/testing/SKILL.md`
        );
      });

      vi.mocked(readdir).mockImplementation(async (dirPath) => {
        const path = String(dirPath);
        if (path === `${homedir()}/.config/amazonq/global/skills`) {
          return [
            { name: "coding-practices", isDirectory: () => true },
            { name: "testing", isDirectory: () => true },
          ] as any;
        }
        return [];
      });

      const result = await resolveConfiguredSkills(
        "dev",
        [],
        mockLoadConfig,
        "/project",
      );
      expect(result).toEqual(["coding-practices", "testing"]);
    });

    it("resolves relative skill:// URIs against cwd", async () => {
      const agentConfig = {
        name: "dev",
        resources: ["skill://.kiro/skills/*/SKILL.md"],
      };
      mockLoadConfig.mockResolvedValue(agentConfig);

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        return (
          path === "/project/.kiro/skills" ||
          path === "/project/.kiro/skills/local-skill/SKILL.md"
        );
      });

      vi.mocked(readdir).mockImplementation(async (dirPath) => {
        const path = String(dirPath);
        if (path === "/project/.kiro/skills") {
          return [{ name: "local-skill", isDirectory: () => true }] as any;
        }
        return [];
      });

      const result = await resolveConfiguredSkills(
        "dev",
        [],
        mockLoadConfig,
        "/project",
      );
      expect(result).toEqual(["local-skill"]);
    });

    it("returns empty when agent config not found", async () => {
      mockLoadConfig.mockResolvedValue(null);
      const result = await resolveConfiguredSkills(
        "missing-agent",
        [],
        mockLoadConfig,
        "/project",
      );
      expect(result).toEqual([]);
    });

    it("returns empty when agent config has no resources", async () => {
      mockLoadConfig.mockResolvedValue({ name: "dev" });
      const result = await resolveConfiguredSkills(
        "dev",
        [],
        mockLoadConfig,
        "/project",
      );
      expect(result).toEqual([]);
    });

    it("ignores non-skill:// resources", async () => {
      const agentConfig = {
        name: "dev",
        resources: ["file://some/path", "skill://~/.kiro/skills/*/SKILL.md"],
      };
      mockLoadConfig.mockResolvedValue(agentConfig);

      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        return (
          path === `${homedir()}/.kiro/skills` ||
          path === `${homedir()}/.kiro/skills/my-skill/SKILL.md`
        );
      });

      vi.mocked(readdir).mockImplementation(async (dirPath) => {
        if (String(dirPath) === `${homedir()}/.kiro/skills`) {
          return [{ name: "my-skill", isDirectory: () => true }] as any;
        }
        return [];
      });

      const result = await resolveConfiguredSkills(
        "dev",
        [],
        mockLoadConfig,
        "/project",
      );
      expect(result).toEqual(["my-skill"]);
    });

    it("returns empty when no loadAgentConfig provided", async () => {
      const result = await resolveConfiguredSkills("dev", []);
      expect(result).toEqual([]);
    });
  });
});
