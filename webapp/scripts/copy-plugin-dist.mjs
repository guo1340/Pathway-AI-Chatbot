import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webappDir = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(webappDir, "dist");
const targetDir = join(webappDir, "..", "plugin", "dist");

mkdirSync(targetDir, { recursive: true });
for (const entry of readdirSync(sourceDir)) {
  cpSync(join(sourceDir, entry), join(targetDir, entry), {
    recursive: true,
    force: true,
  });
}
