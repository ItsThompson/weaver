import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group";
import { ActivityIndicator } from "../../components/ActivityIndicator";
import { SessionActions } from "./components/SessionActions";
import { TurnContainer } from "./components/TurnContainer";
import { SkillTags } from "./components/SkillTags";
import { useSessionDetailPage } from "./hooks/useSessionDetailPage";

export function SessionDetailPage() {
  const { state, actions } = useSessionDetailPage();

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: "Sessions", href: "/" },
          { text: state.displayName, href: "#" },
        ]}
        onFollow={(e) => {
          e.preventDefault();
          actions.navigate(e.detail.href);
        }}
      />
      {state.isLoading && <Spinner size="large" />}
      {state.error && (
        <Box color="text-status-error">{state.error.message}</Box>
      )}
      {!state.isLoading && !state.error && state.session && (
        <SpaceBetween size="m">
          <Header
            variant="h1"
            description={
              <SpaceBetween direction="horizontal" size="xs">
                <span>
                  {state.session.cwd} · PID {state.session.pid}
                </span>
                <Badge
                  color={state.session.status === "open" ? "green" : "grey"}
                >
                  {state.session.status}
                </Badge>
                {state.session.status === "open" && (
                  <ActivityIndicator activity={state.session.activity} />
                )}
              </SpaceBetween>
            }
            actions={
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "nowrap",
                }}
              >
                <Button
                  iconName="refresh"
                  onClick={() => actions.refresh()}
                  loading={state.isLoading}
                />
                <SessionActions
                  showTools={state.showTools}
                  onToggleTools={actions.togglePageTools}
                  currentName={state.session.customName}
                  sessionPid={state.session.pid}
                  onRename={actions.handleRename}
                  webhookEnabled={state.webhookEnabled}
                  onToggleWebhook={actions.handleToggleWebhook}
                />
              </div>
            }
          >
            {state.displayName}
          </Header>
          <SkillTags
            activeSkills={state.activeSkills}
            configuredSkills={state.configuredSkills}
          />
          <Box fontSize="body-s" color="text-body-secondary">
            Assistant responses are not available in this view. Use{" "}
            <a href="/cherrypick">Cherrypick</a> to export and analyze full
            conversations.
          </Box>
          {[...state.turns].reverse().map((turn) => (
            <TurnContainer
              key={turn.id}
              turn={turn}
              showTools={
                state.expandedTurns.has(turn.id)
                  ? !state.showTools
                  : state.showTools
              }
              onToggleTools={
                turn.toolCalls.length > 0
                  ? () => actions.toggleTurn(turn.id)
                  : undefined
              }
            />
          ))}
        </SpaceBetween>
      )}
    </SpaceBetween>
  );
}
