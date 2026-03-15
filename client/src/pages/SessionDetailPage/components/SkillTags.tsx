import SpaceBetween from "@cloudscape-design/components/space-between";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import ExpandableSection from "@cloudscape-design/components/expandable-section";

interface SkillTagsProps {
  activeSkills: string[];
  configuredSkills: string[];
}

export function SkillTags({ activeSkills, configuredSkills }: SkillTagsProps) {
  if (activeSkills.length === 0 && configuredSkills.length === 0) {
    return null;
  }

  return (
    <SpaceBetween size="xs">
      <Box>
        <Box fontSize="body-s" fontWeight="bold" color="text-label">
          Active Skills
        </Box>
        {activeSkills.length > 0 ? (
          <SpaceBetween direction="horizontal" size="xs">
            {activeSkills.map((skill) => (
              <Badge key={skill} color="blue">
                {skill}
              </Badge>
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
              <Badge key={skill} color="grey">
                {skill}
              </Badge>
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
