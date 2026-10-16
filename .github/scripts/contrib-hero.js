// Generates an animated SVG where a pixel hero walks under the contribution
// graph and head-butts each week, stacking that week's contribution blocks.
//
// Usage:
//   GITHUB_TOKEN=... GITHUB_USER=jang20050 node .github/scripts/contrib-hero.js
//   node .github/scripts/contrib-hero.js --sample   (random data, no token needed)
//
// Output: dist/contrib-hero.svg, dist/contrib-hero-dark.svg, dist/hero.svg

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(process.cwd(), 'dist');

// ---- layout / timing -------------------------------------------------------
const CELL = 12;
const GAP = 3;
const PITCH = CELL + GAP;
const PAD_X = 20;
const PAD_Y = 10;
const SCALE = 2; // sprite pixel size
const T = 0.3; // seconds per week column
const HOLD = 3.5; // seconds the finished graph stays visible

const THEMES = {
  light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
  dark: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
};

const LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

// ---- sprite ----------------------------------------------------------------
const PAL = {
  Y: '#f5c400', // cap & shirt
  B: '#6b3a1e', // hair & shoes
  S: '#ffc890', // skin
  O: '#2b5bd7', // overalls
  W: '#ffffff', // buttons
};

const BODY = [
  '....YYYYY...',
  '...YYYYYYYY.',
  '...BBBSSBS..',
  '..BSBSSSBSS.',
  '..BSBBSSSSSS',
  '..BBSSSSSSS.',
  '....SSSSS...',
  '...YYOOYY...',
  '..YYYOOYYY..',
  '.YYYYOOOOYYY',
  '.SSOWOOWOSS.',
  '.SSOOOOOOSS.',
];
const FRAME_A = [...BODY, '..OOOOOOOO..', '..OOO..OOO..', '.BBB....BBB.', 'BBBB....BBBB'];
const FRAME_B = [...BODY, '..OOOOOOOO..', '...OOOOOO...', '...BBBBBB...', '..BBBB.BBBB.'];

const SPRITE_W = FRAME_A[0].length;
const SPRITE_H = FRAME_A.length;

function sprite(rows, s) {
  let out = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.') {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === ch) end++;
      out += `<rect x="${x * s}" y="${y * s}" width="${(end - x) * s}" height="${s}" fill="${PAL[ch]}"/>`;
      x = end;
    }
  });
  return out;
}

const WALK_CSS = `.fa{animation:fa .3s steps(1) infinite}.fb{animation:fb .3s steps(1) infinite}
@keyframes fa{0%{opacity:1}50%{opacity:0}100%{opacity:0}}
@keyframes fb{0%{opacity:0}50%{opacity:1}100%{opacity:1}}`;

function walkingSprite(s) {
  return `<g class="fa">${sprite(FRAME_A, s)}</g><g class="fb">${sprite(FRAME_B, s)}</g>`;
}

// ---- data ------------------------------------------------------------------
async function fetchWeeks(login, token) {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
    weeks{contributionDays{weekday contributionLevel}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'contrib-hero',
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GitHub API error: ${JSON.stringify(json.errors || json)}`);
  }
  return json.data.user.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ row: d.weekday, level: LEVELS[d.contributionLevel] ?? 0 }))
  );
}

function sampleWeeks() {
  return Array.from({ length: 53 }, () =>
    Array.from({ length: 7 }, (_, row) => {
      const r = Math.random();
      return { row, level: r < 0.6 ? 0 : Math.ceil(Math.random() * 4) };
    })
  );
}

// ---- render ----------------------------------------------------------------
function render(weeks, colors) {
  const n = weeks.length;
  const width = PAD_X * 2 + n * PITCH - GAP;
  const gridBottom = PAD_Y + 7 * PITCH - GAP;
  const mw = SPRITE_W * SCALE;
  const mh = SPRITE_H * SCALE;
  const groundY = gridBottom + 26 + mh;
  const height = groundY + 14;
  const jump = groundY - mh - gridBottom;

  // The hero walks at constant speed; he is centered under column i at hit[i].
  const v = PITCH / T;
  const xStart = -mw - 6;
  const xEnd = width + 6;
  const xHit0 = PAD_X + CELL / 2 - mw / 2;
  const hit0 = (xHit0 - xStart) / v;
  const hit = (i) => hit0 + i * T;
  const tEnd = hit0 + (xEnd - xHit0) / v;
  const D = tEnd + HOLD;
  const p = (t) => `${((t / D) * 100).toFixed(3)}%`;

  let css = `.c{transform-box:fill-box;transform-origin:center;animation-duration:${D.toFixed(2)}s;animation-iteration-count:infinite;animation-timing-function:linear}
.f{animation:fo ${D.toFixed(2)}s linear infinite}
@keyframes fo{0%,${p(D - 1)}{opacity:1}${p(D - 0.3)},100%{opacity:0}}
.mx{animation:mx ${D.toFixed(2)}s linear infinite}
@keyframes mx{0%{transform:translateX(${xStart}px)}${p(tEnd)},100%{transform:translateX(${xEnd}px)}}
.my{animation:my ${D.toFixed(2)}s ease-in-out infinite}
${WALK_CSS}
`;

  let empty = '';
  let filled = '';
  let jumpFrames = '0%{transform:translateY(0)}';
  let k = 0;

  weeks.forEach((days, i) => {
    const x = PAD_X + i * PITCH;
    const active = days.filter((d) => d.level > 0).sort((a, b) => b.row - a.row); // bottom first
    if (active.length) {
      const h = hit(i);
      jumpFrames += `${p(h - 0.4 * T)}{transform:translateY(0)}${p(h)}{transform:translateY(-${jump}px)}${p(h + 0.4 * T)}{transform:translateY(0)}`;
    }
    for (const d of days) {
      const y = PAD_Y + d.row * PITCH;
      empty += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${colors[0]}"/>`;
    }
    active.forEach((d, stack) => {
      const y = PAD_Y + d.row * PITCH;
      const r = hit(i) + 0.03 + stack * 0.05;
      css += `@keyframes k${k}{0%,${p(r)}{transform:scale(0)}${p(r + 0.08)}{transform:scale(1.3)}${p(r + 0.16)},100%{transform:scale(1)}}\n`;
      filled += `<rect class="c" style="animation-name:k${k}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${colors[d.level]}"/>`;
      k++;
    });
  });
  css += `@keyframes my{${jumpFrames}100%{transform:translateY(0)}}`;

  const ground = `<pattern id="br" width="16" height="8" patternUnits="userSpaceOnUse">
<rect width="16" height="8" fill="#c84c0c"/><path d="M0 .5H16M0 4.5H16M8.5 0V4M.5 4V8" stroke="#000" stroke-opacity=".35"/></pattern>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<defs>${ground}</defs>
<style>${css}</style>
<g>${empty}</g>
<g class="f">${filled}</g>
<rect x="0" y="${groundY}" width="${width}" height="12" fill="url(#br)"/>
<g class="mx"><g class="my"><g transform="translate(0,${groundY - mh})" shape-rendering="crispEdges">${walkingSprite(SCALE)}</g></g></g>
</svg>
`;
}

function renderIcon() {
  const s = 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPRITE_W * s} ${SPRITE_H * s}" width="${SPRITE_W * s}" height="${SPRITE_H * s}" shape-rendering="crispEdges">
<style>${WALK_CSS}</style>${walkingSprite(s)}</svg>
`;
}

async function main() {
  const sample = process.argv.includes('--sample');
  const login = process.env.GITHUB_USER;
  const token = process.env.GITHUB_TOKEN;
  if (!sample && (!login || !token)) {
    throw new Error('Set GITHUB_USER and GITHUB_TOKEN, or pass --sample');
  }
  const weeks = sample ? sampleWeeks() : await fetchWeeks(login, token);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'contrib-hero.svg'), render(weeks, THEMES.light));
  fs.writeFileSync(path.join(OUT_DIR, 'contrib-hero-dark.svg'), render(weeks, THEMES.dark));
  fs.writeFileSync(path.join(OUT_DIR, 'hero.svg'), renderIcon());
  console.log(`Generated ${weeks.length} weeks into ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
