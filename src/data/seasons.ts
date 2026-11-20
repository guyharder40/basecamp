// Hunting season dates are APPROXIMATE windows based on each state's typical
// 2026-2027 regulations. They are NOT live-verified against each agency page.
// The app always shows "Verify before you hunt" with the official agency link.
export interface Season { species: string; name: string; open: string; close: string; }
export interface StateSeasons { state: string; agency: string; url: string; seasons: Season[]; }
const AGENCIES: Record<string, { agency: string; url: string }> = {
  AL: { agency: 'Alabama Dept. of Conservation & Natural Resources', url: 'https://www.outdooralabama.com/' },
  AK: { agency: 'Alaska Dept. of Fish & Game', url: 'https://www.adfg.alaska.gov/' },
  AZ: { agency: 'Arizona Game & Fish Dept.', url: 'https://www.azgfd.com/' },
  AR: { agency: 'Arkansas Game & Fish Commission', url: 'https://www.agfc.com/' },
  CA: { agency: 'California Dept. of Fish & Wildlife', url: 'https://wildlife.ca.gov/' },
  CO: { agency: 'Colorado Parks & Wildlife', url: 'https://cpw.state.co.us/' },
  CT: { agency: 'Connecticut DEEP', url: 'https://portal.ct.gov/deep' },
  DE: { agency: 'Delaware DNREC', url: 'https://dnrec.delaware.gov/' },
  FL: { agency: 'Florida Fish & Wildlife Conservation Commission', url: 'https://myfwc.com/' },
  GA: { agency: 'Georgia Dept. of Natural Resources', url: 'https://georgiawildlife.com/' },
  HI: { agency: 'Hawaii Dept. of Land & Natural Resources', url: 'https://dlnr.hawaii.gov/' },
  ID: { agency: 'Idaho Fish & Game', url: 'https://idfg.idaho.gov/' },
  IL: { agency: 'Illinois Dept. of Natural Resources', url: 'https://dnr.illinois.gov/' },
  IN: { agency: 'Indiana Dept. of Natural Resources', url: 'https://www.in.gov/dnr/' },
  IA: { agency: 'Iowa Dept. of Natural Resources', url: 'https://www.iowadnr.gov/' },
  KS: { agency: 'Kansas Dept. of Wildlife & Parks', url: 'https://ksoutdoors.com/' },
  KY: { agency: 'Kentucky Dept. of Fish & Wildlife Resources', url: 'https://fw.ky.gov/' },
  LA: { agency: 'Louisiana Dept. of Wildlife & Fisheries', url: 'https://www.wlf.louisiana.gov/' },
  ME: { agency: 'Maine Dept. of Inland Fisheries & Wildlife', url: 'https://www.maine.gov/ifw/' },
  MD: { agency: 'Maryland Dept. of Natural Resources', url: 'https://dnr.maryland.gov/' },
  MA: { agency: 'Massachusetts Division of Fisheries & Wildlife', url: 'https://www.mass.gov/orgs/division-of-fisheries-and-wildlife' },
  MI: { agency: 'Michigan Dept. of Natural Resources', url: 'https://www.michigan.gov/dnr/' },
  MN: { agency: 'Minnesota Dept. of Natural Resources', url: 'https://www.dnr.state.mn.us/' },
  MS: { agency: 'Mississippi Dept. of Wildlife, Fisheries & Parks', url: 'https://www.mdwfp.com/' },
  MO: { agency: 'Missouri Dept. of Conservation', url: 'https://mdc.mo.gov/' },
  MT: { agency: 'Montana Fish, Wildlife & Parks', url: 'https://fwp.mt.gov/' },
  NE: { agency: 'Nebraska Game & Parks Commission', url: 'https://outdoornebraska.gov/' },
  NV: { agency: 'Nevada Dept. of Wildlife', url: 'https://www.ndow.org/' },
  NH: { agency: 'New Hampshire Fish & Game', url: 'https://www.wildlife.nh.gov/' },
  NJ: { agency: 'New Jersey Fish & Wildlife', url: 'https://dep.nj.gov/njfw/' },
  NM: { agency: 'New Mexico Dept. of Game & Fish', url: 'https://www.wildlife.state.nm.us/' },
  NY: { agency: 'New York Dept. of Environmental Conservation', url: 'https://dec.ny.gov/' },
  NC: { agency: 'North Carolina Wildlife Resources Commission', url: 'https://www.ncwildlife.gov/' },
  ND: { agency: 'North Dakota Game & Fish Dept.', url: 'https://gf.nd.gov/' },
  OH: { agency: 'Ohio Dept. of Natural Resources', url: 'https://ohiodnr.gov/' },
  OK: { agency: 'Oklahoma Dept. of Wildlife Conservation', url: 'https://www.wildlifedepartment.com/' },
  OR: { agency: 'Oregon Dept. of Fish & Wildlife', url: 'https://www.dfw.state.or.us/' },
  PA: { agency: 'Pennsylvania Game Commission', url: 'https://www.pa.gov/agencies/pgc.html' },
  RI: { agency: 'Rhode Island Dept. of Environmental Management', url: 'https://dem.ri.gov/' },
  SC: { agency: 'South Carolina Dept. of Natural Resources', url: 'https://www.dnr.sc.gov/' },
  SD: { agency: 'South Dakota Game, Fish & Parks', url: 'https://gfp.sd.gov/' },
  TN: { agency: 'Tennessee Wildlife Resources Agency', url: 'https://www.tn.gov/twra.html' },
  TX: { agency: 'Texas Parks & Wildlife Dept.', url: 'https://tpwd.texas.gov/' },
  UT: { agency: 'Utah Division of Wildlife Resources', url: 'https://wildlife.utah.gov/' },
  VT: { agency: 'Vermont Fish & Wildlife', url: 'https://www.vtfishandwildlife.com/' },
  VA: { agency: 'Virginia Dept. of Wildlife Resources', url: 'https://dwr.virginia.gov/' },
  WA: { agency: 'Washington Dept. of Fish & Wildlife', url: 'https://wdfw.wa.gov/' },
  WV: { agency: 'West Virginia Division of Natural Resources', url: 'https://wvdnr.gov/' },
  WI: { agency: 'Wisconsin Dept. of Natural Resources', url: 'https://dnr.wisconsin.gov/' },
  WY: { agency: 'Wyoming Game & Fish Dept.', url: 'https://wgfd.wyo.gov/' },
};
function s(species: string, name: string, open: string, close: string): Season { return { species, name, open, close }; }
const DEFAULT: Season[] = [
  s('Deer', 'Archery', '2026-10-01', '2026-11-14'),
  s('Deer', 'Firearm', '2026-11-15', '2026-11-30'),
  s('Deer', 'Muzzleloader', '2026-12-01', '2026-12-15'),
  s('Turkey', 'Fall', '2026-10-01', '2026-11-15'),
  s('Turkey', 'Spring', '2027-04-15', '2027-05-15'),
];
const OVERRIDES: Record<string, Season[]> = {
  MD: [
    s('Deer', 'Archery', '2026-09-11', '2027-01-30'),
    s('Deer', 'Muzzleloader', '2026-10-15', '2026-10-17'),
    s('Deer', 'Firearm', '2026-11-28', '2026-12-12'),
    s('Deer', 'Muzzleloader (late)', '2026-12-18', '2026-12-19'),
    s('Turkey', 'Fall', '2026-10-31', '2026-11-07'),
    s('Turkey', 'Spring', '2027-04-17', '2027-05-22'),
  ],
  MI: [
    s('Deer', 'Archery', '2026-10-01', '2026-11-14'),
    s('Deer', 'Firearm', '2026-11-15', '2026-11-30'),
    s('Deer', 'Muzzleloader', '2026-12-04', '2026-12-13'),
    s('Turkey', 'Fall', '2026-09-15', '2026-11-14'),
    s('Turkey', 'Spring', '2027-04-18', '2027-05-31'),
    s('Elk', 'Elk (draw only)', '2026-09-01', '2026-12-31'),
  ],
  WI: [
    s('Deer', 'Archery', '2026-09-12', '2026-11-19'),
    s('Deer', 'Gun', '2026-11-21', '2026-11-29'),
    s('Deer', 'Muzzleloader', '2026-11-30', '2026-12-09'),
    s('Bear', 'Bear', '2026-09-09', '2026-10-13'),
    s('Turkey', 'Fall', '2026-09-12', '2026-11-19'),
    s('Turkey', 'Spring', '2027-04-18', '2027-05-26'),
  ],
  PA: [
    s('Deer', 'Archery', '2026-10-03', '2026-11-14'),
    s('Deer', 'Muzzleloader', '2026-10-17', '2026-10-24'),
    s('Deer', 'Rifle', '2026-11-28', '2026-12-12'),
    s('Turkey', 'Fall', '2026-10-31', '2026-11-14'),
    s('Turkey', 'Spring', '2027-05-02', '2027-05-30'),
    s('Bear', 'Bear', '2026-11-21', '2026-11-24'),
  ],
  TX: [
    s('Deer', 'Archery', '2026-10-03', '2026-11-06'),
    s('Deer', 'General', '2026-11-07', '2027-01-03'),
    s('Deer', 'Muzzleloader', '2027-01-04', '2027-01-17'),
    s('Turkey', 'Fall', '2026-11-01', '2026-11-30'),
    s('Turkey', 'Spring', '2027-04-03', '2027-05-16'),
  ],
  NY: [
    s('Deer', 'Archery', '2026-10-01', '2026-11-20'),
    s('Deer', 'Regular', '2026-11-21', '2026-12-13'),
    s('Deer', 'Muzzleloader', '2026-12-14', '2026-12-22'),
    s('Turkey', 'Fall', '2026-10-01', '2026-11-20'),
    s('Turkey', 'Spring', '2027-05-01', '2027-05-31'),
    s('Bear', 'Bear', '2026-10-01', '2026-12-13'),
  ],
  OH: [
    s('Deer', 'Archery', '2026-09-26', '2027-02-07'),
    s('Deer', 'Gun', '2026-11-30', '2026-12-06'),
    s('Deer', 'Muzzleloader', '2027-01-02', '2027-01-05'),
    s('Turkey', 'Fall', '2026-10-10', '2026-11-29'),
    s('Turkey', 'Spring', '2027-04-17', '2027-05-17'),
  ],
  MO: [
    s('Deer', 'Archery', '2026-09-15', '2026-11-13'),
    s('Deer', 'Firearms', '2026-11-14', '2026-11-24'),
    s('Deer', 'Muzzleloader', '2026-12-26', '2027-01-05'),
    s('Turkey', 'Fall', '2026-10-01', '2026-10-31'),
    s('Turkey', 'Spring', '2027-04-20', '2027-05-10'),
  ],
  MN: [
    s('Deer', 'Archery', '2026-09-19', '2026-12-31'),
    s('Deer', 'Firearms', '2026-11-07', '2026-11-15'),
    s('Deer', 'Muzzleloader', '2026-11-28', '2026-12-13'),
    s('Turkey', 'Fall', '2026-09-19', '2026-10-25'),
    s('Turkey', 'Spring', '2027-04-15', '2027-05-31'),
    s('Bear', 'Bear', '2026-09-01', '2026-10-18'),
  ],
  GA: [
    s('Deer', 'Archery', '2026-09-12', '2027-01-10'),
    s('Deer', 'Firearms', '2026-10-17', '2027-01-10'),
    s('Deer', 'Muzzleloader', '2026-10-10', '2026-10-16'),
    s('Turkey', 'Fall', '2026-10-01', '2026-11-30'),
    s('Turkey', 'Spring', '2027-03-27', '2027-05-15'),
  ],
  FL: [
    s('Deer', 'Archery', '2026-07-25', '2026-08-23'),
    s('Deer', 'General Gun', '2026-11-21', '2027-01-03'),
    s('Deer', 'Muzzleloader', '2026-09-05', '2026-09-13'),
    s('Turkey', 'Fall', '2026-11-21', '2027-01-03'),
    s('Turkey', 'Spring', '2027-03-06', '2027-04-11'),
  ],
  MT: [
    s('Deer', 'Archery', '2026-09-05', '2026-10-18'),
    s('Deer', 'General', '2026-10-24', '2026-11-29'),
    s('Elk', 'Archery', '2026-09-05', '2026-10-18'),
    s('Elk', 'General', '2026-10-24', '2026-11-29'),
    s('Turkey', 'Spring', '2027-04-11', '2027-05-17'),
    s('Bear', 'Spring Bear', '2027-04-15', '2027-05-31'),
  ],
  CO: [
    s('Deer', 'Archery', '2026-09-02', '2026-09-30'),
    s('Deer', 'Rifle', '2026-10-10', '2026-11-08'),
    s('Deer', 'Muzzleloader', '2026-09-12', '2026-09-20'),
    s('Elk', 'Archery', '2026-09-02', '2026-09-30'),
    s('Elk', 'Rifle', '2026-10-10', '2026-11-08'),
    s('Turkey', 'Spring', '2027-04-11', '2027-05-31'),
  ],
  AK: [
    s('Deer', 'General', '2026-08-01', '2026-12-31'),
    s('Bear', 'Black Bear', '2026-08-01', '2027-06-30'),
    s('Bear', 'Brown Bear', '2026-09-01', '2026-10-31'),
  ],
  HI: [
    s('Deer', 'Axis Deer', '2026-01-01', '2026-12-31'),
    s('Turkey', 'Spring', '2027-03-01', '2027-04-30'),
  ],
};
export function getStateSeasons(state: string): StateSeasons {
  const a = AGENCIES[state] ?? { agency: 'State wildlife agency', url: 'https://www.google.com/search?q=' + state + '+hunting+regulations' };
  return { state, agency: a.agency, url: a.url, seasons: OVERRIDES[state] ?? DEFAULT };
}
export type SeasonStatus = 'open' | 'upcoming' | 'ended';
export function seasonStatus(season: Season, today = new Date()): { status: SeasonStatus; days: number } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const o = new Date(season.open + 'T00:00:00').getTime();
  const c = new Date(season.close + 'T00:00:00').getTime();
  if (t > c) return { status: 'ended', days: Math.round((t - c) / 86400000) };
  if (t < o) return { status: 'upcoming', days: Math.round((o - t) / 86400000) };
  return { status: 'open', days: Math.round((c - t) / 86400000) };
}
