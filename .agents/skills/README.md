# Project design skills

Codex discovers these repository-local skills from `.agents/skills/` after opening a new session in this repository. Use these skills freely for design, implementation, research, and review. Their recommendations are advisory; choose what fits the current owner request and confirmed project facts.

| Invoke with | Source | Pinned commit | Runtime |
| --- | --- | --- | --- |
| `$frontend-design` | [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | `1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064` | Markdown only |
| `$ui-ux-pro-max` | [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `d643997c82e94742dd3bee43210b0198e8bbba3d` | Python 3 for optional local search |
| `$design-taste-frontend` | [Taste Skill](https://github.com/Leonxlnx/taste-skill) | `f6b76575f949707b4e3c37cd86cb44b0b98643e8` | Node 22+ and Chrome/Chromium for optional tools; ffmpeg optional |
| `$web-design-guidelines` | [Vercel Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | Fetches [current guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) during each review |

The upstream skill directories, supporting resources, and licenses are vendored here. The UI/UX Pro Max instructions use the repository-local search path instead of Claude's plugin root. No installation scripts or project dependencies are required to read the skills. Their optional tools may be used whenever helpful; check runtime prerequisites and expected file changes before running them. No skill-specific gate is required to complete ordinary project work.
