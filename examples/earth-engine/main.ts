import maplibregl from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';
import { GeoAgentControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

const STORAGE_PREFIX = 'maplibre-gl-geoagent.ee-example';

function envString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function projectValue(envValue: unknown): string {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get('ee_project_id') ||
    envString(envValue) ||
    sessionStorage.getItem(`${STORAGE_PREFIX}.earthEngine.projectId`) ||
    localStorage.getItem(`${STORAGE_PREFIX}.ee_project_id`) ||
    ''
  );
}

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-98.5795, 39.8283],
  zoom: 3,
  maxPitch: 85,
  canvasContextAttributes: { preserveDrawingBuffer: true },
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

map.on('load', () => {
  map.addControl(
    new LayerControl({
      collapsed: true,
      basemapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
      panelWidth: 320,
      panelMinWidth: 240,
      panelMaxWidth: 420,
    }),
    'top-right',
  );

  const oauthClientId = envString(import.meta.env.VITE_GEE_OAUTH_CLIENT_ID);
  const projectId = projectValue(import.meta.env.VITE_GEE_PROJECT_ID);
  const geoAgent = new GeoAgentControl({
    title: 'GeoAgent + Earth Engine',
    collapsed: false,
    storagePrefix: STORAGE_PREFIX,
    allowCodeExecutionDefault: true,
    allowDestructiveToolsDefault: true,
    showPermissionToggles: false,
    earthEngine: {
      oauthClientId,
      projectId,
      includeCommunityCatalog: true,
    },
  });

  map.addControl(geoAgent, 'top-left');
});
