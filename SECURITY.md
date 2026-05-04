# Security Policy

OpenExam will handle authentication, AI provider keys, uploaded materials, and user-generated study data. Treat those areas as sensitive from the start.

## Supported Versions

The project has not shipped a release yet. Security fixes should target the default branch until versioned releases exist.

## Reporting a Vulnerability

Do not publish working exploits, real API keys, uploaded materials, private question banks, or user data in public issues.

Until a private advisory channel is published, contact the maintainers through the safest available project channel with:

- A concise description of the issue.
- Reproduction steps or affected files.
- Expected impact.
- Suggested fix, if known.

## Security Expectations

- Never commit `.env*` files or local database dumps.
- Encrypt BYOK provider keys at rest.
- Validate uploaded file types and sizes before processing.
- Keep AI prompts and logs free of unnecessary secrets.
- Preserve source and licensing metadata for imported questions and materials.
