import SpaceBetween from "@cloudscape-design/components/space-between";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import { Link, useLocation } from "react-router-dom";

interface SkillTagsProps {
  activeSkills: string[];
  configuredSkills: string[];
}

export function SkillTags({ activeSkills, configuredSkills }: SkillTagsProps) {
  const location = useLocation();

  if (activeSkills.length === 0 && configuredSkills.length === 0) {
    return null;
  }

  const linkState = { from: location.pathname };

  return (
    <SpaceBetween size="xs">
      <Box>
        <Box fontSize="body-s" fontWeight="bold" color="text-label">
          Active Skills
        </Box>
        {activeSkills.length > 0 ? (
          <SpaceBetween direction="horizontal" size="xs">
            {activeSkills.map((skill) => (
              <Link
                key={skill}
                to={`/skills/${skill}`}
                state={linkState}
                style={{ textDecoration: "none" }}
              >
                <Badge color="blue">{skill}</Badge>
              </Link>
            ))}
          </SpaceBetween>
        ) : (
          <Box fontSize="body-s" color="text-status-inactive">
            No skills loaded
          </Box>
        )}
      </Box>
      {configuredSkills.length > 0 && (
        <ExpandableSection
          variant="footer"
          headerText={`Available Skills (${configuredSkills.length})`}
          defaultExpanded={false}
        >
          <SpaceBetween direction="horizontal" size="xs">
            {configuredSkills.map((skill) => (
              <Link
                key={skill}
                to={`/skills/${skill}`}
                state={linkState}
                style={{ textDecoration: "none" }}
              >
                <Badge color="grey">{skill}</Badge>
              </Link>
            ))}
          </SpaceBetween>
        </ExpandableSection>
      )}
      <Box fontSize="body-s" color="text-body-secondary">
        Active skills are cumulative across the entire session and may include
        skills from tangent branches.
      </Box>
    </SpaceBetween>
  );
}
