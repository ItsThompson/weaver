import { useParams, useNavigate, useLocation } from "react-router-dom";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSkillDetailQuery } from "../../hooks/queries";

export function SkillDetailPage() {
  const { skillName } = useParams<{ skillName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, isLoading } = useSkillDetailQuery(skillName);

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
        onFollow={(e) => {
          e.preventDefault();
          navigate(e.detail.href);
        }}
      />
      {isLoading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error.message}</Box>}
      {!isLoading && !error && !data && (
        <Box color="text-status-error">Skill not found.</Box>
      )}
      {data && (
        <SpaceBetween size="m">
          <Header
            variant="h1"
            description={String(data.frontmatter.description ?? "")}
          >
            {String(data.frontmatter.name ?? skillName)}
          </Header>
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
