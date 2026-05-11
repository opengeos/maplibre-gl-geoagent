import './lib/styles/geoagent-control.css';

export { GeoAgentControl } from './lib/core/GeoAgentControl';
export {
  DEFAULT_BASEMAPS,
  geoJsonBounds,
  geoJsonGeometryTypes,
  geojsonLayerDefs,
  geojsonLayerPaint,
  slug,
  toJsonValue,
  type BBox,
  type JsonObject,
} from './lib/core/maplibre-tools';

export type {
  EarthEngineOptions,
  EarthEngineLayerRecord,
  GeeDataset,
} from './lib/core/earth-engine';

export type {
  GeoAgentControlEvent,
  GeoAgentControlEventHandler,
  GeoAgentControlOptions,
  GeoAgentControlReactProps,
  GeoAgentProviderConfig,
  GeoAgentProviderId,
  GeoAgentState,
} from './lib/core/types';
