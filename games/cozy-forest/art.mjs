import {ANIMALS} from './rules.mjs?v=20261021-balance';
const outline='#694f43';
export function animal(type,cls='') {
  const a=ANIMALS[type], c=a.color;
  const ears=[
    `<ellipse cx="28" cy="24" rx="10" ry="22" fill="${c}"/><ellipse cx="67" cy="24" rx="10" ry="22" fill="${c}"/><ellipse cx="28" cy="22" rx="4" ry="14" fill="#ffdedf"/><ellipse cx="67" cy="22" rx="4" ry="14" fill="#ffdedf"/>`,
    `<path d="M16 50 12 11Q31 13 39 35M57 35Q70 14 84 11L80 52" fill="${c}"/><path d="m19 34-2-14 14 16m32 0 14-16-2 14" fill="#ffe9d1"/>`,
    `<circle cx="22" cy="32" r="14" fill="${c}"/><circle cx="74" cy="32" r="14" fill="${c}"/><circle cx="22" cy="32" r="7" fill="#e2c6ac"/><circle cx="74" cy="32" r="7" fill="#e2c6ac"/>`,
    `<path d="M15 51 14 16Q30 17 38 35M58 35Q70 17 82 16L82 53" fill="${c}"/><path d="m21 35-1-10 11 12m34 0 11-12-1 10" fill="#e7cef2"/>`,
    `<circle cx="26" cy="34" r="16" fill="${c}"/><circle cx="70" cy="34" r="16" fill="${c}"/>`,
    `<path d="M40 34Q32 10 43 17L49 29Q53 7 58 17L56 36" fill="${c}"/>`,
    `<circle cx="22" cy="30" r="14" fill="#596566"/><circle cx="74" cy="30" r="14" fill="#596566"/>`,
    `<ellipse cx="17" cy="52" rx="12" ry="26" transform="rotate(12 17 52)" fill="#9e7b5c"/><ellipse cx="79" cy="52" rx="12" ry="26" transform="rotate(-12 79 52)" fill="#9e7b5c"/>`,
  ][type];
  const patch=type===1?'<path d="M17 53Q24 74 48 80Q72 74 79 53Q62 49 48 62Q34 49 17 53" fill="#fff1df"/>':type===6?'<ellipse cx="33" cy="52" rx="12" ry="15" transform="rotate(25 33 52)" fill="#596566"/><ellipse cx="63" cy="52" rx="12" ry="15" transform="rotate(-25 63 52)" fill="#596566"/>':type===2||type===7?'<ellipse cx="48" cy="65" rx="19" ry="14" fill="#f5e6d2"/>':'';
  const eyes=type===6?'#fff':outline;
  return `<svg class="animal-art ${cls}" viewBox="0 0 96 96" aria-hidden="true">${ears}<ellipse cx="48" cy="55" rx="34" ry="30" fill="${type===6?'#fff9ed':c}"/>${patch}<ellipse cx="26" cy="63" rx="7" ry="4" fill="#e88e92" opacity=".48"/><ellipse cx="70" cy="63" rx="7" ry="4" fill="#e88e92" opacity=".48"/><ellipse cx="34" cy="52" rx="3.2" ry="4.1" fill="${eyes}"/><ellipse cx="62" cy="52" rx="3.2" ry="4.1" fill="${eyes}"/><circle cx="35" cy="50.5" r="1" fill="white"/><circle cx="63" cy="50.5" r="1" fill="white"/>${type===5?'<path d="m42 62 6-4 6 4-6 6Z" fill="#cf8d40"/>':`<path d="M44 61Q48 57 52 61Q51 65 48 65Q45 65 44 61" fill="${outline}"/><path d="M48 65v3m-7 0q3 5 7 0 4 5 7 0" fill="none" stroke="${outline}" stroke-width="2" stroke-linecap="round"/>`}${type===3?'<path d="m21 62-11-2m12 7-10 3m63-8 11-2m-12 7 10 3" stroke="#836c9c" stroke-width="1.5" stroke-linecap="round"/>':''}</svg>`;
}
const paths={
  leaf:'<path d="M29 8C10 7 6 17 11 25S29 28 29 8Z" fill="#97b984"/><path d="m9 31 14-15"/>',
  magnet:'<path d="M9 10v11a9 9 0 0 0 18 0V10" stroke="#db8c79" stroke-width="7"/><path d="M9 8v6m18-6v6" stroke="#e7e6d4" stroke-width="7"/><path d="m16 4 2 3m16 10-3 1"/>',
  undo:'<path d="M11 13h12a9 9 0 1 1-4 17" stroke="#799c66" stroke-width="3"/><path d="m14 7-6 6 6 6" stroke="#799c66" stroke-width="3"/>',
  shuffle:'<path d="M5 10h5c8 0 8 16 16 16h5M5 26h5c8 0 8-16 16-16h5m-5-4 5 4-5 4m0 8 5 4-5 4" stroke="#78a6b4" stroke-width="2.7"/>',
  hint:'<path d="M12 25c1-7-5-8-3-14 3-10 19-8 19 2 0 5-6 8-5 12Z" fill="#f0cf79"/><path d="M13 28h9m-7 4h5M18 10v7m-4-3 4 3 4-3" stroke="#b89a50" stroke-width="2"/>',
  hammer:'<path d="m12 29 12-17" stroke="#ac8965" stroke-width="7"/><path d="m14 7 7-2 10 8-5 8-5-1-9-8Z" fill="#c6aa81"/><path d="m5 20 4-1m21 10 2 3"/>',
  freeze:'<path d="M18 3v30M5 10l26 16M5 26l26-16m-17-3 4 4 4-4m-8 22 4-4 4 4M7 8l1 6-6 1m32 6-6 1 1 6M6 21l6 1-1 6m19-20-1 6 6 1" stroke="#87b6cd" stroke-width="2.3"/>',
  slot:'<path d="M8 12h20l3 17q-13 8-26 0Z" fill="#cbabdb"/><path d="m9 8 5 4m13-4-5 4M18 19v10m-5-5h10" stroke="#866397" stroke-width="2.5"/>',
  time:'<path d="M10 10h17v21H10Z" fill="#e6bf6d"/><path d="M9 7h19v5H9Z" fill="#ac8552"/><path d="M18 17v10m-5-5h10" stroke="#fff9e8" stroke-width="2.5"/>',
  basket:'<path d="m5 17 4 14h18l4-14Z" fill="#c99c70"/><path d="M10 17C10 2 26 2 26 17M5 17h26m-18 4 1 7m8-7-1 7" stroke="#95734e" stroke-width="2.5"/>',
  fever:'<path d="m18 3 4.5 9.5L33 14l-7.5 7.5L27 32l-9-5-9 5 1.5-10.5L3 14l10.5-1.5Z" fill="#edbc67"/><path d="m13 17 2 1m6-1 2-1m-8 6q3 3 6 0" stroke="#a27940" stroke-width="1.8"/>',
  sound:'<path d="M6 15h6l8-7v20l-8-7H6Z" fill="currentColor"/><path d="M25 12q8 6 0 12m-1-8q3 2 0 4"/>',
  mute:'<path d="M6 15h6l8-7v20l-8-7H6Z" fill="currentColor"/><path d="m25 14 7 8m0-8-7 8"/>',
  pause:'<path d="M12 9v18m12-18v18" stroke-width="5"/>',
  play:'<path d="m13 7 17 11-17 11Z" fill="currentColor" stroke="none"/>',
  help:'<circle cx="18" cy="18" r="13"/><path d="M14 13a4 4 0 1 1 6 4q-2 1-2 4m0 4h.1"/>',
  coin:'<circle cx="18" cy="18" r="14" fill="#efcd83" stroke="#d5ac59"/><path d="m18 9 2.5 5.5 6 .7-4.5 4 1.2 6-5.2-3-5.2 3 1.2-6-4.5-4 6-.7Z" fill="#c59a48" stroke="none"/>',
  check:'<path d="m8 18 7 7L29 10" stroke-width="3"/>',
  close:'<path d="m10 10 16 16m0-16L10 26"/>',
  home:'<path d="m5 17 13-12 13 12M9 15v16h18V15m-13 16V21h8v10"/>',
};
export function icon(id,cls='') {return `<svg class="icon ${cls}" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]||paths.leaf}</svg>`;}
export const scenery=`<svg class="scenery" viewBox="0 0 900 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#edf0d8"/><stop offset="1" stop-color="#d9e5c2"/></linearGradient><linearGradient id="grass" x2="0" y2="1"><stop stop-color="#b8ce9b"/><stop offset="1" stop-color="#98b581"/></linearGradient></defs><path fill="url(#sky)" d="M0 0h900v760H0Z"/><circle cx="745" cy="117" r="45" fill="#fff3cb" opacity=".8"/><path d="M0 350Q180 200 360 350T900 300v460H0" fill="#c7d7ac"/><path d="M0 470Q260 320 490 430T900 390v370H0" fill="url(#grass)"/><path d="M310 760Q350 500 650 390Q390 510 470 760" fill="#d9d2ab" opacity=".6"/><g fill="#809c72"><ellipse cx="-8" cy="270" rx="118" ry="200"/><ellipse cx="925" cy="285" rx="145" ry="226"/></g><g fill="#9bb487"><ellipse cx="35" cy="230" rx="100" ry="153"/><ellipse cx="874" cy="224" rx="98" ry="160"/></g><g fill="#b0c399"><ellipse cx="-5" cy="170" rx="80" ry="115"/><ellipse cx="915" cy="150" rx="92" ry="122"/></g><g stroke="#7e966b" stroke-width="18" fill="none" stroke-linecap="round"><path d="m13 450-9-235m-2 116 40-47M890 450l22-243m-12 127-34-48"/></g><g fill="#fff8db"><path d="M100 644q-12-20 4-13 6-22 12-3 23-6 9 9 22 11 0 14-1 22-13 8-19 12-12-15Z"/><path d="M777 595q-12-20 4-13 6-22 12-3 23-6 9 9 22 11 0 14-1 22-13 8-19 12-12-15Z"/></g><g fill="#eac879"><circle cx="114" cy="642" r="5"/><circle cx="791" cy="593" r="5"/></g><g stroke="#718f63" stroke-width="3" fill="none"><path d="m81 723 4-17 7 13m711-52 4-17 7 13M186 570l4-17 7 13m535 176 4-17 7 13"/></g></svg>`;
