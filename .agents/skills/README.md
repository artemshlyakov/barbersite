# Project design skills

Codex discovers these repository-local skills from `.agents/skills/` after opening a new session in this repository. Skill guidance is advisory; the owner's current requirements and confirmed project facts take precedence.

| Invoke with | Source | Pinned commit | Runtime |
| --- | --- | --- | --- |
| `$frontend-design` | [Anthropic Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | `1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064` | Markdown only |
| `$ui-ux-pro-max` | [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `d643997c82e94742dd3bee43210b0198e8bbba3d` | Python 3 for optional local search |
| `$design-taste-frontend` | [Taste Skill](https://github.com/Leonxlnx/taste-skill) | `f6b76575f949707b4e3c37cd86cb44b0b98643e8` | Node 22+ and Chrome/Chromium for optional tools; ffmpeg optional |

The upstream skill directories, supporting resources, and licenses are vendored here. The UI/UX Pro Max instructions use the repository-local search path instead of Claude's plugin root. No installation scripts or project dependencies are required to read the skills; run any optional skill scripts only after reviewing them for the specific task.
