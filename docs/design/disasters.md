# Disaster atmosphere

Reference: `disasters-reference.png`, generated with the built-in image-generation tool before completing the effects. Prompt: six-panel low-poly medieval island reference for bad fishing, blight, cold snap, forest fire, hurricane, and credit crunch; cheerful timber houses, orange roofs, turquoise sea, cream/teal HUD; restrained particles and readable buildings; no destruction. The concept sheet is art direction, not a promise of new buildings or props.

Implemented effects follow `/tunables` values relative to their startup defaults. The preset buttons update the renderer immediately; shared polling also picks up scheduled and external changes. Partial dial changes scale severity, multiple disasters can coexist, and restoring values eases their effects away. Good-season and easy-money settings do not trigger negative effects. A small live HUD describes each actual economic consequence and reports recovery. Connection failures preserve the last known conditions.

- Bad fishing: muted sea colors and expanding empty-catch rings near the docks.
- Blight: green spores over the market/food area.
- Cold snap: snow, cooler directional light, terrain tint and frost on upward-facing warm roof/timber surfaces.
- Forest fire: localized low-poly flames, soft smoke, rising embers and warmer light near the forest edge.
- Hurricane: diagonal rain, windblown leaves, darker sky/clouds, moving clouds, cooler sunlight and stronger water displacement and surface normals.
- Credit crunch: restrained hovering gold coins over the market and a clear lending-closed HUD explanation. No new bank building is added.

Particles are fixed-size batched buffers. Flames use instancing, frost reuses existing materials, and no dynamic shadow lights are added. The existing CCTV frame throttle remains; particle counts halve in that view. Reduced motion freezes particle travel and flicker and removes rain streaks while retaining static weather/color cues and descriptions. Disconnection unsubscribes and disposes effect resources.

Island layout, population, camera controls, gameplay calculations and disaster mechanics remain unchanged. Visual fire does not destroy geometry or imply extra damage. The forest-fire preset continues to reduce wood yield; only the simulation decides losses.

Validation: production build; Node tests for all six severities, mixed shocks, partial settings, recovery, finite geometry buffers, reduced-motion rain suppression and disposal; browser shader/error checks and cold-snap, fire, hurricane and combined-effect inspection. Original live dial values restored after verification.
