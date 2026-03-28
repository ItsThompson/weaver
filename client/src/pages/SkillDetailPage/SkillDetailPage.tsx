import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Badge from "@cloudscape-design/components/badge";
import Select from "@cloudscape-design/components/select";
import Alert from "@cloudscape-design/components/alert";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CreateCategoryModal } from "./components/CreateCategoryModal";
import { useSkillDetailPage, UNCATEGORIZED } from "./hooks/useSkillDetailPage";

export function SkillDetailPage() {
  const { state, actions } = useSkillDetailPage();
  const {
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
  } = state;

  if (redirecting) {
    return null;
  }

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={breadcrumbs}
        onFollow={(event) => {
          event.preventDefault();
          actions.navigate(event.detail.href);
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
            <SpaceBetween direction="horizontal" size="xs">
              <Badge color={data.source === "global" ? "blue" : "grey"}>
                {data.source === "global" ? "Global" : "Workspace"}
              </Badge>
              {data.project && <Badge color="grey">{data.project}</Badge>}
            </SpaceBetween>
            <Box color="text-body-secondary">
              {String(data.frontmatter.description ?? "")}
            </Box>
          </SpaceBetween>
          {hasNameCollision && (
            <Alert type="info">
              This category applies to all skills named '{skillName}' across
              projects.
            </Alert>
          )}
          <Select
            selectedOption={
              categoryOptions.find((opt) => opt.value === selectedCategory) ??
              categoryOptions[0]
            }
            onChange={({ detail }) =>
              actions.handleCategoryChange(
                detail.selectedOption.value ?? UNCATEGORIZED,
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
      <CreateCategoryModal
        visible={showCreateModal}
        existingNames={categoryNames}
        onDismiss={() => actions.setShowCreateModal(false)}
        onCreate={actions.handleCreateCategory}
      />
    </SpaceBetween>
  );
}
