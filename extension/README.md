# Download and Install the Chrome Extension

Follow these steps to build the extension from the project source and load it locally in Chrome.

## 1. Download the project

1. Open the team's project repository on GitHub.
2. Click **Code**, then **Download ZIP**.
3. Extract the ZIP to a folder on your computer.
4. Find the `extension` folder inside the downloaded project. It contains `package.json` and the source `manifest.json`.

If you already have the project on your computer, start with step 2 below.

## 2. Install Node.js

Install Node.js with npm if you do not already have it. Use Node.js **22.12.0 or newer** to meet the build tool's requirement.

Open a terminal and check that both commands work:

```sh
node --version
npm --version
```

If either command is missing after installation, close and reopen your terminal.

## 3. Open the extension folder in a terminal

Navigate to the folder containing the extension's `package.json`.

For this workspace, starting from `knighthacks6`, run:

```sh
cd knighthacksix/extension
```

For a downloaded ZIP, the outer folder name may differ. You can open the extracted project in your editor and open a terminal directly in its `extension` folder instead.

## 4. Install dependencies and build

Run these commands from the `extension` folder:

```sh
npm ci
npm run build
```

`npm ci` installs dependencies from the committed lockfile. A successful build generates a `dist` folder containing the extension Chrome can load.

Check that `dist/manifest.json` exists before continuing. If the build fails, resolve the terminal error first; do not load an older build assuming it contains your changes.

## 5. Load the extension in Chrome

1. Open Google Chrome.
2. Type `chrome://extensions` into the address bar and press Enter.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the **`dist` folder inside `extension`**.
6. Confirm that the extension appears in the list and its toggle is enabled.

Choose the generated `dist` folder, rather than the ZIP or source `extension` folder. The source manifest references TypeScript files that need to be built first.

The current manifest uses the placeholder name `[APP NAME]`, so that may be the name shown in Chrome.

## 6. Check that it runs on YouTube

1. Open an English YouTube video with captions available.
2. Refresh the video page if it was already open before installation.
3. Open Chrome DevTools using **Inspect**, then select **Console**.
4. Look for messages beginning with `[LL main]` and `[LL content]`.
5. Look for caption-track and timestamped-line logs.

The current source reads and logs captions. The bilingual overlay, sidebar, pronunciation, recording, and dashboard connection are planned build steps; installing this version does not mean those features are already implemented. See the [Chrome Extension Build Steps](../docs/Chrome%20Extension%20Steps.md) checklist.

## 7. Reload after code changes

1. Save your changes.
2. From the `extension` folder, rebuild:

```sh
npm run build
```

3. Return to `chrome://extensions`.
4. Click the reload button on this extension's card.
5. Refresh the YouTube page to reload its content scripts.

For this installation workflow, the built extension runs without keeping a Vite development server open.

## Installing a build shared by a teammate

If a teammate sends you a ZIP of a successfully built `dist` folder, extract it and follow step 5. Select the extracted folder that directly contains `manifest.json`. You do not need Node.js or npm just to load that build.

Keep the extracted folder in a stable location while it is installed. If you move it, remove the old installation and use **Load unpacked** to select the new location.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `npm` is not recognized / command not found | Install Node.js with npm, then reopen the terminal. |
| npm cannot find `package.json` | Navigate into the source `extension` folder before running the commands. |
| Node.js version error | Check `node --version` and use Node.js 22.12.0 or newer. |
| No `dist` folder | Run `npm run build` and resolve any reported build errors. |
| Chrome reports a missing manifest | Select the extracted build folder that directly contains `manifest.json`. |
| Chrome cannot load a TypeScript script | You likely selected the source folder; select `extension/dist` instead. |
| No logs on YouTube | Enable the extension, reload it, refresh YouTube, and check the extension card for errors. |
| Caption tracks or lines are missing | Try a video with manual English captions and check the Console for caption-fetch errors. |
| Changes are not visible | Rebuild, reload the extension in Chrome, then refresh YouTube. |

To uninstall, open `chrome://extensions` and click **Remove** on the extension's card.
