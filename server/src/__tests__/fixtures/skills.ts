export const SKILL_A_CONTENT = `---
name: Skill A
description: Skill A description
---
Body of skill A with \`skill-b\` reference.`;

export const SKILL_B_CONTENT = `---
name: skill-b
description: Skill B description
---
Body of skill B.`;

export const SKILL_NUMERIC_NAME_CONTENT = `---
name: 42
description: bad name
---
Body.`;

export const SKILL_BASIC_CONTENT = `---
name: skill-a
description: Skill A description
---
Body of skill A.`;

export const SKILL_VALID_CONTENT = `---
name: my-skill
description: A test skill
---
# Body content

Some markdown here.`;

export const SKILL_EXTRA_FIELDS_CONTENT = `---
name: my-skill
description: desc
version: 2
tags:
  - foo
  - bar
---
Body`;
