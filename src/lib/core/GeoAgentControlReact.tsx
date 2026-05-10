import { useEffect, useRef } from 'react';
import { GeoAgentControl } from './GeoAgentControl';
import type { GeoAgentControlReactProps } from './types';

export function GeoAgentControlReact({
  map,
  onStateChange,
  ...options
}: GeoAgentControlReactProps): null {
  const controlRef = useRef<GeoAgentControl | null>(null);

  useEffect(() => {
    if (!map) return;

    const control = new GeoAgentControl(options);
    controlRef.current = control;

    if (onStateChange) {
      control.on('statechange', (event) => {
        onStateChange(event.state);
      });
    }

    map.addControl(control, options.position || 'top-right');

    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!controlRef.current) {
      return;
    }
    const currentState = controlRef.current.getState();
    if (options.collapsed !== undefined && options.collapsed !== currentState.collapsed) {
      if (options.collapsed) {
        controlRef.current.collapse();
      } else {
        controlRef.current.expand();
      }
    }
  }, [options.collapsed]);

  return null;
}
