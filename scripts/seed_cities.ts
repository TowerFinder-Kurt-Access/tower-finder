import fs from 'fs';
import path from 'path';

const ODA_DIR = 'sources/addresses data';
const OUTPUT_FILE = 'src/lib/canadian_cities.json';

// A subset of official cities for key provinces to ensure normalization works
// This acts as a fallback and seed for the normalization service.
const SEED_CITIES: Record<string, string[]> = {
  "ON": ["Toronto", "Ottawa", "Mississauga", "Brampton", "Hamilton", "London", "Markham", "Vaughan", "Kitchener", "Windsor", "Richmond Hill", "Oakville", "Burlington", "Greater Sudbury", "Oshawa", "Barrie", "St. Catharines", "Cambridge", "Kingston", "Guelph", "Whitby", "Thunder Bay", "Waterloo", "Chatham-Kent", "Pickering", "Clarington", "Belleville", "Sarnia", "Newmarket", "Kawartha Lakes", "Halton Hills", "Sault Ste. Marie", "Welland", "North Bay", "Cornwall", "Caledon", "Quinte West", "Aurora", "Timmins", "St. Thomas", "Woodstock", "Brantford", "Stratford", "Orillia", "Orangeville", "Georgina", "Whitchurch-Stouffville", "Haldimand County", "Norfolk County", "Innisfil"],
  "BC": ["Vancouver", "Surrey", "Burnaby", "Richmond", "Abbotsford", "Coquitlam", "Kelowna", "Langley", "Saanich", "Delta", "Nanaimo", "Maple Ridge", "Kamloops", "Victoria", "New Westminster", "Chilliwack", "North Vancouver", "Vernon", "Prince George", "Courtenay", "Langford", "Penticton", "Port Coquitlam", "Campbell River", "West Kelowna", "Mission", "Nanaimo", "White Rock", "Cranbrook", "Oak Bay", "Esquimalt", "Colwood", "Squamish", "Port Moody"],
  "AB": ["Calgary", "Edmonton", "Red Deer", "Lethbridge", "Strathcona County", "St. Albert", "Medicine Hat", "Wood Buffalo", "Grande Prairie", "Airdrie", "Spruce Grove", "Leduc", "Cochrane", "Okotoks", "Fort Saskatchewan", "Chestermere", "Beaumont", "Lloydminster", "Camrose", "Stony Plain", "Brooks", "Canmore", "High River", "Sylvan Lake", "Wetaskiwin", "Lacombe"],
  "QC": ["Montreal", "Quebec City", "Laval", "Gatineau", "Longueuil", "Sherbrooke", "Saguenay", "Levis", "Trois-Rivieres", "Terrebonne", "Saint-Jean-sur-Richelieu", "Repentigny", "Brossard", "Drummondville", "Saint-Jerome", "Granby", "Blainville", "Saint-Hyacinthe", "Dollard-des-Ormeaux", "Mirabel", "Rimouski", "Shawinigan", "Chateauguay", "Mascouche", "Victoriaville", "Sorel-Tracy", "Saint-Eustache", "Boucherville", "Salaberry-de-Valleyfield", "Vaudreuil-Dorion", "Val-d'Or"],
  "MB": ["Winnipeg", "Brandon", "Steinbach", "Thompson", "Portage la Prairie", "Winkler", "Selkirk", "Morden", "Dauphin", "Flin Flon", "The Pas"],
  "SK": ["Saskatoon", "Regina", "Prince Albert", "Moose Jaw", "Swift Current", "Yorkton", "North Battleford", "Estevan", "Warman", "Weyburn", "Martensville", "Humboldt", "Melfort", "Melville"],
  "NS": ["Halifax", "Cape Breton", "Lunenbrug", "Truro", "New Glasgow", "Kentville", "Amherst", "Bridgewater", "Yarmouth"],
  "NB": ["Moncton", "Saint John", "Fredericton", "Dieppe", "Riverview", "Quispamsis", "Edmundston", "Miramichi", "Bathurst", "Rothesay"],
  "PE": ["Charlottetown", "Summerside", "Stratford", "Cornwall", "Three Rivers"],
  "NL": ["St. John's", "Conception Bay South", "Mount Pearl", "Paradise", "Corner Brook", "Grand Falls-Windsor", "Gander", "Portugal Cove-St. Philip's", "Torbay", "Happy Valley-Goose Bay"],
  "NT": ["Yellowknife", "Hay River", "Inuvik", "Fort Smith"],
  "YT": ["Whitehorse", "Dawson City", "Watson Lake"],
  "NU": ["Iqaluit", "Rankin Inlet", "Arviat"]
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(SEED_CITIES, null, 2));
console.log('Created src/lib/canadian_cities.json with seed data.');
