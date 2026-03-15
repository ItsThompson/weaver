import SpaceBetween from "@cloudscape-design/components/space-between";
import Header from "@cloudscape-design/components/header";
import Badge from "@cloudscape-design/components/badge";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Select, { type SelectProps } from "@cloudscape-design/components/select";
import type { OrphanGroup } from "@weaver/shared/types";
import { TurnContainer } from "../../SessionDetailPage/components/TurnContainer";
import type { DeleteTarget } from "../hooks/useOrphansPage";

interface OrphanGroupCardProps {
  group: OrphanGroup;
  sessionOptions: SelectProps.Options;
  selectedOption: SelectProps.Option | null;
  assigning: boolean;
  onSelectSession: (pid: number, option: SelectProps.Option) => void;
  onAssign: (pid: number) => void;
  onDelete: (target: DeleteTarget) => void;
}

export function OrphanGroupCard({
  group,
  sessionOptions,
  selectedOption,
  assigning,
  onSelectSession,
  onAssign,
  onDelete,
}: OrphanGroupCardProps) {
  return (
    <Container
      header={
        <Header
          variant="h2"
          counter={`${group.eventCount} events`}
          description={`${new Date(group.timeRange.start).toLocaleString()} — ${new Date(group.timeRange.end).toLocaleString()}`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Select
                selectedOption={selectedOption}
                onChange={({ detail }) =>
                  onSelectSession(group.pid, detail.selectedOption)
                }
                options={sessionOptions}
                placeholder="Select target session"
                filteringType="auto"
              />
              <Button
                variant="normal"
                onClick={() =>
                  onDelete({
                    pid: group.pid,
                    eventCount: group.eventCount,
                  })
                }
                style={{
                  root: {
                    color: {
                      default: "#d91515",
                      hover: "#b80000",
                      active: "#a10000",
                    },
                    borderColor: {
                      default: "#d91515",
                      hover: "#b80000",
                      active: "#a10000",
                    },
                  },
                }}
              >
                Delete
              </Button>
              <Button
                variant="primary"
                onClick={() => onAssign(group.pid)}
                disabled={!selectedOption}
                loading={assigning}
              >
                Assign
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween direction="horizontal" size="xs">
            <span>PID {group.pid}</span>
            <Badge color="red">orphaned</Badge>
          </SpaceBetween>
        </Header>
      }
    >
      <SpaceBetween size="m">
        {group.turns.map((turn) => (
          <TurnContainer key={turn.id} turn={turn} showTools />
        ))}
      </SpaceBetween>
    </Container>
  );
}
