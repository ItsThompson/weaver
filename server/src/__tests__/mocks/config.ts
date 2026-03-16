import { DEFAULT_CONFIG } from "@weaver/shared/types";

vi.mock("../../services/config/index", () => ({
  readConfig: vi.fn().mockResolvedValue({
    config: { ...DEFAULT_CONFIG },
    warnings: [],
    fieldErrors: {},
  }),
  parseAndValidateConfig: vi.fn(),
  writeConfig: vi.fn(),
}));
