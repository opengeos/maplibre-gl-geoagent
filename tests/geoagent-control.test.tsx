import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeoAgentControl } from '../src';
import { GeoAgentControlReact } from '../src/react';
import {
  extendBounds,
  geoJsonBounds,
  geoJsonGeometryTypes,
  geojsonLayerDefs,
  geojsonLayerPaint,
  numberArg,
  objectArg,
  slug,
  toJsonValue,
} from '../src/lib/core/maplibre-tools';

class MockMap {
  readonly mapContainer = document.createElement('div');
  readonly controlStack = document.createElement('div');
  readonly controls = new Set<unknown>();
  readonly on = vi.fn();
  readonly off = vi.fn();
  readonly once = vi.fn();
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

  getStyle() {
    return {
      version: 8,
      sources: {},
      layers: [],
    };
  }

  addControl(control: { onAdd: (map: unknown) => HTMLElement }, _position?: string) {
    this.controls.add(control);
    if (control.constructor.name === 'LayerControl') {
      return;
    }
    this.controlStack.appendChild(control.onAdd(this));
  }

  removeControl(control: { onRemove: () => void }) {
    if (control.constructor.name !== 'LayerControl') {
      control.onRemove();
    }
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
    expect(Array.from(map.controls).some((item) => item?.constructor.name === 'LayerControl')).toBe(
      true,
    );
    expect(control.getState()).toMatchObject({
      collapsed: true,
      panelWidth: 390,
      providerId: 'openai-responses',
      allowCodeExecution: true,
      allowDestructiveTools: true,
    });
    expect(map.mapContainer.querySelector<HTMLElement>('.geoagent-toggle-row')?.hidden).toBe(
      true,
    );

    control.onRemove();
    expect(map.mapContainer.querySelector('.geoagent-panel')).toBeNull();
    expect(container.parentNode).toBeNull();
    map.cleanup();
  });

  it('can show permission toggles during initialization', () => {
    const map = new MockMap();
    const control = new GeoAgentControl({ showPermissionToggles: true });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);

    expect(map.mapContainer.querySelector<HTMLElement>('.geoagent-toggle-row')?.hidden).toBe(
      false,
    );
    expect(map.mapContainer.querySelector<HTMLInputElement>('.geoagent-allow-code')?.checked).toBe(
      true,
    );
    expect(
      map.mapContainer.querySelector<HTMLInputElement>('.geoagent-allow-destructive')?.checked,
    ).toBe(true);

    control.onRemove();
    map.cleanup();
  });

  it('shows and persists the Bedrock region field for the Bedrock provider', () => {
    const map = new MockMap();
    const control = new GeoAgentControl({ defaultProvider: 'bedrock' });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const providerSelect = map.mapContainer.querySelector<HTMLSelectElement>('.geoagent-provider');
    const regionRow = map.mapContainer.querySelector<HTMLLabelElement>(
      '.geoagent-bedrock-region-row',
    );
    const regionInput = map.mapContainer.querySelector<HTMLInputElement>(
      '.geoagent-bedrock-region',
    );

    expect(providerSelect?.value).toBe('bedrock');
    expect(regionRow?.hidden).toBe(false);
    expect(regionInput?.value).toBe('us-west-2');
    expect(control.getState()).toMatchObject({
      providerId: 'bedrock',
      modelId: 'global.anthropic.claude-sonnet-4-6',
      bedrockRegion: 'us-west-2',
    });

    regionInput!.value = 'us-east-1';
    regionInput?.dispatchEvent(new Event('input', { bubbles: true }));

    expect(control.getState().bedrockRegion).toBe('us-east-1');
    expect(sessionStorage.getItem('geoagent.maplibre.bedrock.region')).toBe('us-east-1');

    providerSelect!.value = 'openai-responses';
    providerSelect?.dispatchEvent(new Event('change', { bubbles: true }));

    expect(regionRow?.hidden).toBe(true);

    control.onRemove();
    map.cleanup();
  });

  it('copies the visible conversation as markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const copyButton = map.mapContainer.querySelector<HTMLButtonElement>('.geoagent-copy');

    copyButton?.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

    expect(writeText).toHaveBeenCalledWith(
      '## System\n\nBrowser-only Strands MapLibre agent ready.',
    );

    control.onRemove();
    map.cleanup();
  });

  it('sends prompts with Enter and leaves Ctrl+Enter for new lines', async () => {
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const prompt = map.mapContainer.querySelector<HTMLTextAreaElement>('.geoagent-prompt')!;

    prompt.value = 'line one';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    const ctrlEnterAllowed = prompt.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(ctrlEnterAllowed).toBe(false);
    expect(prompt.value).toBe('line one\n');
    expect(prompt.selectionStart).toBe(prompt.value.length);

    const enterAllowed = prompt.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(enterAllowed).toBe(false);
    expect(prompt.value).toBe('');
    await vi.waitFor(() => expect(control.getState().busy).toBe(false));

    control.onRemove();
    map.cleanup();
  });

  it('cycles through prompt history with up and down arrows', async () => {
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const prompt = map.mapContainer.querySelector<HTMLTextAreaElement>('.geoagent-prompt')!;
    const form = map.mapContainer.querySelector<HTMLFormElement>('.geoagent-form')!;

    prompt.value = 'first prompt';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(control.getState().busy).toBe(false));

    prompt.value = 'second prompt';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(control.getState().busy).toBe(false));

    prompt.value = 'draft';
    prompt.setSelectionRange(0, 0);
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(prompt.value).toBe('second prompt');

    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(prompt.value).toBe('first prompt');

    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(prompt.value).toBe('second prompt');

    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(prompt.value).toBe('draft');

    control.onRemove();
    map.cleanup();
  });

  it('resizes the panel with the drag handle and clamps width', () => {
    const map = new MockMap();
    const control = new GeoAgentControl({
      panelWidth: 430,
      panelMinWidth: 360,
      panelMaxWidth: 500,
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const handle = map.mapContainer.querySelector<HTMLElement>('.geoagent-panel-resize-handle');

    handle?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200 }));

    expect(control.getState().panelWidth).toBe(500);
    expect(control.getPanel()?.style.width).toBe('500px');

    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -200 }));

    expect(control.getState().panelWidth).toBe(360);
    expect(control.getPanel()?.style.width).toBe('360px');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(document.body.classList.contains('geoagent-panel-resizing')).toBe(false);

    control.onRemove();
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

    expect(map.controls.size).toBe(2);
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

  it('parses numeric and object arguments with sensible fallbacks', () => {
    expect(numberArg({ zoom: 4 }, 'zoom')).toBe(4);
    expect(numberArg({ zoom: '7.5' }, 'zoom')).toBe(7.5);
    expect(() => numberArg({}, 'zoom')).toThrow(/numeric argument/);
    expect(() => numberArg({ zoom: 'abc' }, 'zoom')).toThrow(/finite numeric/);

    expect(objectArg({ style: { color: '#000' } }, 'style')).toEqual({ color: '#000' });
    expect(objectArg({ style: 'no' }, 'style')).toEqual({});
    expect(objectArg({ style: [1, 2] }, 'style')).toEqual({});
  });

  it('produces fill, line, and circle paint defaults that respect overrides', () => {
    const paint = geojsonLayerPaint({});
    expect(paint.fill['fill-color']).toBe('#1c7ed6');
    expect(paint.fill['fill-opacity']).toBeCloseTo(0.35);
    expect(paint.line['line-width']).toBe(2);
    expect(paint.circle['circle-radius']).toBe(6);

    const overridden = geojsonLayerPaint({
      color: '#ff0000',
      'line-width': 5,
      'circle-radius': 10,
      opacity: 2,
    });
    expect(overridden.fill['fill-color']).toBe('#ff0000');
    expect(overridden.fill['fill-opacity']).toBe(1);
    expect(overridden.line['line-width']).toBe(5);
    expect(overridden.circle['circle-radius']).toBe(10);
  });

  it('emits only the polygon layer when source has polygons, and all layers when geometries are unknown', () => {
    const polygonOnly: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(
      geojsonLayerDefs('poly', geojsonLayerPaint({}), polygonOnly).map((layer) => layer.id),
    ).toEqual(['poly-fill']);

    const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    expect(geojsonLayerDefs('any', geojsonLayerPaint({}), empty).map((layer) => layer.id)).toEqual([
      'any-fill',
      'any-line',
      'any-point',
    ]);
  });

  it('honors precomputed GeoJSON bbox and ignores invalid coordinates when extending bounds', () => {
    const point: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      bbox: [10, 20, 30, 40],
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    expect(geoJsonBounds(point)).toEqual([10, 20, 30, 40]);

    expect(geoJsonBounds(undefined)).toBeNull();
    expect(geoJsonGeometryTypes(undefined).size).toBe(0);

    expect(extendBounds(null, [Number.NaN, 1])).toBeNull();
    expect(extendBounds([0, 0, 0, 0], [5, -5])).toEqual([0, -5, 5, 0]);
  });

  it('round-trips JSON values and falls back to a string for non-serializable input', () => {
    expect(toJsonValue(undefined)).toBeNull();
    expect(toJsonValue({ a: 1, b: [2, 3] })).toEqual({ a: 1, b: [2, 3] });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(typeof toJsonValue(cyclic)).toBe('string');
  });
});
