import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { type Map } from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';
import { GeoAgentControlReact, useGeoAgentState } from '../../src/react';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

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
      maxPitch: 85,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');
    mapInstance.addControl(new maplibregl.GlobeControl(), 'top-right');
    mapInstance.on('load', () => {
      mapInstance.setProjection({ type: 'globe' });

      mapInstance.addControl(
        new LayerControl({
          collapsed: true,
          basemapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
          panelWidth: 320,
          panelMinWidth: 240,
          panelMaxWidth: 420,
        }),
        'top-right',
      );
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <GeoAgentControlReact
          map={map}
          title="GeoAgent"
          collapsed={state.collapsed}
          position="top-left"
          allowCodeExecutionDefault={true}
          allowDestructiveToolsDefault={true}
          showPermissionToggles={false}
          onStateChange={setState}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
