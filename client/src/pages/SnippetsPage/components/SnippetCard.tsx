import { useState } from "react";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Box from "@cloudscape-design/components/box";
import type { SnippetCardProps } from "../types";

export function SnippetCard({ snippet, onEdit, onDelete }: SnippetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = snippet.expansion.split("\n");
  const truncated = lines.length > 3 && !expanded;
  const displayText = truncated
    ? lines.slice(0, 3).join("\n") + "…"
    : snippet.expansion;

  return (
    <Container>
      <SpaceBetween size="xs">
        <SpaceBetween size="xs" direction="horizontal">
          <Box variant="h4">{snippet.trigger}</Box>
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => onEdit(snippet)}>
                Edit
              </Button>
              <Button variant="link" onClick={() => onDelete(snippet)}>
                Delete
              </Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
        <Box variant="p" color="text-body-secondary">
          <pre
            style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}
          >
            {displayText}
          </pre>
        </Box>
        {lines.length > 3 && (
          <Button variant="link" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : "Show more"}
          </Button>
        )}
      </SpaceBetween>
    </Container>
  );
}
