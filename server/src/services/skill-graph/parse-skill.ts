import matter from "gray-matter";

export function parseSkillFile(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const { data, content: body } = matter(content);
  return { frontmatter: data, body };
}
