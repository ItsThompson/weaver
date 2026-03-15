vi.mock("../../services/skill-resolver/kiro-paths", () => ({
  kiroSearchPaths: vi.fn(),
}));

vi.mock("../../services/skill-resolver/list-skill-dirs", () => ({
  listSkillDirNames: vi.fn(),
}));
