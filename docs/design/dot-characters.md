# Dot villagers

Replaced pear silhouettes with rounded dot bodies, using the same geometry and face atlas in the island and the 3D portrait renderer. The flat fallback shares the silhouette and persona colors too.

Six stable visual personas are derived from agent ID: Calm (mint, oval eyes), Curious (blue, wide eyes and sprout), Thoughtful (lavender, round glasses), Sunny (apricot, rosy cheeks and straw hat), Bold (coral, eyebrows and headband), Playful (butter yellow, square glasses and bow). These are cosmetic identities and do not alter or claim to describe the simulation's behavioral traits. Mood remains driven by real agent state. A small badge changes with job while body color and accessories remain constant.

Performance: shared body, face, badge and accessory geometry; instanced island meshes; one shared portrait renderer; cached identity data. No model downloads or new dependencies. Movement and job routing are unchanged.

Validation: production build and syntax/diff checks passed. Temporary local browser fixtures verified all six personas, happy/worried portrait renders, unchanged identities across job/mood changes, finite geometry for 137 agent identities (170 checks), and actual island body/face/badge instancing and stable body colors for 137 agents (142 checks). Browser reported no errors. Fixtures and their Vite server were removed after verification. Preview: dot-personalities-preview.png.

## Plush reference revision

Reshaped the bodies into broad, softly flattened beans using the user's supplied plush-dot screenshot as the reference. Updated the palette to cream, turquoise, golden yellow, orange, blue and pink. Added geometric oval eyes with squash-based blinking and raised round glasses. Accessories are now a blue cap, black beret, large pink bow and flower. A shared fabric bump/sheened material and 1,100 tiny instanced fibers per body soften the surface and silhouette without external model downloads. The job badge is smaller so faces lead. Portraits, island instances and fallback rendering use the revised shapes and colors. Gameplay, personality assignments, picking and profile information are unchanged.

Validation: production build and diff checks; 86 browser portrait/mood/blink/fallback/geometry checks passed; 137-agent island renderer verified finite eye and glasses matrices and expected instance counts. No browser errors. Preview: plush-dots-preview.png. Temporary verification fixture removed.
