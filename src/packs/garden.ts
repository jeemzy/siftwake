import { M } from '../materialIds.ts';
import type { PackContext, PackMaterial } from '../packRuntime.ts';

const defaults = { group: 'Garden', temperature: 20, life: 0, amount: 0, conductivity: 0.07 };
export const gardenDefinitions: PackMaterial[] = [
  { ...defaults, id: M.Soil, name: 'Soil', color: '#806145', family: 'powder', density: 66,
    sourceEligible: true, tip: 'Water a soil bed to turn it into mud, then sow seeds on its surface.' },
  { ...defaults, id: M.Mud, name: 'Mud', color: '#534034', family: 'powder', density: 74,
    amount: 1, conductivity: 0.12, sourceEligible: true, tip: 'Mud holds water for roots. Exposed mud dries faster when warm.' },
  { ...defaults, id: M.Seed, name: 'Seed', color: '#DAAD66', family: 'powder', density: 42,
    sourceEligible: true, tip: 'Set a seed on mud or damp compost. A seed at the water’s edge grows reeds.' },
  { ...defaults, id: M.Root, name: 'Root', color: '#C19A73', family: 'solid', density: 62,
    life: 4, sourceEligible: false, tip: 'Roots grow through soil toward moisture and feed water back to the shoot.' },
  { ...defaults, id: M.Stem, name: 'Stem', color: '#719148', family: 'solid', density: 45,
    life: 3, sourceEligible: false, tip: 'Water from the roots travels up the stem to growing tips and leaves.' },
  { ...defaults, id: M.Leaf, name: 'Leaf', color: '#8FB853', family: 'solid', density: 25,
    sourceEligible: false, tip: 'A watered leaf releases mist. A prolonged drought turns it into loose litter.' },
  { ...defaults, id: M.Reed, name: 'Reed', color: '#ADBA69', family: 'solid', density: 35,
    life: 5, sourceEligible: false, tip: 'Reeds take up water along the bank and grow tall, narrow shoots.' },
  { ...defaults, id: M.LeafLitter, name: 'Leaf Litter', color: '#B77644', family: 'powder', density: 12,
    sourceEligible: true, tip: 'Blow dry litter with a fan or keep it damp to make compost.' },
  { ...defaults, id: M.Compost, name: 'Compost', color: '#604837', family: 'powder', density: 65,
    sourceEligible: true, tip: 'Water compost and add a seed to grow a longer shoot.' },
];

// amount stores whole water drops. A growing tip passes its remaining length (life)
// to just one successor. Depth (aux) directs water inward in roots and outward in shoots.
const soilCapacity = 4;
const plantCapacity = 3;
const droughtTicks = 160;

function substrate(id: number) {
  return id === M.Soil || id === M.Mud || id === M.Compost;
}

function moisture(c: PackContext, i: number) {
  const id = c.world.cells[i];
  if (id === M.Water || id === M.Fog) return 1;
  return substrate(id) ? c.world.amount[i] : 0;
}

// Every caller selects the donor and recipient from available cells before debiting.
function withdraw(c: PackContext, i: number) {
  const { cells, amount } = c.world;
  if (cells[i] === M.Water || cells[i] === M.Fog) c.change(i, M.Empty);
  else if (--amount[i] === 0 && cells[i] === M.Mud) c.change(i, M.Soil);
  else c.touch(i);
}

function groundStep(c: PackContext, i: number) {
  const { cells, amount, life, temperature } = c.world;
  const water = amount[i] < soilCapacity
    ? c.neighbors(i).find(j => cells[j] === M.Water)
    : undefined;
  if (water !== undefined) {
    const stored = amount[i];
    withdraw(c, water);
    if (cells[i] === M.Soil) c.change(i, M.Mud);
    else c.touch(i);
    amount[i] = stored + 1;
    life[i] = 0;
    return;
  }
  if (cells[i] !== M.Mud) return;
  if (!amount[i]) return c.change(i, M.Soil);
  if (temperature[i] <= 0) return;
  const outlet = c.empty(i);
  if (outlet < 0) return;
  life[i] += temperature[i] >= 45 ? 6 : 1;
  if (life[i] < 180) return;
  life[i] = 0;
  withdraw(c, i);
  c.change(outlet, M.Fog);
}

// Neighbors are orthogonal, so an index difference of one always means horizontal.
function downhill(c: PackContext, from: number, to: number) {
  const delta = to - from;
  return Math.sign(delta) * c.down[Math.abs(delta) === 1 ? 0 : 1];
}

function rootSite(c: PackContext, i: number, germinating: boolean) {
  let best = -1;
  let bestScore = -Infinity;
  for (const j of c.neighbors(i)) {
    if (!substrate(c.world.cells[j])) continue;
    const wet = moisture(c, j);
    if (germinating && !wet) continue;
    let nearby = 0;
    for (const k of c.neighbors(j)) {
      if (k !== i) nearby = Math.max(nearby, moisture(c, k));
    }
    if (!germinating && !wet && !nearby && !c.world.amount[i]) continue;
    const score = wet * 4 + nearby * 2 + downhill(c, i, j);
    if (score > bestScore) {
      best = j;
      bestScore = score;
    }
  }
  return best;
}

function germinate(c: PackContext, i: number) {
  const { amount, cells, life } = c.world;
  const bed = rootSite(c, i, true);
  if (bed < 0) return;
  const bank = [i, bed].some(k => c.neighbors(k).some(j => cells[j] === M.Water));
  const compost = cells[bed] === M.Compost;
  const stored = amount[bed];
  c.change(bed, M.Root);
  c.change(i, bank ? M.Reed : M.Stem);
  amount[bed] = stored - 1;
  amount[i] = 1;
  if (compost) life[i] += 2;
}

function feed(c: PackContext, i: number, roots: boolean) {
  const { cells, amount, aux } = c.world;
  if (!amount[i]) return false;
  let receiver = -1;
  for (const j of c.neighbors(i)) {
    const id = cells[j];
    const shoot = id === M.Stem || id === M.Reed;
    // Painted segments start at the same depth. They can still conduct against gravity.
    const forward = aux[j] === aux[i] ? downhill(c, i, j) < 0
      : roots ? aux[j] < aux[i] : aux[j] > aux[i];
    const downstream = roots
      ? shoot || (id === M.Root && forward)
      : id === M.Leaf || (shoot && forward);
    if (downstream && amount[j] < plantCapacity &&
        (receiver < 0 || amount[j] < amount[receiver])) receiver = j;
  }
  if (receiver < 0) return false;
  amount[i]--;
  amount[receiver]++;
  c.touch(i);
  c.touch(receiver);
  return true;
}

function rootStep(c: PackContext, i: number) {
  const { amount, aux, life } = c.world;
  if (life[i]) {
    const site = rootSite(c, i, false);
    if (site >= 0) {
      const wet = amount[site];
      c.change(site, M.Root);
      amount[site] = wet;
      aux[site] = aux[i] + 1;
      life[site] = life[i] - 1;
      life[i] = 0;
      c.touch(i);
      return;
    }
  }
  if (feed(c, i, true) || amount[i] >= plantCapacity) return;
  const donor = c.neighbors(i).find(j => moisture(c, j) > 0);
  if (donor === undefined) return;
  withdraw(c, donor);
  amount[i]++;
  c.touch(i);
}

function shootStep(c: PackContext, i: number) {
  const { cells, amount, life, aux, ticks } = c.world;
  const reed = cells[i] === M.Reed;
  if (life[i] && amount[i] && (ticks + i) % 4 === 0) {
    const spaces = c.neighbors(i).filter(j => cells[j] === M.Empty && downhill(c, i, j) <= 0);
    const tip = spaces.find(j => downhill(c, i, j) < 0) ?? spaces[0];
    if (tip !== undefined) {
      const bud = reed || life[i] < 3 ? undefined : spaces.find(j => j !== tip);
      const length = life[i];
      c.change(tip, length === 1 ? M.Leaf : cells[i]);
      amount[tip] = 1;
      amount[i]--;
      aux[tip] = aux[i] + 1;
      life[tip] = length - 1;
      life[i] = 0;
      if (bud !== undefined) c.change(bud, M.Leaf);
      c.touch(i);
      return;
    }
  }
  if (feed(c, i, false) || !reed || amount[i] >= plantCapacity) return;
  const water = c.neighbors(i).find(j => cells[j] === M.Water);
  if (water !== undefined) {
    withdraw(c, water);
    amount[i]++;
    c.touch(i);
  }
}

function leafStep(c: PackContext, i: number) {
  const { amount, life, ticks } = c.world;
  if (!amount[i]) {
    if (++life[i] >= droughtTicks) c.change(i, M.LeafLitter);
    return;
  }
  life[i] = 0;
  if ((ticks + i) % 12 !== 0) return;
  const outlet = c.empty(i);
  if (outlet < 0) return;
  amount[i]--;
  c.change(outlet, M.Fog);
  c.touch(i);
}

function litterStep(c: PackContext, i: number) {
  const { amount, life } = c.world;
  const donor = c.neighbors(i).find(j => moisture(c, j) > 0);
  if (donor === undefined) {
    life[i] = 0;
    return;
  }
  if (++life[i] < 24) return;
  withdraw(c, donor);
  c.change(i, M.Compost);
  amount[i] = 1;
}

export function gardenStep(c: PackContext, i: number): void {
  switch (c.world.cells[i]) {
    case M.Soil:
    case M.Mud:
    case M.Compost: return groundStep(c, i);
    case M.Seed: return germinate(c, i);
    case M.Root: return rootStep(c, i);
    case M.Stem:
    case M.Reed: return shootStep(c, i);
    case M.Leaf: return leafStep(c, i);
    case M.LeafLitter: return litterStep(c, i);
  }
}
