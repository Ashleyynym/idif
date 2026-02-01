# IDIF AUC Calculator

A web application for computing Area Under the Curve (AUC) comparisons between Real and Combined time-activity curves.

## Features

- Parse messy tab/space-separated data with Real and Combined curves
- Compute AUCs for multiple time windows (0-5 min, 0-10 min, 10-end, total)
- Handle mismatched end times by interpolating to common end time
- Calculate %Bias vs Real for each window
- Export results as TSV for easy Excel paste

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## GitHub Pages Deployment

This project is configured to deploy automatically to GitHub Pages using GitHub Actions.

### Initial Setup

1. Push your code to a GitHub repository
2. Go to your repository Settings → Pages
3. Under "Build and deployment", select "Source: GitHub Actions"
4. The workflow will automatically build and deploy when you push to the `main` branch

### Important: Base Path Configuration

The `vite.config.ts` file includes a `base: '/idif/'` setting. **If your repository name is different**, you need to update this:

- If your repo is `https://github.com/username/idif`, keep `base: '/idif/'`
- If your repo is `https://github.com/username/my-repo`, change to `base: '/my-repo/'`
- If deploying to a custom domain or `username.github.io`, change to `base: '/'`

After changing the base path, rebuild and redeploy.

## Usage

1. Paste your dataset into the text area (format: Time Real combined Time[min] Activity[Bq/ml])
2. Adjust time cutoffs if needed (default: 5 and 10 minutes)
3. Click "Compute AUC Table"
4. Copy the results as TSV using the "Copy TSV" button

## Technical Details

- Built with React + TypeScript
- All computations performed client-side
- Uses trapezoidal rule for AUC calculation
- Linear interpolation for boundary points and end time matching
- Deployed via GitHub Actions to GitHub Pages
