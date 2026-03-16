vi.mock("../../hooks/queries", () => ({
  useSkillGraphQuery: vi.fn().mockReturnValue({
    data: {
      nodes: [
        { name: "coding-practices" },
        { name: "typescript-standards" },
        { name: "backend-coding-practices" },
      ],
      edges: [],
    },
  }),
  useConfigQuery: vi.fn().mockReturnValue({ data: undefined }),
  useSkillDetailQuery: vi.fn().mockReturnValue({ data: undefined }),
}));
