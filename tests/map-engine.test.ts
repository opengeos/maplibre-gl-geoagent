import { describe, it, expect, vi } from 'vitest';
import { MapLibreAgentTools, type GeoAgentMapEngine } from '../src/lib/core/maplibre-tools';

/**
 * A marker of whichever engine the host uses: only the members the tools drive,
 * so an engine that offers nothing more still works.
 */
function fakeMarkerClass() {
  const built: Array<{ options: unknown; lngLat?: unknown; addedTo?: unknown; popup?: unknown }> =
    [];
  class FakeMarker {
    private record: (typeof built)[number];
    element = document.createElement('div');
    constructor(options?: unknown) {
      this.record = { options };
      built.push(this.record);
    }
    setLngLat(lngLat: unknown) {
      this.record.lngLat = lngLat;
      return this;
    }
    addTo(map: unknown) {
      this.record.addedTo = map;
      return this;
    }
    setPopup(popup: unknown) {
      this.record.popup = popup;
      return this;
    }
    getElement() {
      return this.element;
    }
    remove() {
      return this;
    }
  }
  return { FakeMarker, built };
}

class FakePopup {
  text = '';
  setText(text: string) {
    this.text = text;
    return this;
  }
}

/** The map members these commands reach. */
function fakeMap(projection: unknown) {
  return {
    projectionWrites: [] as unknown[],
    // runCommand waits for the map to settle before every command.
    loaded: () => true,
    getCenter: () => ({ lng: -100, lat: 40 }),
    getBounds: () => ({
      getWest: () => -110,
      getSouth: () => 30,
      getEast: () => -90,
      getNorth: () => 50,
    }),
    getZoom: () => 4,
    getBearing: () => 0,
    getPitch: () => 0,
    getProjection: () => projection,
    setProjection(value: unknown) {
      this.projectionWrites.push(value);
    },
  };
}

function tools(map: unknown, mapEngine?: GeoAgentMapEngine) {
  return new MapLibreAgentTools(map as never, {
    allowCodeExecution: () => true,
    allowDestructiveTools: () => true,
    mapEngine,
  });
}

function mapboxEngine(Marker: unknown): GeoAgentMapEngine {
  return {
    kind: 'mapbox',
    namespace: { Marker, Popup: FakePopup } as GeoAgentMapEngine['namespace'],
  };
}

describe('set_projection', () => {
  it('writes MapLibre the { type } shape it expects', async () => {
    const map = fakeMap({ type: 'mercator' });
    await tools(map).runCommand('set_projection', { projection: 'globe' });
    expect(map.projectionWrites).toEqual([{ type: 'globe' }]);
  });

  it('writes Mapbox a name string, which is what it accepts', async () => {
    const map = fakeMap({ name: 'mercator' });
    const { FakeMarker } = fakeMarkerClass();
    await tools(map, mapboxEngine(FakeMarker)).runCommand('set_projection', {
      projection: 'globe',
    });
    // mapbox-gl throws on MapLibre's `{ type }` object.
    expect(map.projectionWrites).toEqual(['globe']);
  });

  it('still rejects a projection neither engine has', async () => {
    const map = fakeMap({ name: 'mercator' });
    const { FakeMarker } = fakeMarkerClass();
    await expect(
      tools(map, mapboxEngine(FakeMarker)).runCommand('set_projection', {
        projection: 'albers',
      }),
    ).rejects.toThrow(/Unsupported projection/);
  });
});

describe('get_map_state', () => {
  it('reads the projection under either engine spelling', async () => {
    const maplibre = (await tools(fakeMap({ type: 'globe' })).runCommand(
      'get_map_state',
    )) as Record<string, unknown>;
    expect(maplibre.projection).toBe('globe');

    const { FakeMarker } = fakeMarkerClass();
    const mapbox = (await tools(
      fakeMap({ name: 'globe' }),
      mapboxEngine(FakeMarker),
    ).runCommand('get_map_state')) as Record<string, unknown>;
    expect(mapbox.projection).toBe('globe');
  });

  it('falls back to mercator when the map reports no projection', async () => {
    const state = (await tools(fakeMap(undefined)).runCommand('get_map_state')) as Record<
      string,
      unknown
    >;
    expect(state.projection).toBe('mercator');
  });
});

describe('add_marker', () => {
  it("builds the marker with the host engine's class, not maplibre-gl's", async () => {
    const { FakeMarker, built } = fakeMarkerClass();
    const map = fakeMap({ name: 'mercator' });
    const agentTools = tools(map, mapboxEngine(FakeMarker));

    await agentTools.runCommand('add_marker', {
      name: 'pin',
      lon: -122.4,
      lat: 37.8,
      color: '#ff0000',
      popup: 'Hello',
    });

    expect(built).toHaveLength(1);
    expect(built[0].options).toEqual({ color: '#ff0000' });
    expect(built[0].lngLat).toEqual([-122.4, 37.8]);
    expect(built[0].addedTo).toBe(map);
    // The popup comes from the same namespace, so it is the engine's own.
    expect(built[0].popup).toBeInstanceOf(FakePopup);
    expect((built[0].popup as FakePopup).text).toBe('Hello');
  });

  it('removes it through the same handle', async () => {
    const { FakeMarker } = fakeMarkerClass();
    const removed = vi.spyOn(FakeMarker.prototype, 'remove');
    const agentTools = tools(fakeMap({ name: 'mercator' }), mapboxEngine(FakeMarker));

    await agentTools.runCommand('add_marker', { name: 'pin', lon: 0, lat: 0 });
    await agentTools.runCommand('remove_layer', { name: 'pin' });
    expect(removed).toHaveBeenCalled();
  });
});

describe('run_maplibre_script', () => {
  it("hands user code the host engine's namespace, not this package's", async () => {
    const { FakeMarker } = fakeMarkerClass();
    const engine = mapboxEngine(FakeMarker);
    // The namespace is tagged so the script can name it without reaching for a
    // module: a script that built maplibre-gl's Marker on a mapbox-gl map would
    // throw on the first move, which is the whole point of naming the engine.
    (engine.namespace as Record<string, unknown>).__tag = 'mapbox';
    const agentTools = tools(fakeMap({ name: 'mercator' }), engine);

    const result = (await agentTools.runCommand('run_maplibre_script', {
      code: 'return { tag: maplibregl.__tag, isEngineMarker: maplibregl.Marker === map.__expectedMarker };',
      description: 'engine check',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).tag).toBe('mapbox');
  });
});

describe('GeoAgentControl mapEngine plumbing', () => {
  it('reaches the tools the control builds, not just the options object', async () => {
    // The control copies its options field by field, so a new option that is
    // declared but never copied typechecks and then silently does nothing: the
    // tools fall back to maplibre-gl and every engine-specific tool breaks on a
    // mapbox-gl map. Assert through the tools, which is what actually matters.
    const { GeoAgentControl } = await import('../src/lib/core/GeoAgentControl');
    const { FakeMarker } = fakeMarkerClass();
    const engine = mapboxEngine(FakeMarker);

    const control = new GeoAgentControl({ mapEngine: engine });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const map = {
      getContainer: () => container,
      on: vi.fn(),
      off: vi.fn(),
    };
    control.onAdd(map as never);

    const tools = (control as unknown as { tools?: { engine?: unknown } }).tools;
    expect(tools?.engine).toBe(engine);

    control.onRemove();
    container.remove();
  });

  it('still defaults to maplibre-gl when no engine is named', async () => {
    const { GeoAgentControl } = await import('../src/lib/core/GeoAgentControl');
    const control = new GeoAgentControl({});
    const container = document.createElement('div');
    document.body.appendChild(container);
    control.onAdd({ getContainer: () => container, on: vi.fn(), off: vi.fn() } as never);

    const tools = (control as unknown as { tools?: { engine?: { kind?: string } } }).tools;
    expect(tools?.engine?.kind).toBe('maplibre');

    control.onRemove();
    container.remove();
  });
});
