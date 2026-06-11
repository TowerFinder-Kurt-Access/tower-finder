# Phase 0 — Label audit for tower-lead classifier

Generated 2026-06-11T17:51:14.927Z by `scratch/audit_lead_labels.ts` (read-only).

Totals: **51522 towers**, **16155 leads**, **8839 notes**, 15 statuses.

## 1. Label inventory on `Tower`

| status | towers | with notes | updated after create | proposed label |
|---|---|---|---|---|
| (null) | 35080 | 1565 | 35080 | ambiguous |
| New (1) | 10693 | 2 | 10693 | ambiguous |
| No GSV (9) | 2151 | 338 | 2151 | not_tower |
| Determining Owner (Calls) (3) | 1442 | 1442 | 1442 | tower |
| No nearby property (6) | 822 | 212 | 822 | ambiguous |
| Duplicate Tower (16) | 746 | 744 | 746 | ambiguous |
| Compact cellular base station mounted on utility poles (17) | 206 | 1 | 206 | tower |
| Bell Alian Owned Tower (12) | 94 | 13 | 94 | tower |
| Could Not Find Owner (Calls) (2) | 64 | 64 | 64 | ambiguous |
| Not Interested (4) | 64 | 64 | 64 | ambiguous |
| Owner Found (10) | 47 | 47 | 47 | tower |
| Email Follow Up (15) | 44 | 44 | 44 | tower |
| REIT Managed (11) | 35 | 34 | 35 | tower |
| Brett to Contact (13) | 29 | 29 | 29 | tower |
| In Progress (5) | 4 | 4 | 4 | tower |
| In Progress (Arleen) (14) | 1 | 1 | 1 | tower |

### Negative-pattern notes

| pattern | notes | distinct towers | of those, status "No GSV" |
|---|---|---|---|
| no cell | 552 | 549 | 204 |
| no tower | 8 | 8 | 7 |
| water tower | 13 | 12 | 0 |
| silo | 1 | 1 | 0 |
| grain | 4 | 2 | 0 |
| crane | 11 | 4 | 0 |
| removed | 4 | 4 | 0 |

- "No GSV" towers: 2151; with any note: 338; with a negative-pattern note: 211.
- Towers with a negative-pattern note but NOT status "No GSV": 369.

### Note samples per bucket (eyeball these)

**`no cell`**

- [tower 18625] [Status changed to "No GSV"] No cell panels/towers
- [tower 21604] No cellsites
- [tower 48908] [Status changed to "No GSV"] No cell panels/towers
- [tower 20878] No cellsites
- [tower 20641] No Cellsites
- [tower 21080] No cellsites
- [tower 20278] No Cellsites
- [tower 22091] No cellsites
- [tower 51398] [Status changed to "No GSV"] no cell panel/tower
- [tower 18813] [Status changed to "No GSV"] No cell tower/panels

**`no tower`**

- [tower 49230] [Status changed to "No GSV"] No tower noted at location
- [tower 49232] [Status changed to "No GSV"] No tower noted at location
- [tower 49234] [Status changed to "No GSV"] No tower at location
- [tower 20217] [Status changed to "No GSV"] Bad scrape, no tower in the area, the tower in the GSV is the tower in Hamilton school.
- [tower 13019] looks like bad scrape- No tower
- [tower 49231] [Status changed to "No GSV"] No tower noted at location
- [tower 10880] [Status changed to "Couldn't figure out owner via calls"] No tower
- [tower 49363] [Status changed to "No GSV"] A lot of property but no tower

**`water tower`**

- [tower 49848] Trius Truck Centre - +15064579000- Spoke to front desk but transferred to gen manager- Ryan- Ryan said the property where the water tower is
- [tower 49179] [Status changed to "Determining Owner (Calls)"] City of Dieppe (outer Moncton) - Spoke to & emailed Gabriel Belliveau gabriel.belliveau@diep
- [tower 49227] [Status changed to "No nearby property"] The tower is beside Saint John Water Tower
- [tower 20155] Water Tower with panels mounted; City of Welland Call Water Dept. of City of Welland - ' 905-735-1700; 8775525579
- [tower 49721] Storeasy Storage - +15062292094- Spoke to Ben and said the water tower is from the municipality, owned by the government.
- [tower 20583] Leslie Water Tower- Municipal Water facility Possible government owned but PN: 416-392-CITY (2489)
- [tower 49404] [Status changed to "Determining Owner (Calls)"] Water tower possiblly government owned NV Auto Grooming- +15068718032- Voicemail
- [tower 20155] Water Tower with panels mounted; City of Welland
- [tower 49170] [Status changed to "Determining Owner (Calls)"] Panels are mounted on Water Tower St.John -506-658-4455; Spoke to the main call center, she 
- [tower 50075] Most likely owned by the City, Water tower

**`silo`**

- [tower 47831] [Status changed to "Determining Owner (Calls)"] Looks like a farm silo with cell panels mounted on it East Coast Classical Dressage - +19028

**`grain`**

- [tower 18485] [Status changed to "Determining Owner (Calls)"] Nearby Smook Contractors Ltd. - +12046771560 Petro-Pass Truck Stop - +12046772141 Highway 6 
- [tower 20322] [Status changed to "Determining Owner (Calls)"] Panels are mounted on the building Baker Real Estate Incorporated - +14169234621 TUCU Manage
- [tower 18485] Smook Contractors Ltd. - +12046771560- ext 0- reception- Spoke to a lady, not interested in our service, did not confirm ownership of the pr
- [tower 20322] Baker Real Estate Incorporated - +14169234621- Spoke to receptionist and will transfer to property management.- No one answered- LVM- TUCU M

**`crane`**

- [tower 21324] Jake's Crane Service; Maidstone Machine Repair; Kringer Industrial
- [tower 20320] [Status changed to "Determining Owner (Calls)"] Panels are mounted on the building Mobil Tech Fleet Services -+12262348212 Cameron Crane & R
- [tower 20444] Sheehan's Truck Centre Inc - +19056320300- Hung up Double D Crane Service Inc. - +19056396169- Voicemail Halton Hydraulics Ltd - +1905335841
- [tower 50600] [Status changed to "Not Interested"] Cranes Legacy - +1 709-638-5138- Rick Crane owner of the property - said someone is managing it for him
- [tower 20320] Mobil Tech Fleet Services - +12262348212; Cameron Crane & Riggers - +15196527000
- [tower 20320] [Status changed to "Owner Found"] Cameron Crane & Riggers - +15196527000- Name is Ray Cameron. ray@cameroncrane.net. He is the Property owne
- [tower 50600] [Status changed to "Determining Owner (Calls)"] Behind Cranes Legacy - +1 709-638-5138 No ONX (No red line); Behind Cranes legacy
- [tower 20320] Mobil Tech Fleet Services; Cameron Crane & Riggers
- [tower 20444] Likely located in a commercial area: Double D Crane Service Inc. - +19056396169 Halton Hydraulics Ltd - +19053358411 Relaxacare Inc- Largest
- [tower 50600] Cranes Legacy - +1 709-638-5138- Rick Crane owner of the property - said someone is managing it for him. Not interested

**`removed`**

- [tower 18333] Galilee Auto Sales ltd. - +12047276493- Said they own the property, they are not interested and wants to be removed in our system
- [tower 49669] Elsipogtog Fitness Center - +15065238414- Spoke to the owner and said the Water tank is no longer in the property and was already removed, a
- [tower 47879] Stoneybrook Apartments - +19024434827- spoke to the manager and said the panels were already removed. no panels are in the building anymore,
- [tower 53744] 6494 spoke to a man he said wrong number and requested to removed his phone #

### Positive-status towers (proposed `tower`) — 3929 notes, samples:

- [tower 20321, Determining Owner (Calls)] City Storage Group - +15196012633; Mastermind Toys - +15196418697; Dulux Paints - +15196600533; North London Dental - +15194726600; Allstate
- [tower 20727, Determining Owner (Calls)] On Side Restoration Services- +17057357519- ext. 0 for team member- recep said just a worker and not sure about the property owner. Tried to
- [tower 48471, Determining Owner (Calls)] [Status changed to "Determining Owner (Calls)"] Nearby St. George’s Channel Hall - 902-345-2200 Drinking water source - +4932121023194
- [tower 20591, Determining Owner (Calls)] York Region Southeast District Road Maintenance Facility +18774649675
- [tower 49820, Determining Owner (Calls)] [Status changed to "Determining Owner (Calls)"] Likely nearby Green Appeal Property Care - +15062605118 Doucette's U-Pick Apple Orchard - +1
- [tower 50048, Determining Owner (Calls)] Not quite sure where the CT is, not visible in GSV within the business proper. But a tower is visible only not in the property it is tagged
- [tower 18293, Determining Owner (Calls)] [Status changed to "Determining Owner (Calls)"] Try calling Esso - +12048272262 Spruce Woods Inn -+12048272648
- [tower 50320, Determining Owner (Calls)] Linda Northrup- 5062925559- Spoke to Linda, and said her husband is sleeping, give a call back at 4PM her time.
- [tower 20527, Owner Found] 9055288600- Call this number instead- Said to call us when they get hold of the property Manager.
- [tower 48101, Email Follow Up] [Status changed to "Determining Owner (Calls)"] Cell panels are mounted on the church Saint Margaret of Scotland - +19024552451
- [tower 50536, Determining Owner (Calls)] Western Regional School of Nursing - +17097845489- Voicemail
- [tower 47948, REIT Managed] Cabot House- +19025625666- Spoke to bill and said he manages the property, email is bill.mcneil@killamreit.com
- [tower 47948, REIT Managed] [Status changed to "Determining Owner (Calls)"] Cell panels are mounted on the building Georgie's Hair Design Ltd - +19025625515
- [tower 18651, Determining Owner (Calls)] [Status changed to "Determining Owner (Calls)"] nearby Saint John Paul II Roman Catholic Church - +12042689020
- [tower 50920, Determining Owner (Calls)] Newfoundland and Labrador Legal Aid Commission - +17097537860 ext. 0- receptionist- They are just a tenant. Based on the signage- Lansing Pr
- [tower 18534, Determining Owner (Calls)] [Status changed to "Determining Owner (Calls)"] Nearby Matrix Financial Services - +12043040354 Rhineland Municipality - +12043245357 Access
- [tower 18403, Email Follow Up] Parkside Plaza - +12049403493- Spoke to Carol, said to call the head office of Edison Properties, and look for Freda - head office number 20
- [tower 20207, Determining Owner (Calls)] Panels are mounted on the building Yee Hong Community Wellness Foundation - +14163210777 Kikit Li Rehab Ctr - +14169404801 Yee Hong Peter K.
- [tower 20499, Determining Owner (Calls)] Viau Interlocking and Landscaping - +16135518769- No idea who owns the property Stoneridge Boarding Kennel - +16135284912- Voicemail Horizon
- [tower 51222, Email Follow Up] [Status changed to "Email Follow Up"] Email sent to goldrushinn@yukonhotels.com

### Ambiguous statuses (1, 2, 4, 6, 16) — 1446 notes, samples:

- [tower 47359, Duplicate Tower] [Status changed to "No nearby property"] Far from GSV
- [tower 48376, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #48086
- [tower 20716, Not Interested] Perth Ave Housing Coop - 1-416-588-6810 Rellavision Entertainment Agency - No # registered on maps
- [tower 20613, Could Not Find Owner (Calls)] [Status changed to "Could Not Find Owner (Calls)"] CDO
- [tower 49267, Duplicate Tower] [Status changed to "No GSV"] Duplicated with Line #63 - ARS Rolling stock
- [tower 48377, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #48233
- [tower 50002, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #49196
- [tower 18425, Could Not Find Owner (Calls)] [Status changed to "Determining Owner (Calls)"] Nearby Ag Advantage Ltd (Oakbank) - +12044445052
- [tower 49521, Duplicate Tower] [Status changed to "Determining Owner (Calls)"] With guyed and lattice tower
- [tower 49964, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #49336
- [tower 48714, No nearby property] [Status changed to "No nearby property"] Nearby Eastern Dairy Services Ltd - +19027583898 Bokma Farms - +19027510003
- [tower 50296, Duplicate Tower] [Status changed to "Determining Owner (Calls)"] Far from GSV But you may try calling Coldwell Banker Global Luxury - +15066508575
- [tower 48466, Duplicate Tower] [Status changed to "Duplicate Tower"] Duplicate for https://tower-finder.vercel.app/towers/48288
- [tower 49245, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #49796
- [tower 49305, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #49729
- [tower 50737, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #50501
- [tower 19650, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #18492
- [tower 20683, Could Not Find Owner (Calls)] [Status changed to "Determining Owner (Calls)"] Try to reach Pete's Towing for Info
- [tower 48019, No nearby property] [Status changed to "No nearby property"] Far from GSV
- [tower 19210, Duplicate Tower] [Status changed to "Duplicate Tower"] Tower #18399

### Proposed-rule class totals

- `tower` (positive statuses): **1902**
- `not_tower` (status "No GSV" ∪ negative-pattern note): **2520**
- conflicted (positive status but negative note): 32
- promoted leads (lead-native positives): 6

## 2. Feature availability (common feature space)

### `Tower.rawImportData` keys across the 4422 labeled towers

| key | present | % |
|---|---|---|
| Pri | 102 | 2.3% |
| City | 102 | 2.3% |
| Owner | 102 | 2.3% |
| Phone | 102 | 2.3% |
| State | 102 | 2.3% |
| County | 102 | 2.3% |
| LS Expn | 102 | 2.3% |
| Misc MM | 102 | 2.3% |
| Recount | 102 | 2.3% |
| Latitude | 102 | 2.3% |
| Location | 102 | 2.3% |
| Longitude | 102 | 2.3% |
| __EMPTY_5 | 102 | 2.3% |
| aag202512 | 102 | 2.3% |
| StructureType | 102 | 2.3% |
| Tower # | 101 | 2.3% |
| Parcel ID | 100 | 2.3% |
| Brett Notes | 100 | 2.3% |
| Address Ownr | 100 | 2.3% |
| Height | 99 | 2.2% |
| BTAName | 99 | 2.2% |
| MTAName | 99 | 2.2% |
| TowerOwner | 98 | 2.2% |
| Title | 97 | 2.2% |
| # Users | 97 | 2.2% |

### `TowerLead.tags` keys — source OpenStreetMap (10289 leads)

| key | present | % |
|---|---|---|
| man_made | 10289 | 100.0% |
| tower:type | 9516 | 92.5% |
| tower:construction | 3794 | 36.9% |
| communication:mobile_phone | 3341 | 32.5% |
| source | 1458 | 14.2% |
| name | 582 | 5.7% |
| height | 534 | 5.2% |
| ele | 503 | 4.9% |
| gnis:feature_id | 394 | 3.8% |
| communication:radio | 368 | 3.6% |
| addr:street | 333 | 3.2% |
| addr:housenumber | 333 | 3.2% |
| addr:state | 306 | 3.0% |
| addr:postcode | 248 | 2.4% |
| highway | 239 | 2.3% |
| direction | 196 | 1.9% |
| lamp_mount | 187 | 1.8% |
| support | 157 | 1.5% |
| operator | 151 | 1.5% |
| addr:city | 146 | 1.4% |

### `TowerLead.tags` keys — source ARCGIS_CT (424 leads)

| key | present | % |
|---|---|---|
| LocAdd | 424 | 100.0% |
| latdec | 424 | 100.0% |
| londec | 424 | 100.0% |
| LocCity | 424 | 100.0% |
| Callsign | 424 | 100.0% |
| Licensee | 424 | 100.0% |
| LocState | 424 | 100.0% |
| LocCounty | 424 | 100.0% |
| StrucType | 424 | 100.0% |

### `TowerLead.tags` keys — source FAA_DDOF (5442 leads)

| key | present | % |
|---|---|---|
| AGL | 5442 | 100.0% |
| OAS | 5442 | 100.0% |
| AMSL | 5442 | 100.0% |
| CITY | 5442 | 100.0% |
| TYPE | 5442 | 100.0% |
| JDATE | 5442 | 100.0% |
| STATE | 5442 | 100.0% |
| ACTION | 5442 | 100.0% |
| DMSLAT | 5442 | 100.0% |
| DMSLON | 5442 | 100.0% |
| LATDEC | 5442 | 100.0% |
| LONDEC | 5442 | 100.0% |
| COUNTRY | 5442 | 100.0% |
| MARKING | 5442 | 100.0% |
| ACCURACY | 5442 | 100.0% |
| LIGHTING | 5442 | 100.0% |
| QUANTITY | 5442 | 100.0% |
| FAA STUDY | 5442 | 100.0% |
| VERIFIED STATUS | 5442 | 100.0% |

## 3. Lead ↔ tower spatial join

| lead group | n | distance to nearest confirmed tower |
|---|---|---|
| OpenStreetMap / Indiana | 5535 | 0.1% ≤100m · 0.1% ≤250m · 0.1% ≤500m · 0.1% ≤1000m · 0.3% ≤2000m |
| FAA_DDOF / CA | 3827 | 0.0% ≤100m · 0.8% ≤250m · 1.1% ≤500m · 1.2% ≤1000m · 3.0% ≤2000m |
| OpenStreetMap / Colorado | 2821 | 0.1% ≤100m · 0.1% ≤250m · 0.1% ≤500m · 0.2% ≤1000m · 0.5% ≤2000m |
| OpenStreetMap / Alberta | 1933 | 30.9% ≤100m · 40.6% ≤250m · 52.8% ≤500m · 61.4% ≤1000m · 71.7% ≤2000m |
| FAA_DDOF / NY | 1615 | 0.0% ≤100m · 0.0% ≤250m · 0.0% ≤500m · 0.0% ≤1000m · 0.0% ≤2000m |

Distance to nearest *other* confirmed tower, for labeled towers:

- `tower` class (n=1902): 41.0% ≤100m · 55.9% ≤250m · 70.7% ≤500m · 80.0% ≤1000m · 85.5% ≤2000m
- `not_tower` class (n=2000): 23.8% ≤100m · 42.0% ≤250m · 60.8% ≤500m · 71.8% ≤1000m · 80.2% ≤2000m

## 4. Geography overlap (domain shift)

Towers carry no province column; the Excel source file name is the region proxy.

| tower source file | total | labeled tower | labeled not_tower |
|---|---|---|---|
| 5. Ontario_Jan12.xlsx | 16239 | 490 | 385 |
| 6. Quebec_Jan11.xlsx | 10910 | 0 | 1 |
| 1. BC_Jan11.xlsx | 10879 | 9 | 7 |
| 2. Alberta_Jan11.xlsx | 5246 | 38 | 22 |
| 7. East Coast (PEI, NS, NB, NFLD)_Jan11.xlsx | 3884 | 956 | 1767 |
| 3. Saskatchewan_Jan11.xlsx | 2143 | 0 | 0 |
| 4. Manitoba_Jan11.xlsx | 1863 | 238 | 176 |
| 8. NorthWest_Yukon_Nunavut_Jan11.xlsx | 243 | 72 | 159 |
| markslist | 103 | 99 | 3 |
| field | 6 | 0 | 0 |
| Tower Leads - OpenStreetMap | 6 | 0 | 0 |

| lead province | leads |
|---|---|
| Indiana | 5537 |
| CA | 3827 |
| Colorado | 2839 |
| Alberta | 1933 |
| NY | 1615 |
| California | 45 |
| Florida | 44 |
| Alaska | 27 |
| New York | 27 |
| Wisconsin | 18 |
| Wyoming | 15 |
| Illinois | 14 |
| Virginia | 13 |
| Washington | 12 |
| West Virginia | 12 |
| Arizona | 9 |
| Idaho | 9 |
| North Carolina | 9 |
| Vermont | 9 |
| Iowa | 9 |
| Massachusetts | 9 |
| New Hampshire | 9 |
| Hawaii | 8 |
| Michigan | 7 |
| Minnesota | 7 |
| Nevada | 7 |
| Connecticut | 6 |
| Maine | 6 |
| Oregon | 6 |
| Texas | 6 |
| New Jersey | 5 |
| New Mexico | 5 |
| Pennsylvania | 4 |
| Georgia | 4 |
| Missouri | 4 |
| Montana | 4 |
| Utah | 4 |
| Alabama | 3 |
| Kansas | 3 |
| Louisiana | 3 |
| Maryland | 3 |
| Oklahoma | 3 |
| Rhode Island | 3 |
| South Dakota | 3 |
| Ohio | 2 |
| Nebraska | 2 |
| District of Columbia | 2 |
| Arkansas | 1 |
| Kentucky | 1 |
| Mississippi | 1 |
| North Dakota | 1 |

## 5. Proposed labeling rule (cleaned after sampling)

Sampling showed the broad note patterns are unsafe: `water tower`, `crane`, `grain`,
`silo`, `removed` mostly match **real cell sites** ("Water Tower with panels
mounted", businesses literally named "Crane"). Only `no cell*` and `no tower`
read reliably as human "not a tower" verdicts. The cleaned rule:

- **`not_tower`** — status "No GSV" (9) **or** a note containing `no cell` /
  `no tower` / `not a tower` → **2,497 towers** (2,151 via status, 346 note-only).
  - High-confidence tier: the 211 "No GSV" towers whose note explicitly says
    no cell equipment, plus the 346 note-only ones (~557 total).
  - Medium tier: "No GSV" without an explanatory note (~1,940) — sampled notes
    consistently read "no cell panels/towers visible", so the status alone is
    acceptable, with the caveat that a few may mean "no Street View coverage".
- **`tower`** — statuses 3, 5, 10, 11, 12, 13, 14, 15, 17 (Determining Owner,
  In Progress, Owner Found, REIT Managed, Bell Alian, Brett to Contact,
  Email Follow Up, Compact cellular on poles) → **1,902 towers**.
- **Excluded** — null status (35,080), New (10,693), Duplicate Tower (746),
  No nearby property (822, mixed semantics), Could Not Find Owner (64),
  Not Interested (64; these are *business* outcomes, not tower-existence verdicts),
  and the 16 conflicted towers (positive status + negative note).

Both classes clear the "hundreds per class" bar by a wide margin.

## 6. Go/no-go recommendation

**Labels: GO. Direct transfer to lead scoring: NO-GO. Recommended path: collect
lead-native labels first (the plan's fallback), with two backfills.**

The blocker is not label volume — it is that **labels and features never
co-occur**:

1. **Labeled towers have no structured features.** Only 102 of 4,399 labeled
   towers (2.3%) carry `rawImportData` attributes (height, structure type…).
   The labeled set offers essentially lat/lon + status + free-text notes.
2. **Leads have features but no labels.** FAA/ARCGIS/OSM leads carry rich,
   per-source tag schemas (AGL/MARKING/LIGHTING; StrucType/Licensee;
   man_made/tower:type) — but ~0 human verdicts.
3. **The only shared features are location-derived, and they are dominated by
   database-coverage artifacts, not reality.** Labeled towers are ~all Canada
   (East Coast 2,723, Ontario 875, Manitoba 414…); leads are ~86% US. US leads
   show ~0% proximity to confirmed towers simply because the tower DB has no US
   coverage (vs. Alberta leads: 31% within 100 m). Even in-domain, the
   tower-class vs not_tower-class proximity distributions barely separate
   (41% vs 24% ≤100 m).

A classifier trained on Canadian tower labels with location-only features would
learn "Canada = tower, US = not" — worse than useless for ranking the CA/NY/
Indiana/Colorado lead queues.

**Recommended next phase** (revised Phase 1):

1. Schema fields from the original plan (`reviewed`, `reviewedAt`, `humanLabel`,
   `aiTowerScore`, `aiLabel`, `aiClassifiedAt`, `aiModelVersion`).
2. **"Not a tower" discard button** in the review UI + discard API — every
   review action from then on produces a clean, lead-native label.
3. Backfill positives: the 6 promoted leads, plus Alberta OSM leads within
   ~100 m of a confirmed tower (~597) as `tower` with a provenance marker
   (`labelSource = "spatial_match"`), so training data starts non-empty.
4. Optional interim ranking without ML: a transparent heuristic prior from
   per-source tags (e.g. OSM `communication:mobile_phone=yes`,
   FAA `TYPE`/`MARKING` values) to order the queue until enough human labels
   accumulate to train the real classifier (Phases 2-3 of the original plan).

Retraining trigger: revisit training once discard/promote actions reach roughly
several hundred labels per class **within the lead population itself**.

## 7. Addendum (2026-06-11): implemented as a tower-side classifier

User decision after this report: use the existing Tower labels now rather than
waiting on lead-native collection. The classifier targets the **47,139
unreviewed towers** (statusId null or "New") — in-domain, no geography shift.
Feature probe added `businessCount` (100% coverage, median 20 pos vs 5 neg) and
`avgBusinessDistance`; `typeId` was found to be review-outcome leakage and
excluded.

Training results (`rf-v1-2026-06-11`, random forest 80×depth-8, 3,494 train /
873 held-out rows):

- **AUC 0.716** — passes the agreed ship gate (≥ 0.7).
- precision 0.676 / recall 0.443 at threshold 0.5 (threshold matters little;
  the product is the *ranking*).
- Top features by permutation importance: log nearest-tower distance (+0.032),
  lat (+0.031), businessCount (+0.016), lon (+0.013), avgBusinessDistance
  (+0.010). No leakage features present by construction.

Retrain loop: `scripts/backfill-tower-labels.ts` → `scripts/train-tower-classifier.ts`
→ `scripts/score-towers.ts` (all `npx tsx --env-file=.env ...`).

