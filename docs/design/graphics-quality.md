# Graphics-only quality pass

Preserved the existing camera/orbit settings, building placement, scene geometry and object counts, gameplay, and UI. No added scene objects, buildings, or dependencies.

- Warmer sun with tighter 2048px PCF shadow coverage and smaller depth bias to reduce detached shadows.
- Twelve-sample ambient occlusion at half render resolution, with restrained strength for contact shading.
- Distinct clay, timber and stone roughness, procedural bump/roughness maps and subtle plaster texture.
- Grass variation at broad and fine scales, richer clay and blue roofs, narrower shoreline foam and stronger view-dependent sky reflection on water (stylized, not scene-reflection rendering).
- Linear HDR intermediate targets, restrained saturation adjustment, ACES output conversion, 4x MSAA where supported and final FXAA.
- A 2.1-million-pixel budget bounds full-view shading; the small dashboard inset skips postprocessing. Postprocessing targets dispose with the scene.

Validation: production build, JS syntax, diff whitespace, browser shader/error check, and visual review at the unchanged opening camera. Hardware-wide frame-rate performance has not been benchmarked.
