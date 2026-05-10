import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeoAgentControl } from '../src';
import { GeoAgentControlReact } from '../src/react';
import {
  geoJsonBounds,
  geoJsonGeometryTypes,
  geojsonLayerDefs,
  geojsonLayerPaint,
  slug,
} from '../src/lib/core/maplibre-tools';

class MockMap {
  readonly mapContainer = document.createElement('div');
  readonly controlStack = document.createElement('div');
  readonly controls = new Set<unknown>();
  readonly on = vi.fn();
  readonly off = vi.fn();
  readonly loaded = vi.fn(() => true);

  constructor(positionClass = 'maplibregl-ctrl-top-left') {
    this.mapContainer.className = 'map';
    this.controlStack.className = positionClass;
    this.mapContainer.appendChild(this.controlStack);
    document.body.appendChild(this.mapContainer);
  }

  getContainer() {
    return this.mapContainer;
  }

  addControl(control: { onAdd: (map: unknown) => HTMLElement }, _position?: string) {
    this.controls.add(control);
    this.controlStack.appendChild(control.onAdd(this));
  }

  removeControl(control: { onRemove: () => void }) {
    control.onRemove();
    this.controls.delete(control);
  }

  hasControl(control: unknown) {
    return this.controls.has(control);
  }

  cleanup() {
    this.mapContainer.remove();
  }
}

describe('GeoAgentControl', () => {
  it('adds a MapLibre control button and floating panel', () => {
    const map = new MockMap();
    const control = new GeoAgentControl({ title: 'GeoAgent Test' });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);

    expect(container.className).toContain('geoagent-control');
    expect(map.mapContainer.querySelector('.geoagent-panel')).toBeTruthy();
    expect(control.getState()).toMatchObject({
      collapsed: true,
      panelWidth: 430,
      providerId: 'openai-responses',
      allowCodeExecution: false,
      allowDestructiveTools: false,
    });

    control.onRemove();
    expect(map.mapContainer.querySelector('.geoagent-panel')).toBeNull();
    expect(container.parentNode).toBeNull();
    map.cleanup();
  });

  it('expands, collapses, emits events, and closes on outside click', () => {
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const events: string[] = [];
    control.on('expand', (event) => events.push(event.type));
    control.on('collapse', (event) => events.push(event.type));

    control.expand();
    expect(control.getState().collapsed).toBe(false);
    expect(control.getPanel()?.classList.contains('expanded')).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(control.getState().collapsed).toBe(true);
    expect(control.getPanel()?.classList.contains('expanded')).toBe(false);
    expect(events).toEqual(['expand', 'collapse']);

    control.onRemove();
    map.cleanup();
  });
});

describe('GeoAgentControlReact', () => {
  it('mounts and removes the GeoAgent control', () => {
    const map = new MockMap();
    const onStateChange = vi.fn();
    const result = render(
      <GeoAgentControlReact
        map={map as never}
        collapsed={false}
        onStateChange={onStateChange}
      />,
    );

    expect(map.controls.size).toBe(1);
    expect(map.mapContainer.querySelector('.geoagent-panel.expanded')).toBeTruthy();

    result.unmount();
    expect(map.controls.size).toBe(0);
    expect(map.mapContainer.querySelector('.geoagent-panel')).toBeNull();
    map.cleanup();
  });
});

describe('MapLibre GeoAgent helpers', () => {
  it('normalizes layer names into stable slugs', () => {
    expect(slug('US Counties 2026!')).toBe('us-counties-2026');
    expect(slug('')).toBe('layer');
  });

  it('computes GeoJSON bounds and geometry-specific layer definitions', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [-83.92, 35.96],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [-84, 36],
              [-83, 35],
            ],
          },
        },
      ],
    };

    expect(geoJsonBounds(geojson)).toEqual([-84, 35, -83, 36]);
    expect(Array.from(geoJsonGeometryTypes(geojson)).sort()).toEqual([
      'LineString',
      'Point',
    ]);

    const layerDefs = geojsonLayerDefs('test', geojsonLayerPaint({ color: '#ff0000' }), geojson);
    expect(layerDefs.map((layer) => layer.id)).toEqual(['test-line', 'test-point']);
  });
});
