/*
 * serve.sh — Local development server with no npm required
 * Runs a simple Python HTTP server on port 8080.
 *
 * Usage:
 *   bash serve.sh
 *
 * The server auto-regenerates the manifest before starting so your local preview
 * reflects the actual files in /projects/.
 */

#!/bin/bash

set -e

echo "🔧 Generating manifest from /projects..."
node scripts/generate-manifest.mjs

echo "🚀 Starting local server on http://localhost:8080"
echo "Press Ctrl-C to stop."
echo ""

# Run the Node-based dev server (includes manifest generation)
npm run dev
