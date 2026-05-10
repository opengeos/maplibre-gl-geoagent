# maplibre-gl-geoagent

A browser-only GeoAgent control for MapLibre GL JS. The control implements
MapLibre's `IControl` interface and embeds a Strands TypeScript agent that can
inspect and operate on the live map through dedicated browser tools.

## Features

- Collapsible MapLibre control with a floating chat panel
- Browser provider UI for OpenAI Responses, OpenAI Chat, Anthropic, and Google Gemini
- Map tools for camera movement, projection, basemaps, markers, GeoJSON, XYZ tiles, layer visibility, opacity, feature queries, screenshots, and layer cleanup
- Optional MapLibre JavaScript execution tool, enabled by default
- Destructive layer removal tools gated behind a separate toggle
- Copy the visible conversation log as Markdown
- React wrapper and state hook

## Installation

```bash
npm install maplibre-gl-geoagent maplibre-gl
```

## Vanilla Usage

```typescript
import maplibregl from 'maplibre-gl';
import { GeoAgentControl } from 'maplibre-gl-geoagent';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-geoagent/style.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-98.5795, 39.8283],
  zoom: 3,
  maxPitch: 85,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});

map.on('load', () => {
  map.addControl(
    new GeoAgentControl({
      title: 'GeoAgent',
      collapsed: false,
      panelWidth: 430,
    }),
    'top-left',
  );
});
```

## React Usage

```tsx
import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import { GeoAgentControlReact, useGeoAgentState } from 'maplibre-gl-geoagent/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-geoagent/style.css';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const { state, setState } = useGeoAgentState({ collapsed: false });

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [-98.5795, 39.8283],
      zoom: 3,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    mapInstance.on('load', () => setMap(mapInstance));
    return () => mapInstance.remove();
  }, []);

  return (
    <>
      <div ref={mapContainer} style={{ width: '100vw', height: '100vh' }} />
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

## Options

| Option | Type | Default |
| --- | --- | --- |
| `collapsed` | `boolean` | `true` |
| `position` | `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'` | `'top-right'` |
| `title` | `string` | `'GeoAgent'` |
| `panelWidth` | `number` | `430` |
| `panelMinWidth` | `number` | `320` |
| `panelMaxWidth` | `number` | `720` |
| `className` | `string` | `''` |
| `defaultProvider` | `GeoAgentProviderId` | `'openai-responses'` |
| `defaultModel` | `string | Partial<Record<GeoAgentProviderId, string>>` | provider default |
| `storagePrefix` | `string` | `'geoagent.maplibre'` |
| `allowCodeExecutionDefault` | `boolean` | `true` |
| `allowDestructiveToolsDefault` | `boolean` | `true` |
| `showPermissionToggles` | `boolean` | `false` |
| `basemaps` | `Record<string, string | StyleSpecification>` | built-in basemaps |

## Browser Credentials

This package runs model SDKs directly in the browser. API keys entered in the
panel are stored in `sessionStorage` under the configured `storagePrefix` and
are sent directly from the page to the selected model provider. Use this for
local development, trusted internal apps, or apps that intentionally expose a
browser-compatible credential path.

The MapLibre JavaScript tool and layer removal tools are enabled by default.
Their checkboxes are hidden by default; pass `showPermissionToggles: true` at
initialization time to let users turn them on or off in the panel. Disable either
capability at startup with `allowCodeExecutionDefault: false` or
`allowDestructiveToolsDefault: false`.

## Prompt Examples

```text
Add a red marker for Knoxville and zoom to it.
```

```text
Change the basemap to dark, then get the current map state.
```

```text
Add the GeoJSON URL https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json as US counties.
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
npm run dev
npm test
npm run build
npm run build:examples
```
