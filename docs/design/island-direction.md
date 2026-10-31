# Island art direction

Generated with the built-in imagegen tool. Reference: island-reference.png.

Prompt: Isometric aerial island village inspired by colorful Clash of Clans mobile strategy art. Chunky timber cottages with orange roofs, blue-roofed central hall with gold trim, ivory stone foundations, cobblestone paths, low stone walls, pine trees, grass terraces and turquoise water. Warm sunlight, readable silhouettes, no logos, UI, or text. Feasible as procedural Three.js geometry.

The scene uses this reference for palette and building silhouettes, rather than displaying the image as a flat backdrop. Economy destinations and agent movement remain live.

## Dense town revision

Reference-first workflow: generated `dense-town-reference.png` before implementation. The sheet explores the whole compact town and two close architectural views. Built-in imagegen prompt:

> Use case: stylized-concept. A landscape game art reference sheet with two views of the SAME dense, inhabited medieval island town for Aftershock, inspired by compact Clash of Clans town layouts. Left two thirds: full isometric island layout, 35-45 tightly packed varied timber and plaster buildings in irregular neighborhoods, orange tiled roofs and a blue gold town hall, cobbled narrow streets winding through houses, tiny courtyards, striped market awnings, busy working harbor, lumberyard and forge. Town occupies almost entire grassy island, trees only in small clusters at edges, no empty central lawn, no concentric ceremonial ring of buildings. Right third: closer architectural detail view showing chunky carved beams, stone foundations, individual roof tiles, dormers, shutters, flower boxes, porches, chimneys, barrels, laundry lines, crates, lanterns and garden beds between cottages. Bright cohesive colorful stylized 3D mobile strategy game rendering, appealing handcrafted proportions, warm sunlight soft shadows, turquoise coastal water. Villagers in streets. Readable believable functioning town. No text, no logos, no UI.

Implementation uses 36 buildings, mixed single and two-storey volumes, rotated frontages, layered tile roofs, dormers, shutters, mullions, flower boxes, stone plinths, plaster grain and timber textures. Central hall, well court, shop arcades, furnished backyards and vegetable plots replace the former lawn. All five existing destinations are rebuilt: scaffolded builder lodge, forge, lumberyard, market and fishery with working jetty and moored boats. Static geometry is merged by material. Ambient townspeople are decorative; the simulation's agents still reflect real events. Smoke, flags, boats and ambient walkers respect reduced motion. No new asset downloads at runtime or new dependencies.

## Spacing refinement

Reduced the layout from 36 buildings to 19 at the user's request. Residential lot centers are now at least 26 units apart, up from 18, while retaining detailed architecture, gardens and live work destinations. Removed one civic building and moved the well court to open the town center. Street paving and ambient walking lanes follow the new block spacing.

## Organic layout refinement

Kept the 19-building count and introduced deterministic offsets and varied headings, with homes facing a gently curving lane. Removed the rectangular street grid and its earth-colored terrain bands. Bent front-door paths connect homes and work locations to the lane, with separate approaches for the hall, civic shop and well. Gardens follow their building positions, perimeter trees vary in radius and angle, and ambient townspeople follow the new curved lane. Stable seeded variation preserves the composition across reloads.
