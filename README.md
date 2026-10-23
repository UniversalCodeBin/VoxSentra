# VoxSentra

## Overview
VoxSentra is an enterprise voice integrity and deepfake detection engine designed to identify synthetic voices, neural clones, and acoustic replay attacks before they compromise organizational credentials.

## Problem Statement
With the rise of advanced generative AI and sophisticated voice cloning technology, organizations face increasing threats from audio-based social engineering and credential theft via synthetic voice attacks.

## Objectives and Key Features
- **Acoustic Heuristic Analysis:** Detects anomalies in audio signals like Zero-Crossing Rate and high-frequency energy ratios.
- **Deepfake Detection:** Uses signal analysis to identify synthetic characteristics.
- **Enterprise Security Integration:** Designed to protect authentication flows.
- **Scalable Architecture:** Built with a Node.js/TypeScript backend for efficient processing.

## Technology Stack
- **Backend:** Node.js, TypeScript, Vite
- **Frontend:** React, TypeScript, Tailwind CSS, Lucide React
- **Detection Engine:** Acoustic feature extraction and heuristic analysis

## Installation and Setup

### Prerequisites
- Node.js 18+
- pnpm

### Setup
```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run
pnpm start
```

## Security
- This project intentionally excludes credentials and API keys. Use environment variables (e.g., `GEMINI_API_KEY`) for secure configuration.
- Do not commit `.env` files.

## License
No license file is present. Contact the maintainer before redistribution.
