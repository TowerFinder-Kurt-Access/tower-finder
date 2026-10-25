# Map Migration Plan

**Status: complete.** All seven phases are done on branch `feat/mapcn-migration`.

Replace the Leaflet map stack with mapcn (MapLibre GL) across the dashboard, the tower
detail page, and the discovery page. In this document, "popup" means the popout named in
the request.

---

## 1. Current state

| File | Lines | Role |
| --- | --- | --- |
| `src/components/Map.tsx` | 469 | Dashboard map: towers, leads, businesses, parcel polygon, GPS dot |
| `src/components/DiscoveryMap.tsx` | 120 | H3 scan progress map || `src/app/page.tsx` | 621 | Consumer, holds viewport state and the bbox fetch |
| `src/app/towers/[id]/page.tsx` | 1764 | Consumer, holds selected-business state |
| `src/app/superpowers/discovery/page.tsx` | 299 | Consumer, passes H3 cells |
| `src/app/globals.css` | — | Holds `.selected-tower-pulse` and the cluster icon rules |
| `src/lib/google-maps.ts` | 33 | External links, unchanged by this work |

Map-related packages in `package.json` at the start of this work: `leaflet`,
`react-leaflet`, `react-leaflet-cluster`, `@types/leaflet`. All four are now removed.

The dashboard map renders two `MarkerClusterGroup` instances, one for towers and one for
leads. Each group uses a custom `divIcon` cluster badge. The map holds `maxZoom={18}` and
the tower page works at zoom 17. A `MapUpdater` child calls `flyTo` on center and zoom
changes. A `MapEvents` child reports bounds on `moveend` with a 0.6 pad, so a cluster
drill-in does not refetch and wipe the markers.

---

## 2. Findings

Each item below blocks or constrains the migration.

- **No Tailwind.** Every mapcn component uses Tailwind classes and imports `cn` from
  `@/lib/utils`. Neither exists in this project.
- **No shadcn scaffold.** `src/components/ui` and `components.json` are absent, so the
  registry install has no landing path.
- **Registry CSS uses `@apply`.** The `.maplibregl-*` rules in the mapcn registry need
  Tailwind. They become dead CSS here.
- **Cluster count labels break.** `MapClusterLayer` hardcodes
  `"text-font": ["Open Sans Semibold"]`. The CARTO glyph server returns 404 for that font.
  It serves `Open Sans Bold` and `Open Sans Regular`.
- **CARTO positron vector tiles cap at zoom 15.** The protomaps source declares
  `maxzoom: 15`. Basemap detail stops there, while data layers stay sharp.
- **`MapMarker` is DOM-based.** The mapcn docs cap it at a few hundred markers. The
  towers API defaults to a limit of 1000 per viewport.
- **No block fits as a drop-in.** Every block pulls shadcn `card`, `badge`, `button`,
  `input`, or `sidebar`, plus `next-themes` or `recharts`.
- **The worker loads from unpkg at runtime.** mapcn sets the worker URL from unpkg unless
  the host sets it first.
- **Clusters are canvas circles, not HTML.** `MapClusterLayer` paints a circle layer plus
  a symbol text layer. Custom cluster HTML, as in the current `divIcon`, is not possible.
- **One point style per layer.** `MapClusterLayer` accepts a single `pointColor` and a
  single `clusterColors` triple. Two datasets need two instances.
- **`MapGeoJSON` renders fill and line layers only.** It cannot draw circles, so it does
  not serve the H3 cells in `DiscoveryMap`.
- **Coordinate order flips.** Leaflet uses `[lat, lon]`. mapcn `viewport.center`,
  `MapMarker`, `MapPopup`, and `MapRoute` all use `[longitude, latitude]`.
- **`DiscoveryMap` has a stray `end` token.** The popup in `src/components/DiscoveryMap.tsx`
  contains a bare `end` text node inside the `foundCount` span.
- **mapcn needs new packages.** `maplibre-gl@^6`, `lucide-react`, and `@types/geojson`.
  We swap `lucide-react` for `@mui/icons-material`, which is already present.

---

## 3. Target architecture

```text
src/components/ui/
  map.tsx                 Vendored + MUI-adapted mapcn registry (single file, no Tailwind)
  cluster-styles.ts       CARTO style object for raster basemaps and fixed cluster fonts
src/components/
  TowerMap.tsx            Replaces Map.tsx for the dashboard and tower detail page
  DiscoveryMap.tsx        Rewritten on the new primitives
src/lib/
  map-viewport.ts         [lat, lon] to [longitude, latitude] helpers and bounds types
```

### 3.1 mapcn APIs in use

| API | Use |
| --- | --- |
| `Map` | Base map, with `viewport` and `onViewportChange` for controlled mode |
| `useMap` | Direct `moveend` binding for the bounds hysteresis |
| `MapControls` | Zoom, locate, and fullscreen, with MUI icons |
| `MapClusterLayer` | Tower and lead clusters, one instance each |
| `MapMarker` | Selected tower, selected business, and GPS dot |
| `MarkerPopup` | Rich marker-attached popups |
| `MapPopup` | Selected-tower popup driven by page state |
| `MapGeoJSON` | Selected tower parcel polygon |
| `MapRoute`, `MapArc` | Not used in this pass |

### 3.2 Basemap decision

Two options, one per decision in section 8. CARTO positron vector keeps the mapcn defaults
and needs the zoom-15 ceiling accepted. A raster style keeps the current Esri Light Gray
look and keeps zoom 18. A raster style object needs a `raster` source and a single
`raster` layer, which is about 25 lines in `cluster-styles.ts`.

---

## 4. Migration phases

### Phase 0 — Setup

1. Install `maplibre-gl@^6` and `@types/geojson`.
2. Add `src/lib/utils.ts` with a `cn` helper, so the vendored file keeps its import.
3. Fetch the registry source from `https://mapcn.dev/r/map.json` and save it as
   `src/components/ui/map.tsx`.
4. Self-host the worker. Copy `maplibre-gl-worker.mjs` from the package into
   `public/` and set it with `maplibre.setWorkerUrl` before the map mounts. Remove the
   unpkg fallback.
5. Run `npm run build` to confirm the vendored file compiles before any change.

### Phase 1 — Adapt the base to MUI

1. Replace every Tailwind class with MUI `sx` props or inline styles.
2. Replace `X`, `Minus`, `Plus`, `Locate`, `Maximize`, `Loader2`, and `Compass` with the
   matching `@mui/icons-material` components. Drop the `lucide-react` import.
3. Move the registry `css` block into `globals.css` as plain CSS. Rewrite the `@apply`
   rules by hand for `.maplibregl-popup-content`, `.maplibregl-popup-tip`, and
   `.maplibregl-ctrl-attrib`.
4. Fix the cluster text font. Change `"Open Sans Semibold"` to `"Open Sans Bold"` and
   confirm the glyph request returns 200.
5. Remove the `getDocumentTheme` and `next-themes` detection. Pass `theme="light"` from
   the dashboard, which is light-only per `src/app/ThemeRegistry.tsx`.
6. Keep the dynamic `import("maplibre-gl")` loader. It is what keeps the map client-only.

### Phase 2 — Shared helpers

1. Add `src/lib/map-viewport.ts` with `toLngLat(lat, lon)`, `toLatLng(lng, lat)`, and a
   `Bounds` type that matches the existing `{north, south, east, west}` shape.
2. Add `src/components/ui/cluster-styles.ts` with the chosen basemap style object and the
   tower and lead cluster palettes.
3. Add one small self-check test for the coordinate helpers, since a silent swap breaks
   every marker position.

### Phase 3 — Port the dashboard map

Create `src/components/TowerMap.tsx` with the same props as `Map.tsx`. Keep the prop names
so the consumers change as little as possible.

1. `Map` with `viewport={{center: toLngLat(...), zoom}}` and `onViewportChange`.
2. Replace `MapUpdater`. The controlled-mode effect already jumps to a new viewport. Keep
   the existing rule that a center-only change pans at the live zoom. Add a `flyTo` path
   for the explicit center and zoom case, through `useMap`.
3. Replace `MapEvents`. Bind `map.on("moveend", ...)` and keep the 0.6 pad hysteresis.
   Do not call `onViewportChange` from `move`, because it fires per frame and hammers
   `/api/towers`.
4. Replace the tower `MarkerClusterGroup` with `MapClusterLayer` fed by a
   `FeatureCollection`. Put `towerId`, `isSelected`, and `isLead` in feature properties.
   Set `clusterRadius={50}`, `clusterMaxZoom={18}`, and the red palette.
5. Replace the lead `MarkerClusterGroup` with a second `MapClusterLayer` at the green
   palette, `clusterRadius={40}`, and the same filter that hides promoted leads.
6. Replace the parcel `Polygon` with `MapGeoJSON`. Convert the existing
   `geometryToLeafletCoords` output to a GeoJSON `FeatureCollection`, and reuse the same
   ArcGIS ring and GeoJSON branching.
7. Replace the GPS `CircleMarker` pair with one `MapMarker` that holds a styled dot and a
   halo, with `interactive={false}`.
8. Replace each `CircleMarker` popup with a `MapPopup` that follows
   `selectedTower` and `selectedBusinessId` state.
9. Add `MapControls` with `showZoom`, `showLocate`, and `showFullscreen`. Wire `onLocate`
   to the existing `useGeolocation` hook so the button and the toolbar agree.
10. Delete `.tower-cluster-icon`, `.lead-cluster-icon`, and `.selected-tower-pulse` from
    `globals.css` once no consumer references them.

### Phase 4 — Popup upgrades

The request calls for a popup upgrade. mapcn popups are plain DOM containers, so we can
render MUI inside them.

1. Build popup content from MUI components instead of raw `<div>` and `<strong>` markup.
2. Keep the "Add Property Owner" and "Add to Towers" actions in the tower and lead popups.
   They already route through `onTowerSelect` with an `action` field.
3. Add the satellite and directions links from `src/lib/google-maps.ts` to every popup.
4. Add a close button via the `closeButton` prop, and a `onClose` that clears the page
   state so a closed popup does not reopen on the next render.
5. Give the selected tower a larger popup with the carrier, status, and parcel address.

### Phase 5 — Migrate the consumers

1. `src/app/page.tsx`: change `center` from `[lat, lon]` to `[lng, lat]` at the boundary
   through the helper. Keep `mapCenter`, `zoom`, `mapBounds`, `boundsToFit`,
   `selectedTower`, `selectedBusinessId`, and `userPosition` as they are.
2. `src/app/page.tsx`: keep the `dynamic(..., {ssr: false})` import wrapper. mapcn loads
   the client bundle itself, so this is now optional cleanup, not a requirement.
3. `src/app/towers/[id]/page.tsx`: pass the tower and the business list, and keep the
   `selectedBizId` to popup link. Confirm the zoom-17 default still reads well at the
   chosen basemap ceiling.
4. `src/app/superpowers/discovery/page.tsx`: no change yet, it moves in phase 6.

### Phase 6 — Migrate the discovery map

1. Rewrite `src/components/DiscoveryMap.tsx` on `Map` and `useMap`.
2. Add one GeoJSON source with the H3 cells as points. Add a `circle` layer whose paint
   uses a `case` expression on the `status` and `foundCount` properties. Reuse the
   existing `cellColor` mapping as the expression branches.
3. Add a click handler on the circle layer that opens a `MapPopup` for the cell. Remove
   the stray `end` token while you are in this file.
4. Keep `FitBounds` as a `useMap` effect with the same 30px padding.
5. Choose the basemap. The current Esri raster style keeps the dark shell readable. A
   raster source in a MapLibre style object serves this without a key.
6. Remove the local `Typography` mock at the bottom of the file. Render MUI directly in
   the popup.

### Phase 7 — Remove Leaflet

1. Delete `src/components/Map.tsx`.
2. Remove `leaflet`, `react-leaflet`, `react-leaflet-cluster`, and `@types/leaflet` from
   `package.json`.
3. Remove `leaflet/dist/leaflet.css` imports and any `@types/leaflet` references.
4. Grep for `LatLngExpression`, `L.`, `CircleMarker`, `Polygon`, `Popup`, and
   `MarkerClusterGroup` to confirm no references remain.

---

## 5. Traps

These are the changes most likely to break silently.

- **Coordinate order.** Every `[lat, lon]` value becomes `[longitude, latitude]`. A swap
  puts every marker in the wrong hemisphere and still renders.
- **Controlled mode with no change detection.** The mapcn effect jumps to the new viewport
  on every prop change. Feed it a stable object, or the map fights user pans.
- **`onViewportChange` on `move`.** Bounds must come from `moveend` with the pad, exactly
  as today. Otherwise each pan frame refetches towers.
- **`isLoaded` gating.** Layer children only mount after `isLoaded && isStyleLoaded`.
  Adding a layer outside that gate fails with a MapLibre error.
- **Cluster data identity.** `MapClusterLayer` calls `setData` when the `data` prop
  changes. Build the `FeatureCollection` with `useMemo`, or every render rebuilds the
  cluster tree.
- **`getClusterExpansionZoom` is async.** The default cluster click awaits it. If you keep
  a custom zoom rule, cap it at the basemap ceiling.
- **Popup close loop.** `MapPopup` calls `onClose` on the MapLibre `close` event. If
  `onClose` sets state that remounts the popup, the popup flickers.

---

## 6. Blocks

No block installs as a drop-in, because each one needs shadcn and Tailwind.

- **`store-locator`** is the closest match to the dashboard. Its `store-list.tsx` shows a
  list that syncs selection with the map. Use it as a reference for the tower list sync
  pattern only.
- **`uptime-monitor`** shows a status sidebar beside a marker map. Its marker composition
  is a useful reference for the selected-tower popup.
- **`logistics-network`** and **`analytics-map`** need shadcn `sidebar` and `card`. Skip.
- **`choropleth`** and **`heatmap`** need a blank basemap and a globe projection. Skip.

Recommendation: treat blocks as reference material, not as installed code.

---

## 7. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Zoom-15 basemap ceiling | Tower detail map loses detail above 15 | Pick the raster basemap in phase 2 |
| Cluster font 404 | Cluster counts render blank | Phase 1 step 4 |
| 1000 DOM markers | Sluggish dashboard at dense zooms | Clusters stay WebGL, only 3 markers are DOM |
| Worker from unpkg | Runtime dependency on a CDN | Phase 0 step 4 |
| Bbox refetch storm | API load on every pan frame | `moveend` plus the 0.6 pad, unchanged |
| Vendored file drift | Upstream fixes do not arrive | Pin the registry version in a comment |

---

## 8. Open decisions

Each decision needs an answer before its phase starts. The recommendation is listed first.

1. **Basemap.** Raster Esri Light Gray at zoom 18, or CARTO positron vector at zoom 15?
   Recommendation: raster, because the tower detail page works at zoom 17 today.
2. **Cluster click.** Keep the custom `+1` rule capped at 18, or take the MapLibre
   `getClusterExpansionZoom` default? Recommendation: the default, because it is correct
   and deletes code.
3. **Discovery map scope.** Migrate it in this pass, or leave it on Leaflet?
   Recommendation: migrate it, because it shares the basemap and the popup work.
4. **Blocks.** Reference only, or wire in a block? Recommendation: reference only.

---

## 9. Verification

Run before the work is called done.

1. `npm run build` exits with no errors.
2. No new `any` types and no suppression comments.
3. The dashboard shows red tower clusters and green lead clusters with visible counts.
4. A cluster click expands to its children and does not refetch towers.
5. A tower click opens a popup, and the parcel polygon draws for a tower that has one.
6. A pan fires one bounds request, not one per frame.
7. The tower detail page shows the selected business popup and the GPS dot.
8. The discovery page shows H3 cells with the correct status colors and counts.
9. Attribution for OpenStreetMap and CARTO stays visible on every basemap.
