import fs from "node:fs/promises";
import path from "node:path";

interface SkillMeta {
  name: string;
  description: string;
}

interface FrontmatterResult {
  meta: SkillMeta;
  body: string;
}

function parseFrontmatter(content: string): FrontmatterResult {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized.startsWith("---\n")) {
    throw new Error("Frontmatter must start with '---'");
  }

  const endMarkerIndex = normalized.indexOf("\n---\n", 4);
  if (endMarkerIndex === -1) {
    throw new Error("Frontmatter must end with '---'");
  }

  const metaText = normalized.slice(4, endMarkerIndex);
  const bodyText = normalized.slice(endMarkerIndex + "\n---\n".length);
  const meta: SkillMeta = {
    name: "",
    description: "",
  };

  for (const rawLine of metaText.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }
    const key = line.slice(0, colonIndex).trim() as keyof SkillMeta;
    meta[key] = line.slice(colonIndex + 1).trim();
  }

  if (!meta.description) {
    throw new Error("Missing required 'description' in frontmatter");
  }

  return { meta, body: bodyText };
}

export class SkillLoader {
  private readonly skillsRoot: string;
  private readonly enabledSkills?: Set<string>;

  constructor(skillsRoot: string, enabledSkills?: string[]) {
    this.skillsRoot = skillsRoot;
    this.enabledSkills = enabledSkills?.length
      ? new Set(enabledSkills)
      : undefined;
  }

  async loadMetas(): Promise<Array<{ name: string; description: string }>> {
    const files = await this.scanFiles();
    const metas: Array<{ name: string; description: string }> = [];

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const { meta } = parseFrontmatter(content);
        meta.name ||= path.basename(path.dirname(filePath));
        metas.push({
          name: meta.name,
          description: meta.description,
        });
      } catch (error) {
        console.error(`Error reading skill ${filePath}:`, error);
      }
    }

    return metas;
  }

  async getContent(name: string): Promise<string> {
    if (this.enabledSkills && !this.enabledSkills.has(name)) {
      return `Error: Skill '${name}' is not enabled.`;
    }

    const filePath = path.join(this.skillsRoot, name, "SKILL.md");
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const { body } = parseFrontmatter(content);
      return `<skill name="${name}">\n${body}\n</skill>`;
    } catch {
      const all = await this.loadMetas();
      const available = all.map((skill) => skill.name).join(", ");
      return `Error: Unknown skill '${name}'. Available: ${available}`;
    }
  }

  async renderList(): Promise<string> {
    const metas = await this.loadMetas();
    if (metas.length === 0) {
      return "当前没有可用技能";
    }
    return metas
      .map((skill) => `- ${skill.name}: ${skill.description}`)
      .join("\n");
  }

  private async scanFiles(): Promise<string[]> {
    try {
      const dirs = await fs.readdir(this.skillsRoot, { withFileTypes: true });
      const files: string[] = [];

      for (const dir of dirs) {
        if (!dir.isDirectory()) {
          continue;
        }
        if (this.enabledSkills && !this.enabledSkills.has(dir.name)) {
          continue;
        }
        const filePath = path.join(this.skillsRoot, dir.name, "SKILL.md");
        try {
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            files.push(filePath);
          }
        } catch {
          // ignore invalid skill directory
        }
      }

      files.sort((a, b) => a.localeCompare(b));
      return files;
    } catch {
      return [];
    }
  }
}
