import { useParams, useNavigate, useLocation } from "react-router-dom";
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

export function SkillDetailPage() {
  const { skillName } = useParams<{ skillName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, isLoading } = useSkillDetailQuery(skillName);
  const { data: configData } = useConfigQuery();

  const categories = configData?.config.skill_graph?.categories ?? {};
  const categoryOptions = [
    { label: "Uncategorized", value: "__uncategorized__" },
    ...Object.keys(categories).map((name) => ({ label: name, value: name })),
  ];

  const selectedCategory = data?.category ?? "__uncategorized__";

  const handleCategoryChange = async (newValue: string) => {
    if (!skillName || !configData) {
      return;
    }

    const oldCategories = configData.config.skill_graph.categories;
    const updatedCategories = Object.entries(oldCategories).reduce<
      Record<string, { color?: string; skills: string[] }>
    >((acc, [name, entry]) => {
      acc[name] = {
        ...(entry.color ? { color: entry.color } : {}),
        skills: entry.skills.filter((skill) => skill !== skillName),
      };
      return acc;
    }, {});

    if (newValue !== "__uncategorized__" && updatedCategories[newValue]) {
      updatedCategories[newValue] = {
        ...updatedCategories[newValue],
        skills: [...updatedCategories[newValue].skills, skillName],
      };
    }

    await patchConfig({ skill_graph: { categories: updatedCategories } });
    revalidateConfig();
    revalidateSkillGraph();
    revalidateSkillDetail(skillName);
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
              handleCategoryChange(
                detail.selectedOption.value ?? "__uncategorized__",
              )
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
    </SpaceBetween>
  );
}
