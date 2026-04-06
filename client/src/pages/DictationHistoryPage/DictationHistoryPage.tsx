import { useNavigate } from "react-router-dom";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import { useDictationHistoryQuery } from "../../hooks/queries";
import { DictationHistoryCard } from "./components/DictationHistoryCard";

export function DictationHistoryPage() {
  const navigate = useNavigate();
  const { data, error, isLoading } = useDictationHistoryQuery();
  const entries = data?.entries ?? [];

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: "Dictation", href: "/dictation" },
          { text: "Dictation History", href: "/dictation/history" },
        ]}
        onFollow={(event) => {
          event.preventDefault();
          navigate(event.detail.href);
        }}
      />
      <Header variant="h1">Dictation History</Header>
      {isLoading && <Spinner size="large" />}
      {error && <Box color="text-status-error">{error.message}</Box>}
      {!isLoading && !error && entries.length === 0 && (
        <Box color="text-status-inactive" textAlign="center" padding="l">
          No dictation history yet. Completed dictations will appear here.
        </Box>
      )}
      {entries.map((entry, index) => (
        <DictationHistoryCard key={index} entry={entry} />
      ))}
    </SpaceBetween>
  );
}
