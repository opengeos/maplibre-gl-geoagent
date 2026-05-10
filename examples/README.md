# Examples

This directory contains example implementations of `maplibre-gl-geoagent`.
The examples add `maplibre-gl-layer-control` directly so the published
GeoAgent library does not depend on that optional UI control.

## Basic Example

A vanilla TypeScript example showing the `GeoAgentControl` added to a MapLibre map.
It enables MapLibre JavaScript and layer removal by default while keeping the
permission checkboxes hidden.

```bash
npm run dev
```

Open <http://localhost:5173/examples/basic/>.

## React Example

A React example demonstrating `GeoAgentControlReact` and `useGeoAgentState`.
It uses the same default permission behavior as the vanilla example.

```bash
npm run dev
```

Open <http://localhost:5173/examples/react/>.

## Build

```bash
npm run build:examples
```

The built examples are written to `dist-examples`.
