// Token Radar's dashboard, model radar-2. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail dialog with the model's own inputs and the protocol's farm
// plan, and a sandbox that re-ranks the board from the same figures. No network:
// every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var MODEL = DATA.model;
  var state = { q: '', category: 'all', chain: 'all', tab: 'all', sort: 'implied', dir: -1, selected: null };
  // The sandbox starts at the published model; moving a slider re-ranks live.
  var sandbox = {
    base_multiple: MODEL.base_multiple,
    growth_weight_up: MODEL.growth_weight_up,
    growth_weight_down: MODEL.growth_weight_down,
    maturity_floor: MODEL.maturity_floor,
    use_category: true
  };
  function sandboxDirty() {
    return sandbox.base_multiple !== MODEL.base_multiple ||
      sandbox.growth_weight_up !== MODEL.growth_weight_up ||
      sandbox.growth_weight_down !== MODEL.growth_weight_down ||
      sandbox.maturity_floor !== MODEL.maturity_floor || !sandbox.use_category;
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function, mirroring lib/model.ts: the page recomputes a row
  // from the snapshot figures and checks the number board.json carries, so the
  // page's code and the board's data are visibly the same arithmetic.
  function categoryFactor(category) {
    if (!sandbox.use_category) return 1;
    if (category === null || category === undefined) return DATA.category_default;
    var c = category.toLowerCase();
    for (var i = 0; i < DATA.category_rules.length; i++) {
      if (c.indexOf(DATA.category_rules[i].match) >= 0) return DATA.category_rules[i].factor;
    }
    return DATA.category_default;
  }
  function impliedOf(row, model) {
    var m = model || MODEL;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var weight = growth < 0 ? m.growth_weight_down : m.growth_weight_up;
    var growthMult = 1 + (growth / 100) * weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var breadth = m.breadth_floor + (Math.min(Math.max((row.chains || []).length, 0), m.breadth_chains) / m.breadth_chains) * m.breadth_range;
    var category = categoryFactor(row.category);
    var value = Math.max(1, Math.round(row.tvl_usd * m.base_multiple * growthMult * maturity * breadth * category));
    return { value: value, growth: growth, growthMult: growthMult, maturity: maturity, breadth: breadth, category: category, age: age };
  }
  function sandboxModel() {
    return {
      base_multiple: sandbox.base_multiple,
      growth_weight_up: sandbox.growth_weight_up,
      growth_weight_down: sandbox.growth_weight_down,
      growth_floor: MODEL.growth_floor,
      growth_cap: MODEL.growth_cap,
      maturity_floor: sandbox.maturity_floor,
      maturity_range: MODEL.maturity_range,
      maturity_days: MODEL.maturity_days,
      unknown_age_days: MODEL.unknown_age_days,
      breadth_floor: MODEL.breadth_floor,
      breadth_range: MODEL.breadth_range,
      breadth_chains: MODEL.breadth_chains
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category,
  // chains, TVL and age decide the action, the capital, the hold and every cost
  // and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the supply open so it earns interest.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('option') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge, then close it.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('payment') >= 0) return 'Move $' + capital + ' through ' + name + ' on ' + chain + ' and keep a balance in its app.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + name + ' and use one of its native apps so the address is active on the chain.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $10 against the supply and repay it the same week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $10 through the main pool and add the output back as liquidity.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis trad') >= 0 || c.indexOf('option') >= 0) return 'Open and close one $10 hedge so the account shows trading activity.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or restake the staking rewards once.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('rwa') >= 0) return "Check the vault's yield page and add $10 to the position.";
    if (c.indexOf('prediction') >= 0) return 'Place one small market position.';
    if (c.indexOf('payment') >= 0) return 'Send one small payment through the app.';
    return 'Make one small deposit, swap or vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: second !== null ? 'Repeat the deposit on ' + second + ' so the same wallet is active on a second chain.' : 'If ' + p.name + ' opens on a second chain, repeat the position there so the activity is recorded twice.', cost: second !== null ? 'about $2 of gas; the capital moves across, it is not doubled' : 'nothing to check', time: '10 minutes' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Open " + p.name + "'s own points or rewards page and claim only from the link it publishes; a real airdrop never asks for a fee to claim.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and unwind in two steps if the token launches and the rewards stop.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'all') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The board under the current sandbox: every row recomputed from its figures,
  // then ranked. With the sandbox untouched this is the published board.
  function valuedRows() {
    var sm = sandboxDirty() ? sandboxModel() : MODEL;
    return DATA.rows.map(function (r) {
      var v = impliedOf(r, sm);
      return { row: r, value: v.value, growthMult: v.growthMult, maturity: v.maturity, breadth: v.breadth, category: v.category };
    });
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return valuedRows().filter(function (v) {
      var r = v.row;
      if (state.tab === 'watchlist' && !r.on_watchlist) return false;
      if (state.tab === 'early' && r.on_watchlist) return false;
      if (state.tab === 'hot' && !r.hot) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var ranked = list.slice().sort(function (a, b) { return b.value - a.value || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0); });
    ranked.forEach(function (v, i) { v.shownRank = i + 1; });
    if (key === 'implied') return ranked;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.row.name.toLowerCase(); bv = b.row.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.row.tvl_usd; bv = b.row.tvl_usd; }
      else if (key === 'growth') { av = a.row.change_7d === null ? -Infinity : a.row.change_7d; bv = b.row.change_7d === null ? -Infinity : b.row.change_7d; }
      else if (key === 'age') { av = a.row.age_days === null ? Infinity : a.row.age_days; bv = b.row.age_days === null ? Infinity : b.row.age_days; }
      else { av = a.value; bv = b.value; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name' }, 'Token Radar ', el('small', { text: 'radar-2' }))),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index'),
        el('span', null, el('b', { text: DATA.model_version + ' model' }))
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.watchlist_size + ' watchlist protocols, ranked by ', el('em', { text: 'implied value' })),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The radar adds every other pre-token protocol the rule keeps, at any size — the early finds. Implied value is a model, not a promise, and no token is promised.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows off the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Heating up (>20% in 7d)' }), el('b', { text: String(DATA.hot_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Median 7d growth' }), el('b', { text: fmtPct(DATA.median_growth_pct) }))
      )
    );
  }

  function tabButton(tab, label) {
    return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 15);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }),
        el('div', { class: 'tabs' }, tabButton('all', 'All'), tabButton('watchlist', 'Watchlist'), tabButton('early', 'Early'), tabButton('hot', 'Hot'), tabButton('live', 'Live token'))),
      el('span', { class: 'count', text: state.tab === 'live' ? DATA.live.length + ' live-token protocols' : rows().length + ' rows shown' + (sandboxDirty() ? ' · sandbox ranking' : '') })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function badges(r) {
    var out = [];
    if (r.hot) out.push(el('span', { class: 'badge hot', text: 'HOT' }));
    if (r.early) out.push(el('span', { class: 'badge early', text: 'EARLY' }));
    if (r.on_watchlist) out.push(el('span', { class: 'badge watch', text: 'WATCHLIST' }));
    return out;
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tab = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list.reduce(function (m, v) { return Math.max(m, v.value); }, 1);
    var tbody = el('tbody');
    list.forEach(function (v) {
      var r = v.row;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        class: v.shownRank <= 3 ? 'top3' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('span', { class: 'rank-badge', text: String(v.shownRank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, badges(r)),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((v.value / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(v.value) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (sandboxDirty() ? ' Sandbox ranking: move a slider in the model panel to re-rank.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'rank-badge', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function slider(id, label, min, max, step, value, oninput) {
    var out = el('output', { for: id, text: String(value) });
    var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
    input.addEventListener('input', function () { out.textContent = input.value; oninput(parseFloat(input.value)); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), input, out);
  }

  function modelPanel() {
    var m = MODEL;
    var formula = el('div', { class: 'formula' },
      'implied = round( tvl_usd x ', el('b', { text: String(m.base_multiple) }),
      ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ',
      el('b', { text: m.growth_weight_down + ' down / ' + m.growth_weight_up + ' up' }),
      ') x (', el('b', { text: String(m.maturity_floor) }),
      ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range +
      ') x breadth x category )'
    );
    var sandboxBox = el('div', { class: 'sandbox' },
      el('div', { class: 'row' },
        slider('sb-base', 'Base multiple (TVL to value)', 0.1, 0.5, 0.05, sandbox.base_multiple, function (v) { sandbox.base_multiple = v; render(); }),
        slider('sb-up', 'Growth weight, rising TVL', 0, 1, 0.05, sandbox.growth_weight_up, function (v) { sandbox.growth_weight_up = v; render(); }),
        slider('sb-down', 'Growth weight, falling TVL', 0, 1, 0.05, sandbox.growth_weight_down, function (v) { sandbox.growth_weight_down = v; render(); }),
        slider('sb-floor', 'Maturity floor', 0.3, 0.8, 0.05, sandbox.maturity_floor, function (v) { sandbox.maturity_floor = v; render(); })
      ),
      el('div', { class: 'row' },
        el('label', { class: 'check' },
          el('input', { type: 'checkbox', checked: sandbox.use_category ? 'checked' : null, onchange: function (e) { sandbox.use_category = e.target.checked; render(); } }),
          'Apply the category factor'),
        el('button', { class: 'button ghost', type: 'button', text: 'Reset to the published model', onclick: function () {
          sandbox.base_multiple = MODEL.base_multiple;
          sandbox.growth_weight_up = MODEL.growth_weight_up;
          sandbox.growth_weight_down = MODEL.growth_weight_down;
          sandbox.maturity_floor = MODEL.maturity_floor;
          sandbox.use_category = true;
          render();
        } })
      ),
      el('p', { class: 'sub', text: 'Move a slider and the board re-ranks from the same figures. board.json keeps the published model; the sandbox only asks what if.' })
    );
    var rules = el('ul', { class: 'rules' },
      DATA.category_rules.map(function (rule) {
        return el('li', null, el('b', { text: rule.match + '  ' + rule.factor.toFixed(2) }), ' — ' + rule.reason);
      })
    );
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function of the snapshot figures scores every row. No protocol name is special-cased, and no row is hand-picked.' }),
      formula,
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed — how long it has run with no token; an unlisted age counts as ' + m.unknown_age_days + ' days. Breadth is the chain count, up to ' + m.breadth_chains + ' chains. Bridges, liquid-staking wrappers, exchanges and versioned pools are left out of the ranking: they are products of tokens that already trade.' }),
      el('h2', { text: 'Model sandbox' }),
      sandboxBox,
      el('h2', { text: 'The category factor' }),
      rules,
      el('p', { class: 'note', text: 'The snapshot records no token; it never proves a protocol has none. A protocol on this board may still have a token its DefiLlama record does not carry. Implied value is this entry\u2019s own claim, never make.fun\u2019s, and never a price.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var found = valuedRows().filter(function (v) { return v.row.slug === slug; })[0];
    if (!found) return;
    var row = found.row;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var published = impliedOf(row, MODEL);
    var why = 'Ranks #' + row.rank + ' of ' + DATA.board_size + ' because it holds ' + fmtUsd(row.tvl_usd) +
      ' of TVL, moved ' + fmtPct(row.change_7d) + ' in 7 days, has run ' + fmtAge(row.age_days) +
      (row.age_days === null ? ' (age unknown)' : '') + ' with no token on record, and spans ' +
      (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + '.';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(published.growthMult.toFixed(4)) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(published.maturity.toFixed(4)) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(published.breadth.toFixed(4)) })),
        el('div', null, el('span', { text: 'Category factor' }), el('b', { class: 'num', text: String(published.category.toFixed(2)) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'why' }, el('b', { text: 'Why this rank: ' }), why),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(published.value) + (published.value === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; the data does not move. Implied value is this entry\u2019s model, never a price, and no token is promised.' }),
      el('p', { text: 'Token Radar, model ' + DATA.model_version + '. No network: every byte on this page comes from the snapshot.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    if (state.tab !== 'live') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
