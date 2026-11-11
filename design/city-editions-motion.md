# City Editions — architectural construction

11 November 2026. A dimensional vector construction, settling into the exact
existing city logo. This is shallow perspective over canonical SVG geometry,
not a volumetric model of a building. Every plane uses the same160×120 drawing
grid as the native mark; semantic masks select its architecture. Layout centers
the assembly without a resampling transform. Rectangular mask overlaps of0.125
drawing unit close antialiasing seams while original paths bound the silhouette.

The opaque architecture leads. Coloured bands, Solari position, city choices, service
sheet and actions remain still. The original service updates immediately. One
deliberate pointer choice earns one finite sequence; the end state is quiet.

| City | White structure | Gold finish | Total |
| --- | --- | --- | --- |
| Rome | Lower arcade, middle arcade, upper rim, at 0/60/110ms | Curved lines at350ms | 630ms |
| Madrid | Centre portal, paired wings, crown, at0/60/160ms; base anchors | Accents at380ms | 660ms |
| Barcelona | Central spires, outer spires, buttresses; doorway beneath | Crosses at420ms | 700ms |
| Amsterdam | Centre, left, right house, at0/65/110ms | Quay then water at310/420ms | 700ms |
| London | Towers, crossbeam, deck, at0/60/180/220ms | Suspension cables at400ms | 680ms |
| Milan | Façade and base, central pinnacle, paired outer spires | Tracery at400ms | 680ms |

Most white planes settle over500ms using the original `--edition-ease`; gold
strokes draw over280ms. Depth and rotation are bounded, and reduced on phones.
No bounce, glow, rotating idle model, random debris or additional animation loop.

The canonical public SVG is fetched and parsed once into presentation templates.
Each assembly imports one definition per required original path, and transient
HTML planes reference those local definitions. Original path attributes remain
exact; no second authored geometry is maintained. Even-odd windows and portals
remain compound paths. Rome uses curved clip boundaries through the solid bands
between arcades; Madrid's portal groups use fixed windows. Perspective belongs
to the HTML wrappers. The original
signature is hidden only while a complete temporary assembly is available and
returns on completion or interruption. No second authoritative artwork is stored.
Entry shows the complete native mark. A deliberate city selection animates only
when source templates are ready; missing or failed artwork remains static.
Loading never replays an earlier gesture. Inline references avoid the measured
external-use readiness race without another animation-frame loop or timer.

Keyboard, API/history, Pause, reduced motion and Save-Data use the complete mark.
A second city choice during construction cancels and settles immediately instead
of replaying. View exit, a resize changing the glyph's dimensions, hidden/offscreen state and page lifecycle cancel
the assembly and release temporary elements. Switching to Globe is immediate.

Verify painted architecture at roughly0/150/350/700ms, exact settled geometry,
mobile clearance, one original city owner, immediate service state, cancellations
and no residual animation. `flightcityeditionsui` owns behavioral coverage;
actual browser recordings provide visual evidence beyond the test fixtures.

Technical references: [CSS 3D rendering contexts](https://www.w3.org/TR/css-transforms-2/),
[SVG transform origins](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/transform-origin).
