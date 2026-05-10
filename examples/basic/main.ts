import maplibregl from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';
import { GeoAgentControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

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

  const geoAgent = new GeoAgentControl({
    title: 'GeoAgent',
    collapsed: false,
    allowCodeExecutionDefault: true,
    allowDestructiveToolsDefault: true,
    showPermissionToggles: false,
  });

  map.addControl(geoAgent, 'top-left');

  geoAgent.on('statechange', (event) => {
    console.log('GeoAgent state changed:', event.state);
  });
});
