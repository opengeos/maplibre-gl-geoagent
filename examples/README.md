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

## Earth Engine Example

A vanilla TypeScript example with Google Earth Engine tools enabled. Copy
`.env.example` to `.env` and set the Vite environment variables:

```bash
cp .env.example .env
```

```env
VITE_GEE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
# Optional default. Users can also enter their own project ID in the panel.
VITE_GEE_PROJECT_ID=
```

Then run:

```bash
npm run dev
```

Open <http://localhost:5173/examples/earth-engine/>.

For a public deployment, configure `VITE_GEE_OAUTH_CLIENT_ID` at build time and
leave `VITE_GEE_PROJECT_ID` unset so each user can enter their own Earth
Engine-enabled Google Cloud project ID in the GeoAgent panel.

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
