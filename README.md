# maplibre-gl-geoagent

A browser-only GeoAgent control for MapLibre GL JS. The control implements
MapLibre's `IControl` interface and embeds a Strands TypeScript agent that can
inspect and operate on the live map through dedicated browser tools.

[![npm version](https://img.shields.io/npm/v/maplibre-gl-geoagent.svg)](https://www.npmjs.com/package/maplibre-gl-geoagent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open in CodeSandbox](https://img.shields.io/badge/Open%20in-CodeSandbox-blue?logo=codesandbox)](https://codesandbox.io/p/github/opengeos/maplibre-gl-geoagent)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-blue?logo=stackblitz)](https://stackblitz.com/github/opengeos/maplibre-gl-geoagent)

## Features

- Collapsible MapLibre control with a floating chat panel
- Browser provider UI for OpenAI Responses, OpenAI Chat, Anthropic, Google Gemini, Amazon Bedrock, and any OpenAI-compatible/custom endpoint
- API keys are saved on commit (Enter or blur) with an inline confirmation; provider errors are shown when a prompt is sent
- Provider, key, and model settings live in one collapsible section that folds away once configured; built-in providers default to their latest configured model, and the model can still be edited manually
- Map tools for camera movement, projection, basemaps, markers, GeoJSON, XYZ tiles, layer visibility, opacity, feature queries, screenshots, and layer cleanup
- Optional Google Earth Engine tools for catalog search, OAuth initialization, dataset tile layers, normalized difference indexes, visualization updates, snippets, and bounded statistics
- Optional MapLibre JavaScript execution tool, disabled by default
- Destructive layer removal tools gated behind a separate toggle
- Copy the visible conversation log as Markdown
- React wrapper and state hook

## Installation

```bash
npm install maplibre-gl-geoagent maplibre-gl
```

## Vanilla Usage

```typescript
import maplibregl from "maplibre-gl";
import { GeoAgentControl } from "maplibre-gl-geoagent";
import "maplibre-gl/dist/maplibre-gl.css";
import "maplibre-gl-geoagent/style.css";

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [-98.5795, 39.8283],
  zoom: 3,
  maxPitch: 85,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});

map.on("load", () => {
  map.addControl(
    new GeoAgentControl({
      title: "GeoAgent",
      collapsed: false,
    }),
    "top-left",
  );
});
```

## React Usage

```tsx
import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map } from "maplibre-gl";
import {
  GeoAgentControlReact,
  useGeoAgentState,
} from "maplibre-gl-geoagent/react";
import "maplibre-gl/dist/maplibre-gl.css";
import "maplibre-gl-geoagent/style.css";

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const { state, setState } = useGeoAgentState({ collapsed: false });

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-98.5795, 39.8283],
      zoom: 3,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    mapInstance.on("load", () => setMap(mapInstance));
    return () => mapInstance.remove();
  }, []);

  return (
    <>
      <div ref={mapContainer} style={{ width: "100vw", height: "100vh" }} />
      {map && (
        <GeoAgentControlReact
          map={map}
          title="GeoAgent"
          collapsed={state.collapsed}
          position="top-left"
          onStateChange={setState}
        />
      )}
    </>
  );
}
```

## Providers

Supported providers:

- OpenAI Responses
- OpenAI Chat
- Anthropic
- Google Gemini
- Amazon Bedrock
- OpenAI-Compatible (Custom)

For Bedrock, select `Amazon Bedrock`, enter a Bedrock API key, choose a Bedrock
Converse model ID, and set the AWS region. The default Bedrock model is
`anthropic.claude-opus-4-8`, and the default region is `us-west-2`.

For a custom or self-hosted model, select `OpenAI-Compatible (Custom)`, enter the
API base URL of an OpenAI-compatible endpoint (for example a local LLM server or
a private deployment), supply the API key, and enter a model ID. The endpoint is
called with the OpenAI Chat Completions API shape.

### Saving keys and models

The API key is written to `sessionStorage` only when you commit it (press Enter
or move focus out of the field), so a half-typed key never flips the status
badge to "Ready" or get written to storage.

Built-in providers use the latest model configured by the package:
`gpt-5.5` for OpenAI Responses and OpenAI Chat, `claude-opus-4-8` for Anthropic,
`gemini-3.5-flash` for Google Gemini, and `anthropic.claude-opus-4-8` for Amazon
Bedrock. The "Use latest" button resets the model field to that configured
default without calling a provider model-list endpoint. For
`OpenAI-Compatible (Custom)`, there is no universal latest model, so enter the
model ID exposed by that endpoint.

## Options

| Option                         | Type                                                           | Default               |
| ------------------------------ | -------------------------------------------------------------- | --------------------- |
| `collapsed`                    | `boolean`                                                      | `true`                |
| `position`                     | `'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'top-right'`         |
| `title`                        | `string`                                                       | `'GeoAgent'`          |
| `panelWidth`                   | `number`                                                       | `390`                 |
| `panelMinWidth`                | `number`                                                       | `320`                 |
| `panelMaxWidth`                | `number`                                                       | `720`                 |
| `className`                    | `string`                                                       | `''`                  |
| `defaultProvider`              | `GeoAgentProviderId`                                           | `'openai-responses'`  |
| `defaultModel`                 | `string \| Partial<Record<GeoAgentProviderId, string>>`        | provider default      |
| `storagePrefix`                | `string`                                                       | `'geoagent.maplibre'` |
| `apiKeys`                      | `Partial<Record<GeoAgentProviderId, string>>`                  | `undefined`           |
| `allowCodeExecutionDefault`    | `boolean`                                                      | `true`                |
| `allowDestructiveToolsDefault` | `boolean`                                                      | `true`                |
| `showPermissionToggles`        | `boolean`                                                      | `false`               |
| `basemaps`                     | `Record<string, string \| StyleSpecification>`                 | built-in basemaps     |
| `earthEngine`                  | `EarthEngineOptions`                                           | `undefined`           |

### Earth Engine Options

```typescript
new GeoAgentControl({
  earthEngine: {
    oauthClientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID",
    projectId: "your-earth-engine-project",
    includeCommunityCatalog: true,
  },
});
```

The Earth Engine integration uses browser OAuth through the official
`@google/earthengine` package. Service account private keys are intentionally
not supported in this browser-only package. Use a backend proxy if your
deployment needs service account access.

Host applications that already authenticate Earth Engine outside the browser
can provide a short-lived OAuth access token instead of launching browser
OAuth:

```typescript
new GeoAgentControl({
  earthEngine: {
    accessToken: "SHORT_LIVED_EARTH_ENGINE_ACCESS_TOKEN",
    tokenType: "Bearer",
    tokenExpiresIn: 3600,
    projectId: "your-earth-engine-project",
    includeCommunityCatalog: true,
  },
});
```

Access tokens are passed to the browser JavaScript runtime and should be
short-lived. Do not persist them in page source, notebooks, local storage, or
session storage. For untrusted users or production deployments, prefer a
backend proxy.

## Browser Credentials

This package runs model SDKs directly in the browser. API keys entered in the
panel are stored in `sessionStorage` under the configured `storagePrefix` and
are sent directly from the page to the selected model provider. Use this for
local development, trusted internal apps, or apps that intentionally expose a
browser-compatible credential path.

Host applications can prefill the panel with initial API keys:

```typescript
new GeoAgentControl({
  apiKeys: {
    "openai-responses": "OPENAI_API_KEY_VALUE",
    "openai-chat": "OPENAI_API_KEY_VALUE",
    anthropic: "ANTHROPIC_API_KEY_VALUE",
    google: "GOOGLE_API_KEY_VALUE",
    bedrock: "AWS_BEARER_TOKEN_BEDROCK_VALUE",
  },
});
```

Saved `sessionStorage` values take precedence over `apiKeys`. Initial keys are
kept in browser memory and are not written to storage unless the user edits the
API key field.

For Amazon Bedrock, this browser-only control uses Bedrock API-key bearer-token
authentication. Do not enter AWS access key IDs, secret access keys, or session
tokens in this UI. For production Bedrock deployments, prefer a backend proxy
that calls Bedrock with IAM role credentials.

The MapLibre JavaScript tool and layer removal tools are enabled by default.
Their checkboxes are hidden by default; pass `showPermissionToggles: true` at
initialization time to let users turn them on or off in the panel. Disable either
capability at startup with `allowCodeExecutionDefault: false` or
`allowDestructiveToolsDefault: false`.

## Prompt Examples

```text
Add a red marker for San Francisco and zoom to it.
```

```text
Change the basemap to dark, then get the current map state.
```

```text
Add the GeoJSON URL https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json as US counties.
```

```text
Search Google Earth Engine for SRTM elevation datasets, then add the SRTM image with a terrain palette.
```

```text
Load Sentinel-2 surface reflectance for Knoxville in June 2024 and calculate NDVI using B8 and B4.
```

```text
Hide the US counties layer, then show it again.
```

```text
What features are visible at the center of the current map?
```

## API

- `GeoAgentControl` implements MapLibre `IControl`
- `GeoAgentControlReact` mounts and unmounts the control for React apps
- `useGeoAgentState` provides a small React state helper
- Types are exported for control options, state, providers, events, and React props

## Development

```bash
npm install
cp .env.example .env
npm run dev
npm test
npm run build
npm run build:examples
```

For the Earth Engine example, set `VITE_GEE_OAUTH_CLIENT_ID` in `.env`.
`VITE_GEE_PROJECT_ID` is optional; when it is omitted, users can enter their
own Earth Engine-enabled Google Cloud project ID in the GeoAgent panel.
