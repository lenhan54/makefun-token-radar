// The token radar's model: one snapshot of the protocol universe in, one ranked
// board out. Version "radar-2".
//
// The board ranks every pre-token protocol that could plausibly issue a token of
// its own: the snapshot's watchlist (the floor, never the ceiling) plus every
// other pre-token protocol that passes the watchlist's own exclusion rule.
// Bridges, canonical bridges, liquid-staking and restaking wrappers, exchanges
// and versioned pools are left out — they are products of tokens that already
// trade, not protocols still waiting on a launch of their own. The live-token
// protocols are kept apart and shown with the market's own values, never mixed
// into the ranking.
//
// Implied value follows only from the snapshot's own figures, and no protocol
// name is ever special-cased: the same function scores every row.
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -60, 120) per cent; unknown growth counts as 0
//   growthMult = 1 + (growth / 100) x (growth < 0 ? 0.65 : 0.45)
//                a shrinking TVL weighs more than a rising one: users leaving
//                says more about a protocol than users arriving
//   maturity   = 0.5 + min(age_days, 1095) / 1095 x 0.5
//                age is the time since DefiLlama first listed the protocol —
//                how long it has run with no token. Unknown age counts as 365.
//   breadth    = 0.9 + 0.1 x min(chains, 8) / 8
//                more chains, wider reach, more users to reward
//   category   = a factor by DefiLlama category (see CATEGORY_RULES): fee-earning
//                retail protocols score highest, institutional allocators and
//                RWA products lowest. A stated assumption, uniform by category.
//   implied    = max(1, round(base x growthMult x maturity x breadth x category))

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight_down: number;
  growth_weight_up: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_floor: number;
  breadth_range: number;
  breadth_chains: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight_down: 0.65,
  growth_weight_up: 0.45,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.5,
  maturity_range: 0.5,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_floor: 0.9,
  breadth_range: 0.1,
  breadth_chains: 8,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category rule: a substring match, a factor, and why it scores that way. */
export interface CategoryRule {
  match: string;
  factor: number;
  reason: string;
}

/**
 * The category factor, as a table the dashboard shows whole. Ordered: the first
 * substring that matches wins, so specific rules sit above general ones. This is
 * a model assumption about where token value accrues, stated in the open — never
 * a list of protocol names.
 */
export const CATEGORY_RULES: CategoryRule[] = [
  { match: 'risk curat', factor: 0.7, reason: 'Curators serve institutions; value accrues to vault managers, rarely to retail farmers.' },
  { match: 'allocator', factor: 0.75, reason: 'Allocators move institutional capital; a retail points campaign is unlikely.' },
  { match: 'rwa', factor: 0.75, reason: 'Real-world assets pay yield to holders; the token, if any, rarely rewards farmers.' },
  { match: 'stable', factor: 0.8, reason: 'Stablecoins earn on reserves, not on user activity.' },
  { match: 'insurance', factor: 0.8, reason: 'Cover is bought, not farmed; airdrops here are rare.' },
  { match: 'collateral', factor: 0.85, reason: 'Collateral markets are close to lending, but thinner.' },
  { match: 'dex', factor: 1.0, reason: 'DEX fees accrue to liquidity and traders — the classic token model.' },
  { match: 'lend', factor: 1.0, reason: 'Lending fees accrue to suppliers and borrowers — the classic token model.' },
  { match: 'perpetual', factor: 1.0, reason: 'Perp fees accrue to traders — the classic token model.' },
  { match: 'derivative', factor: 1.0, reason: 'Derivatives fees accrue to traders — the classic token model.' },
  { match: 'cdp', factor: 1.0, reason: 'CDP interest accrues to the protocol — the classic token model.' },
  { match: 'leveraged farm', factor: 1.0, reason: 'Leveraged farming pays yield to active positions.' },
  { match: 'basis trad', factor: 1.0, reason: 'Basis trading pays yield to active positions.' },
  { match: 'option', factor: 1.0, reason: 'Options premiums accrue to writers and traders.' },
  { match: 'yield', factor: 0.95, reason: 'Yield products pay holders; a token usually rewards depositors.' },
  { match: 'liquidity manager', factor: 0.95, reason: 'Liquidity managers earn fees on managed positions.' },
  { match: 'payment', factor: 0.9, reason: 'Payments move volume; a token rewards usage, not deposits.' },
  { match: 'prediction', factor: 0.9, reason: 'Prediction markets reward participation, not locked capital.' },
  { match: 'gaming', factor: 0.9, reason: 'Games reward players; value is thinner than fee-earning DeFi.' },
  { match: 'social', factor: 0.9, reason: 'Social apps reward attention; value is thinner than fee-earning DeFi.' },
  { match: 'staking pool', factor: 0.9, reason: 'Staking pools pay yield; a token usually rewards stakers.' },
  { match: 'restak', factor: 0.9, reason: 'Restaking pays yield; a token usually rewards stakers.' },
  { match: 'chain', factor: 0.9, reason: 'A chain of its own usually has a token already; the farm is usage, not deposits.' },
];

/** The factor for a category outside the table, and for a protocol with none. */
export const CATEGORY_DEFAULT = 0.85;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  hot: boolean;
  early: boolean;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    category_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  hot: boolean;
  early: boolean;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  category_factor: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_rules: CategoryRule[];
  category_default: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  hot_size: number;
  live_size: number;
  total_implied_usd: number;
  median_growth_pct: number | null;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category factor for one protocol: the first matching rule, else the default. */
export function categoryFactor(category: string | null): number {
  if (category === null) return CATEGORY_DEFAULT;
  const c = category.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (c.includes(rule.match)) return rule.factor;
  }
  return CATEGORY_DEFAULT;
}

/** The five multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; categoryMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const weight = growthPct < 0 ? model.growth_weight_down : model.growth_weight_up;
  const growthMult = 1 + (growthPct / 100) * weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = model.breadth_floor + (Math.min(Math.max(protocol.chains.length, 0), model.breadth_chains) / model.breadth_chains) * model.breadth_range;
  const categoryMult = categoryFactor(protocol.category);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult * categoryMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, categoryMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are products of tokens that already trade, not launches of their own. */
const WRAPPER_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Exchanges whose name at the start of a protocol's name marks it as their product. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped,
 * staked or bridged product of a token that already trades. This is the
 * watchlist's own exclusion rule, applied to every pre-token protocol, so the
 * board is every plausible launch candidate and nothing that is not one.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whether a protocol is heating up: seven-day TVL growth above 20 per cent. */
export function isHot(p: SnapshotProtocol): boolean {
  return p.change_7d !== null && p.change_7d > 20;
}

/** Whether a protocol is an early find: young, and already large. */
export function isEarly(p: SnapshotProtocol, age: number | null): boolean {
  return age !== null && age < 180 && p.tvl_usd > 100_000_000;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever else the
  // rule says about it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the exclusion rule keeps,
  // at any TVL the snapshot carries. Never a replacement for a watchlist row.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    on_watchlist: snapshot.watchlist.includes(s.p.slug),
    hot: isHot(s.p),
    early: isEarly(s.p, s.age),
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      category_factor: s.categoryMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The second chain, when the protocol runs on more than one. */
function secondChain(p: SnapshotProtocol): string | null {
  return p.chains.length > 1 ? p.chains[1]! : null;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the supply open so it earns interest.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad') || c.includes('option')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge, then close it.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('payment')) return `Move $${capital} through ${name} on ${chain} and keep a balance in its app.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name} and use one of its native apps so the address is active on the chain.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the wallet shows repeat activity. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Borrow $10 against the supply and repay it the same week.';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager')) return 'Swap $10 through the main pool and add the output back as liquidity.';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trad') || c.includes('option')) return 'Open and close one $10 hedge so the account shows trading activity.';
  if (c.includes('staking') || c.includes('restak')) return 'Claim or restake the staking rewards once.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('rwa')) return "Check the vault's yield page and add $10 to the position.";
  if (c.includes('prediction')) return 'Place one small market position.';
  if (c.includes('payment')) return 'Send one small payment through the app.';
  return 'Make one small deposit, swap or vote.';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const second = secondChain(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: second !== null
        ? `Repeat the deposit on ${second} so the same wallet is active on a second chain.`
        : `If ${p.name} opens on a second chain, repeat the position there so the activity is recorded twice.`,
      cost: second !== null ? 'about $2 of gas; the capital moves across, it is not doubled' : 'nothing to check',
      time: '10 minutes',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points or rewards page and claim only from the link it publishes; a real airdrop never asks for a fee to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and unwind in two steps if the token launches and the rewards stop.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    on_watchlist: row.on_watchlist,
    hot: row.hot,
    early: row.early,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    category_factor: row.model.category_factor,
  };
}

/** The median of a list of numbers, or null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const hot = board.filter((r) => r.hot).length;
  const totalImplied = board.reduce((sum, r) => sum + r.implied_value_usd, 0);
  const growths = board.map((r) => r.change_7d).filter((g): g is number => g !== null);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    category_rules: CATEGORY_RULES,
    category_default: CATEGORY_DEFAULT,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    hot_size: hot,
    live_size: live.length,
    total_implied_usd: totalImplied,
    median_growth_pct: median(growths) === null ? null : Math.round(median(growths)! * 100) / 100,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
