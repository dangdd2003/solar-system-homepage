# Đ-Dev's Homepage

- My personal portfolio, built as an interactive 3D solar system.

- Live at: [www.dangdd.dev](https://www.dangdd.dev)

## Tech stack

| Tech                                                                                           | Description                 |
| ---------------------------------------------------------------------------------------------- | --------------------------- |
| Astro <img src="https://cdn.simpleicons.org/astro" height="16" alt="" />                       | Static site framework       |
| TypeScript <img src="https://cdn.simpleicons.org/typescript" height="16" alt="" />             | Language                    |
| three.js <img src="https://cdn.simpleicons.org/threedotjs/000000/ffffff" height="16" alt="" /> | 3D solar system rendering   |
| GLSL <img src="https://cdn.simpleicons.org/opengl" height="16" alt="" />                       | Custom shaders              |
| Anime.js <img src="https://cdn.simpleicons.org/animedotjs/000000/ffffff" height="16" alt="" /> | Intro and reveal animations |
| Docker <img src="https://cdn.simpleicons.org/docker" height="16" alt="" />                     | Container deployment        |
| GitHub Actions <img src="https://cdn.simpleicons.org/githubactions" height="16" alt="" />      | CI/CD                       |

## Development

Requires Node.js 22.23.4+.

```bash
npm install
npm run dev
```

## Deployment

### Node.js

```bash
npm ci
npm run build
npm start
```

Live on port 4321

### Docker

```bash
docker compose -f .github/deployment/compose.yaml up --build
```

Live on port 8080

## Credits

- Planet textures: [public/textures/CREDITS.md](public/textures/CREDITS.md)
