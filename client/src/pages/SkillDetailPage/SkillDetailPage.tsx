import { useState } from "react";
import {
  useParams,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Badge from "@cloudscape-design/components/badge";
import Select from "@cloudscape-design/components/select";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useSkillDetailQuery,
  useConfigQuery,
  revalidateConfig,
  revalidateSkillGraph,
  revalidateSkillDetail,
} from "../../hooks/queries";
import { patchConfig } from "../../utils/api";
import { buildUpdatedCategories } from "./utils";
import { CreateCategoryModal } from "./components/CreateCategoryModal";

const CREATE_NEW = "__create_new__";
const UNCATEGORIZED = "__uncategorized__";

export function SkillDetailPage() {
  const { skillName } = useParams<{ skillName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const project = searchParams.get("project") ?? undefined;
  const source = searchParams.get("source") ?? undefined;
  const { data, error, isLoading } = useSkillDetailQuery(skillName, {
    project,
    source,
  });
  const { data: configData } = useConfigQuery();
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      revalidateSkillDetail(skillName);
    }
  };

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

    // Remove skill from any existing category first
    const cleaned = buildUpdatedCategories(
      configData.config.skill_graph.categories,
      skillName,
      UNCATEGORIZED,
    );

    // Add the new category with the current skill auto-assigned
    cleaned[name] = {
      ...(color ? { color } : {}),
      skills: [skillName],
    };

    await patchConfig({ skill_graph: { categories: cleaned } });
    revalidateAll();
  };

  const referrer = (location.state as { from?: string } | null)?.from;
  const breadcrumbs = referrer
    ? [
        { text: "Sessions", href: "/" },
        { text: "Session", href: referrer },
        { text: skillName ?? "", href: "#" },
      ]
    : [
        { text: "Skills", href: "/skills" },
        { text: skillName ?? "", href: "#" },
      ];

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={breadcrumbs}
        onFollow={(event) => {
          event.preventDefault();
          navigate(event.detail.href);
        }}
      />
      {isLoading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error.message}</Box>}
      {!isLoading && !error && !data && (
        <Box color="text-status-error">Skill not found.</Box>
      )}
      {data && (
        <SpaceBetween size="m">
          <SpaceBetween size="xxs">
            <Header variant="h1">
              {String(data.frontmatter.name ?? skillName)}
            </Header>
            <Badge color={data.source === "global" ? "blue" : "grey"}>
              {data.source === "global" ? "Global" : "Workspace"}
            </Badge>
            {data.project && <Badge color="grey">{data.project}</Badge>}
            <Box color="text-body-secondary">
              {String(data.frontmatter.description ?? "")}
            </Box>
          </SpaceBetween>
          <Select
            selectedOption={
              categoryOptions.find((opt) => opt.value === selectedCategory) ??
              categoryOptions[0]
            }
            onChange={({ detail }) =>
              handleCategoryChange(detail.selectedOption.value ?? UNCATEGORIZED)
            }
            options={categoryOptions}
          />
          <Container>
            <div style={{ overflowX: "auto" }}>
              <Markdown remarkPlugins={[remarkGfm]}>{data.body}</Markdown>
            </div>
          </Container>
        </SpaceBetween>
      )}
      <CreateCategoryModal
        visible={showCreateModal}
        existingNames={categoryNames}
        onDismiss={() => setShowCreateModal(false)}
        onCreate={handleCreateCategory}
      />
    </SpaceBetween>
  );
}
