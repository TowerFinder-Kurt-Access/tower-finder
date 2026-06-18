import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

// Actual map names from ihunterapp.com as of June 2026
const IHUNTER_AB = new Set([
  'MD of Acadia', 'Athabasca County', 'County of Barrhead', 'Beaver County',
  'Big Lakes County', 'MD of Bighorn', 'Birch Hills County', 'MD of Bonnyville',
  'Brazeau County', 'Camrose County', 'Cardston County', 'Clear Hills County (South)',
  'Clearwater County', 'Crowsnest Pass', 'Cypress County', 'MD of Fairview',
  'Flagstaff County', 'MD of Foothills', 'County of Forty Mile', 'County of Grande Prairie',
  'MD of Greenview', 'Kananaskis Improvement District', 'Kneehill County',
  'Lac La Biche County', 'Lac Ste Anne County', 'Lacombe County', 'Lamont County',
  'Leduc County', 'MD of Lesser Slave River', 'Lethbridge County', 'Mackenzie County',
  'County of Minburn', 'Mountain View County', 'County of Newell', 'County of Northern Lights',
  'Northern Sunrise County', 'County of Paintearth', 'Parkland County', 'MD of Peace',
  'MD of Pincher Creek', 'Ponoka County', 'MD of Provost', 'MD of Ranchland',
  'Red Deer County', 'Rocky View County', 'Saddle Hills County', 'Smoky Lake County',
  'MD of Smoky River', 'Special Area No. 2', 'Special Area No. 3', 'Special Area No. 4',
  'MD of Spirit River', 'County of St Paul', 'Starland County', 'County of Stettler',
  'Strathcona County', 'Sturgeon County', 'MD of Taber', 'Thorhild County',
  'County of Two Hills', 'County of Vermilion River', 'Vulcan County', 'MD of Wainwright',
  'County of Warner', 'Westlock County', 'County of Wetaskiwin', 'Wheatland County',
  'MD of Willow Creek', 'Woodlands County', 'Yellowhead County',
]);

const IHUNTER_SK = new Set([
  'RM of Aberdeen', 'RM of Abernethy', 'RM of Antelope Park', 'RM of Antler',
  'RM of Arborfield', 'RM of Argyle', 'RM of Arlington', 'RM of Arm River',
  'RM of Auvergne', 'RM of Baildon', 'RM of Barrier Valley', 'RM of Battle River',
  'RM of Bayne', 'RM of Beaver River', 'RM of Bengough', 'RM of Benson',
  'RM of Biggar', 'RM of Big Stick', 'RM of Big Arm', 'RM of Big Quill',
  'RM of Birch Hills', 'RM of Blaine Lake', 'RM of Blucher', 'RM of Bone Creek',
  'RM of Bratt\'s Lake', 'RM of Brock', 'RM of Brokenshell', 'RM of Browning',
  'RM of Buchanan', 'RM of Buckland', 'RM of Buffalo', 'RM of Calder',
  'RM of Caledonia', 'RM of Cambria', 'RM of Cana', 'RM of Canaan',
  'RM of Canwood', 'RM of Carmichael', 'RM of Caron', 'RM of Chaplin',
  'RM of Chester', 'RM of Chesterfield', 'RM of Clayton', 'RM of Clinworth',
  'RM of Coalfields', 'RM of Colonsay', 'RM of Connaught', 'RM of Corman Park',
  'RM of Cote', 'RM of Coteau', 'RM of Coulee', 'RM of Craik', 'RM of Cupar',
  'RM of Cut Knife', 'RM of Cymri', 'RM of Deer Forks', 'RM of Duck Lake',
  'RM of Dufferin', 'RM of Dundurn', 'RM of Eagle Creek', 'RM of Edenwold',
  'RM of Elcapo', 'RM of Eldon', 'RM of Elfros', 'RM of Elmsthorpe',
  'RM of Emerald', 'RM of Enfield', 'RM of Enniskillen', 'RM of Enterprise',
  'RM of Estevan', 'RM of Excel', 'RM of Excelsior', 'RM of Eyebrow',
  'RM of Eye Hill', 'RM of Fertile Valley', 'RM of Fertile Belt', 'RM of Fillmore',
  'RM of Fish Creek', 'RM of Flett\'s Springs', 'RM of Foam Lake', 'RM of Fox Valley',
  'RM of Francis', 'RM of Frenchman Butte', 'RM of Frontier', 'RM of Garden River',
  'RM of Garry', 'RM of Glenside', 'RM of Glen Bain', 'RM of Glen McPherson',
  'RM of Golden West', 'RM of Good Lake', 'RM of Grandview', 'RM of Grant',
  'RM of Grassy Creek', 'RM of Grass lake', 'RM of Gravelbourg', 'RM of Grayson',
  'RM of Great Bend', 'RM of Griffin', 'RM of Gull Lake', 'RM of Happyland',
  'RM of Happy Valley', 'RM of Harris', 'RM of Hart Butte', 'RM of Hazel Dell',
  'RM of Hazelwood', 'RM of Heart\'s Hill', 'RM of Hillsborough', 'RM of Hillsdale',
  'RM of Hoodoo', 'RM of Hudson Bay', 'RM of Humboldt', 'RM of Huron',
  'RM of Indian Head', 'RM of Insinger', 'RM of Invergordon', 'RM of Invermay',
  'RM of Ituna Bon Accord', 'RM of Kellross', 'RM of Kelvington', 'RM of Keys',
  'RM of Key West', 'RM of Kindersley', 'RM of King George', 'RM of Kingsley',
  'RM of Kinistino', 'RM of Lac Pelletier', 'RM of Lacadena', 'RM of Laird',
  'RM of Lajord', 'RM of Lake Alma', 'RM of Lake Johnston', 'RM of Lake Lenore',
  'RM of Lake of the Rivers', 'RM of Lakeside', 'RM of Lakeview', 'RM of Langenburg',
  'RM of Last Mountain Valley', 'RM of Laurier', 'RM of Lawtonia', 'RM of Leask',
  'RM of LeRoy', 'RM of Lipton', 'RM of Livingston', 'RM of Lomond',
  'RM of Longlaketon', 'RM of Loon Lake', 'RM of Loreburn', 'RM of Lumsden',
  'RM of Manitou Lake', 'RM of Mankota', 'RM of Maple Bush', 'RM of Maple Creek',
  'RM of Mariposa', 'RM of Marquis', 'RM of Marriott', 'RM of Martin',
  'RM of Maryfield', 'RM of Mayfield', 'RM of McCraney', 'RM of McKillop',
  'RM of McLeod', 'RM of Meadow Lake', 'RM of Medstead', 'RM of Meeting Lake',
  'RM of Meota', 'RM of Milden', 'RM of Milton', 'RM of Miry Creek',
  'RM of Monet', 'RM of Montmartre', 'RM of Montrose', 'RM of Moose Creek',
  'RM of Moose Jaw', 'RM of Moose Mountain', 'RM of Moosomin', 'RM of Morse',
  'RM of Mount Hope', 'RM of Mount Pleasant', 'RM of Mountain View', 'RM of Newcombe',
  'RM of Nipawin', 'RM of North Battleford', 'RM of North Qu\'Appelle', 'RM of Norton',
  'RM of Oakdale', 'RM of Old Post', 'RM of Orkney', 'RM of Paddockwood',
  'RM of Parkdale', 'RM of Paynton', 'RM of Pense', 'RM of Perdue',
  'RM of Piapot', 'RM of Pinto Creek', 'RM of Pittville', 'RM of Pleasantdale',
  'RM of Pleasant Valley', 'RM of Ponass Lake', 'RM of Poplar Valley', 'RM of Porcupine',
  'RM of Prairiedale', 'RM of Prairie Rose', 'RM of Preeceville', 'RM of Prince Albert',
  'RM of Progress', 'RM of Reciprocity', 'RM of Redburn', 'RM of Reford',
  'RM of Reno', 'RM of Riverside', 'RM of Rocanville', 'RM of Rodgers',
  'RM of Rosedale', 'RM of Rosemount', 'RM of Round Hill', 'RM of Round Valley',
  'RM of Rosthern', 'RM of Rudy', 'RM of Saltcoats', 'RM of Sarnia',
  'RM of Saskatchewan Landing', 'RM of Sasman', 'RM of Scott', 'RM of Senlac',
  'RM of Shamrock', 'RM of Shellbrook', 'RM of Sherwood', 'RM of Silverwood',
  'RM of Sliding Hills', 'RM of Snipe Lake', 'RM of Souris Valley', 'RM of South Qu\'Appelle',
  'RM of Spalding', 'RM of Spiritwood', 'RM of Spy Hill', 'RM of St. Andrews',
  'RM of St. Louis', 'RM of St. Peter', 'RM of St. Philips', 'RM of Stanley',
  'RM of Star City', 'RM of Stonehenge', 'RM of Storthoaks', 'RM of Surprise Valley',
  'RM of Sutton', 'RM of Swift Current', 'RM of Tecumseh', 'RM of Terrell',
  'RM of The Gap', 'RM of The Scott', 'RM of Three Lakes', 'RM of Tisdale',
  'RM of Torch River', 'RM of Touchwood', 'RM of Tramping Lake', 'RM of Tullymet',
  'RM of Turtle River', 'RM of Usborne', 'RM of Val Marie', 'RM of Vanscoy',
  'RM of Victory', 'RM of Viscount', 'RM of Wallace', 'RM of Walpole',
  'RM of Waverley', 'RM of Wawken', 'RM of Webb', 'RM of Wellington',
  'RM of Weyburn', 'RM of Wheatlands', 'RM of Whiska Creek', 'RM of White Valley',
  'RM of Willner', 'RM of Willow Bunch', 'RM of Willow Creek', 'RM of Willowdale',
  'RM of Winslow', 'RM of Wilton', 'RM of Wise Creek', 'RM of Wolverine',
  'RM of Wood Creek', 'RM of Wood River', 'RM of Wreford',
]);

const IHUNTER_MB = new Set([
  'RM of Alonsa', 'RM of Argyle', 'RM of Armstrong', 'Municipality of Boissevain-Morton',
  'Municipality of Brenda-Waskada', 'RM of Brokenhead', 'RM of Cartier',
  'Cartwright-Roblin Municipality', 'Municipality of Clanwilliam-Erickson', 'RM of Coldwell',
  'RM of Cornwallis', 'RM of Dauphin', 'RM of De Salaberry',
  'Municipality of Deloraine-Winchester', 'RM of Dufferin', 'RM of Ellice-Archie',
  'RM of Elton', 'Municipality of Emerson-Franklin', 'Municipality of Ethelbert',
  'RM of Fisher', 'RM of Gilbert Plains', 'RM of Gimli',
  'Municipality of Glenboro-South Cypress', 'Municipality of Glenella-Lansdowne',
  'Grandview Municipality', 'Municipality of Grassland', 'RM of Grey', 'Hamiota Municipality',
  'RM of Hanover', 'Municipality of Harrison Park', 'RM of Kelsey',
  'Municipality of Killarney-Turtle Mountain', 'RM of La Broquerie', 'RM of Lakeshore',
  'Municipality of Lorne', 'Municipality of Louise', 'RM of Macdonald',
  'Municipality of Mccreary', 'Municipality of Minitonas-Bowsman', 'RM of Minto-Odanah',
  'RM of Montcalm', 'RM of Morris', 'Mossey River Municipality', 'RM of Mountain',
  'Municipality of Norfolk Treherne', 'Municipality of North Cypress-Langford',
  'Municipality of North Norfolk', 'Municipality of Oakland-Wawanesa', 'RM of Oakview',
  'Municipality of Pembina', 'RM of Piney', 'RM of Pipestone', 'RM of Portage La Prairie',
  'RM of Prairie Lakes', 'Prairie View Municipality', 'RM of Reynolds',
  'Municipality of Rhineland', 'RM of Riding Mountain West', 'Riverdale Municipality',
  'Municipality of Roblin', 'RM of Roland', 'RM of Rosedale', 'Rossburn Municipality',
  'RM of Rosser', 'Municipality of Russell-Binscarth', 'Municipality of Souris-Glenwood',
  'RM of St. Francois Xavier', 'RM of St. Laurent', 'RM of Stanley', 'RM of Sifton',
  'RM of Ste. Anne', 'Municipality of Ste. Rose', 'RM of Stuartburn',
  'Municipality of Swan Valley West', 'RM of Thompson', 'Municipality of Two Borders',
  'RM of Victoria', 'RM of Wallace-Woodworth', 'RM of West Interlake',
  'Municipality of Westlake-Gladstone', 'RM of Whitehead', 'RM of Woodlands',
  'RM of Yellowhead',
]);

// Normalize a name for fuzzy matching
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bno\.\s*\d+\b/g, '')        // remove "No. 344"
    .replace(/\b(rm|md|municipality|county|rural municipality) of\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatch(dbName: string, ihunterSet: Set<string>): string | null {
  // 1. Exact match
  if (ihunterSet.has(dbName)) return dbName;

  const dbNorm = normalize(dbName);

  for (const mapName of ihunterSet) {
    const mapNorm = normalize(mapName);
    if (dbNorm === mapNorm) return mapName;
    // One contains the other
    if (dbNorm.length > 3 && mapNorm.includes(dbNorm)) return mapName;
    if (mapNorm.length > 3 && dbNorm.includes(mapNorm)) return mapName;
  }
  return null;
}

async function main() {
  const rows = await prisma.$queryRaw<{ province: string; city: string; tower_count: bigint }[]>`
    SELECT
      p."provinceRaw" as province,
      p."cityRaw"     as city,
      COUNT(*)        as tower_count
    FROM "Tower" t
    JOIN "Parcel" p ON p."towerId" = t.id
    WHERE p."provinceRaw" IN ('AB', 'SK', 'MB')
      AND p."cityRaw" IS NOT NULL
    GROUP BY p."provinceRaw", p."cityRaw"
    ORDER BY p."provinceRaw", tower_count DESC
  `;

  const ihunterByProvince: Record<string, Set<string>> = {
    AB: IHUNTER_AB, SK: IHUNTER_SK, MB: IHUNTER_MB,
  };

  const data = rows.map(r => {
    const ihunterSet = ihunterByProvince[r.province];
    const match = ihunterSet ? findMatch(r.city, ihunterSet) : null;
    return {
      Province:           r.province,
      Your_DB_Name:       r.city,
      iHunter_Map_Name:   match ?? '—',
      Map_Available:      match ? 'Yes' : 'No',
      Tower_Count:        Number(r.tower_count),
      iHunter_Price:      r.province === 'AB' ? '$9.99–$30.99'
                        : r.province === 'SK' ? '$14.99–$21.99'
                        : '$14.99–$39.99',
      Priority:           !match                        ? 'No map'
                        : Number(r.tower_count) >= 50  ? '🔴 High'
                        : Number(r.tower_count) >= 20  ? '🟡 Medium'
                        : '⚪ Low',
    };
  });

  const wb = XLSX.utils.book_new();

  // Sheet 1 — All (verified)
  const wsAll = XLSX.utils.json_to_sheet(data);
  wsAll['!cols'] = [
    { wch: 10 }, { wch: 45 }, { wch: 45 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, 'All Counties');

  // Sheet 2 — Confirmed available maps, 20+ towers
  const priority = data.filter(r => r.Map_Available === 'Yes' && r.Tower_Count >= 20);
  const wsPriority = XLSX.utils.json_to_sheet(priority);
  wsPriority['!cols'] = [
    { wch: 10 }, { wch: 45 }, { wch: 45 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPriority, 'Priority Buys (confirmed)');

  // Sheet 3 — No iHunter map found
  const noMap = data.filter(r => r.Map_Available === 'No').sort((a, b) => b.Tower_Count - a.Tower_Count);
  const wsNoMap = XLSX.utils.json_to_sheet(noMap);
  wsNoMap['!cols'] = [
    { wch: 10 }, { wch: 45 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsNoMap, 'No Map Available');

  // Sheet 4 — Summary
  const summary = ['AB', 'SK', 'MB'].map(prov => {
    const provRows = data.filter(r => r.Province === prov);
    const withMap  = provRows.filter(r => r.Map_Available === 'Yes');
    return {
      Province:            prov,
      Total_Areas:         provRows.length,
      Has_iHunter_Map:     withMap.length,
      No_Map:              provRows.length - withMap.length,
      Total_Towers:        provRows.reduce((s, r) => s + r.Tower_Count, 0),
      Towers_With_Map:     withMap.reduce((s, r) => s + r.Tower_Count, 0),
      High_Priority:       withMap.filter(r => r.Tower_Count >= 50).length,
      Medium_Priority:     withMap.filter(r => r.Tower_Count >= 20 && r.Tower_Count < 50).length,
    };
  });
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  wsSummary['!cols'] = Array(8).fill({ wch: 20 });
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const outPath = path.join(process.cwd(), 'ihunter_county_analysis.xlsx');
  XLSX.writeFile(wb, outPath);

  const confirmed = data.filter(r => r.Map_Available === 'Yes');
  const notFound  = data.filter(r => r.Map_Available === 'No');
  console.log(`\nSaved: ${outPath}`);
  console.log(`Confirmed map available: ${confirmed.length} areas (${confirmed.reduce((s,r) => s + r.Tower_Count, 0)} towers)`);
  console.log(`No map found:            ${notFound.length} areas (${notFound.reduce((s,r) => s + r.Tower_Count, 0)} towers)`);
  console.log(`Priority buys (20+):     ${priority.length} maps`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
