import { useState, useEffect } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import type { SkillDetail } from "@weaver/shared/types";
import {
  useSkillDetailQuery,
  useSkillGraphQuery,
  useConfigQuery,
  revalidateConfig,
  revalidateSkillGraph,
  revalidateSkillDetail,
} from "../../../hooks/queries";
import { patchConfig } from "../../../utils/api";
import { buildUpdatedCategories } from "../utils";

function buildQueryString(
  project: string | undefined,
  source: string | undefined,
): string {
  if (project) {
    return `?project=${encodeURIComponent(project)}`;
  }
  if (source) {
    return `?source=${encodeURIComponent(source)}`;
  }
  return "";
}

const CREATE_NEW = "__create_new__";
export const UNCATEGORIZED = "__uncategorized__";

export interface SkillDetailState {
  skillName: string | undefined;
  isLoading: boolean;
  error: Error | undefined;
  data: SkillDetail | undefined;
  hasNameCollision: boolean;
  categoryOptions: Array<{ label: string; value: string }>;
  categoryNames: string[];
  selectedCategory: string;
  showCreateModal: boolean;
  breadcrumbs: Array<{ text: string; href: string }>;
  redirecting: boolean;
}

export interface SkillDetailActions {
  handleCategoryChange: (newValue: string) => Promise<void>;
  handleCreateCategory: (name: string, color?: string) => Promise<void>;
  openCreateModal: () => void;
  dismissCreateModal: () => void;
  navigate: (href: string) => void;
}

export function useSkillDetailPage(): {
  state: SkillDetailState;
  actions: SkillDetailActions;
} {
  const { skillName } = useParams<{ skillName: string }>();
  const [searchParams] = useSearchParams();
  const project = searchParams.get("project") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const nav = useNavigate();
  const location = useLocation();
  const { data, error, isLoading } = useSkillDetailQuery(
    skillName,
    project,
    source,
  );
  const { data: configData } = useConfigQuery();
  const { data: skillGraph } = useSkillGraphQuery();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const hasNameCollision = skillGraph
    ? skillGraph.nodes.filter((node) => node.skillName === skillName).length > 1
    : false;

  const categories = configData?.config.skill_graph?.categories ?? {};
  const categoryNames = Object.keys(categories);
  const categoryOptions = [
    { label: "Uncategorized", value: UNCATEGORIZED },
    ...categoryNames.map((name) => ({ label: name, value: name })),
    { label: "+ Create new category", value: CREATE_NEW },
  ];

  const selectedCategory = data?.category ?? UNCATEGORIZED;

  const revalidateAll = () => {
    revalidateConfig();
    revalidateSkillGraph();
    if (skillName) {
      revalidateSkillDetail(skillName, project, source);
    }
  };

  const redirecting = !!error?.message?.includes("not found");

  useEffect(() => {
    if (redirecting) {
      nav("/skills", { replace: true });
    }
  }, [redirecting, nav]);

  const handleCategoryChange = async (newValue: string) => {
    if (newValue === CREATE_NEW) {
      setShowCreateModal(true);
      return;
    }

    if (!skillName || !configData) {
      return;
    }

    const updatedCategories = buildUpdatedCategories(
      configData.config.skill_graph.categories,
      skillName,
      newValue,
    );

    await patchConfig({ skill_graph: { categories: updatedCategories } });
    revalidateAll();
  };

  const handleCreateCategory = async (name: string, color?: string) => {
    if (!skillName || !configData) {
      return;
    }

    const cleaned = buildUpdatedCategories(
      configData.config.skill_graph.categories,
      skillName,
      UNCATEGORIZED,
    );

    cleaned[name] = {
      ...(color ? { color } : {}),
      skills: [skillName],
    };

    await patchConfig({ skill_graph: { categories: cleaned } });
    revalidateAll();
  };

  const referrer = (location.state as { from?: string } | null)?.from;
  const queryString = buildQueryString(project, source);
  const breadcrumbs = referrer
    ? [
        { text: "Sessions", href: "/" },
        { text: "Session", href: referrer },
        { text: skillName ?? "", href: `#${queryString}` },
      ]
    : [
        { text: "Skills", href: "/skills" },
        { text: skillName ?? "", href: `#${queryString}` },
      ];

  return {
    state: {
      skillName,
      isLoading,
      error,
      data,
      hasNameCollision,
      categoryOptions,
      categoryNames,
      selectedCategory,
      showCreateModal,
      breadcrumbs,
      redirecting,
    },
    actions: {
      handleCategoryChange,
      handleCreateCategory,
      openCreateModal: () => setShowCreateModal(true),
      dismissCreateModal: () => setShowCreateModal(false),
      navigate: nav,
    },
  };
}
