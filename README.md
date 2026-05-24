# TalentFlow - AI Recruitment Platform

A Next.js 16 + React 19 + TypeScript + Tailwind CSS prototype for an AI-powered resume processing and candidate ranking system.

## Features

- **Auth Page** - Sign In / Sign Up with animated background blobs
- **Dashboard** - Stats cards, mini pipeline preview, activity feed
- **Upload** - Drag & drop PDF upload, job description input, weight sliders
- **Pipeline** - 6-agent horizontal pipeline with glowing arrows, live progress, handoff animations
- **Candidates** - Ranked grid with score rings, filtering, candidate detail sheets
- **Settings** - Profile, weight presets, email templates, integrations

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- next-themes (dark/light mode)
- Custom ShadCN-compatible UI components

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

## Project Structure

```
app/
  auth/page.tsx       - Authentication
  dashboard/page.tsx  - Overview dashboard
  upload/page.tsx     - Resume upload + JD
  pipeline/page.tsx   - Main pipeline view
  candidates/page.tsx - Ranked results
  settings/page.tsx   - HR parameters
components/
  ui/                 - Reusable UI components
  layout/             - Navbar, Sidebar, ThemeProvider
hooks/
  useWindowSize.tsx    - Responsive hook
  useToast.ts         - Toast notifications
lib/
  utils.ts            - cn() helper
  data.ts             - Mock data
 types/
  index.ts            - TypeScript interfaces
```

## Notes

- All UI components are custom-built to match ShadCN patterns without external dependencies
- Mock data simulates real pipeline behavior with timed progress updates
- Dark/light theme toggle uses CSS custom properties
- Pipeline arrows feature SVG gradient strokes with animated particles
