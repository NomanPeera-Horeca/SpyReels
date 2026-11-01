/**
 * Founder review pack: blind A/B of what the AI showed real customers during
 * onboarding (stored in production) vs what today's code shows the same
 * customer.
 *
 *   --select --fixtures=<cases.json> --n=30 --seed=<text>
 *       prints `ids=R001,...` (for GITHUB_OUTPUT) and counts. Eligible: the
 *       customer was shown at least one AI goal, audience or pillar.
 *   --build --fixtures=<cases.json> --after=<report stem> --seed=<text> --out=<file.html>
 *       writes a self-contained review page. The A/B key (case id -> which
 *       side is new) is printed to the log; no profile text is printed.
 *
 * The page contains customers' public profile text, so it is uploaded only as
 * a private CI artifact and never committed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEvalCases } from "../server/personalization/intelligence/eval/caseSource";
import type { EvalCase } from "../server/personalization/intelligence/eval/fixtures";
import type { EvalReport } from "../server/personalization/intelligence/eval/runEval";

type Side = {
  niche: string | null;
  goal: string | null;
  audiences: Array<{ who: string; outcome: string }>;
  pillars: Array<{ title: string; description: string }>;
};

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function rng(seedText: string) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const shownSomething = (s: Side | undefined) =>
  Boolean(s && (s.goal || s.audiences.length || s.pillars.length));

function select(cases: EvalCase[]) {
  const n = Number(arg("n") ?? 30);
  const seed = arg("seed") ?? "review";
  const eligible = cases.filter(c => shownSomething(c.productionShown));
  const nothing = cases.filter(c => !shownSomething(c.productionShown));
  const picked = shuffle(eligible, rng(seed)).slice(0, n).map(c => c.id).sort();
  console.log(JSON.stringify({
    customers: cases.length,
    shownSomething: eligible.length,
    shownNothing: nothing.length,
    shownNothingIds: nothing.map(c => c.id),
    picked: picked.length,
    linkedPicked: picked.filter(id => id.startsWith("R")).length,
    notPostingPicked: picked.filter(id => id.startsWith("N")).length,
  }));
  console.log(`ids=${picked.join(",")}`);
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function sideHtml(label: string, s: Side): string {
  const empty = '<p class="empty">Nothing shown</p>';
  return `<div class="side"><div class="tag">${label}</div>
    <h4>Niche</h4>${s.niche ? `<p>${esc(s.niche)}</p>` : empty}
    <h4>Goal</h4>${s.goal ? `<p>${esc(s.goal)}</p>` : empty}
    <h4>Audiences</h4>${s.audiences.length ? `<ul>${s.audiences.map(a => `<li><b>${esc(a.who)}</b>${a.outcome ? ` → ${esc(a.outcome)}` : ""}</li>`).join("")}</ul>` : empty}
    <h4>Pillars</h4>${s.pillars.length ? `<ul>${s.pillars.map(p => `<li><b>${esc(p.title)}</b>${p.description ? `<br><span class="muted">${esc(p.description)}</span>` : ""}</li>`).join("")}</ul>` : empty}
  </div>`;
}

function profileHtml(c: EvalCase): string {
  const posts = [...(c.snapshot?.posts ?? [])]
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .map(p => (p.caption ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);
  const ev = c.snapshot?.profileEvidence;
  return `<div class="profile">
    <div class="who">${esc(c.displayName ?? ev?.displayName ?? (c.typedNiche ? "Not posting yet" : "(no name)"))}
      <span class="muted">${esc(c.platform ?? "")}${ev?.username ? ` · @${esc(ev.username)}` : ""}</span></div>
    ${c.typedNiche ? `<p><b>Niche they picked:</b> ${esc(c.typedNiche.label)}</p>` : ""}
    ${c.bio || ev?.bio ? `<p><b>Bio:</b> ${esc(c.bio ?? ev?.bio)}</p>` : ""}
    ${ev?.category ? `<p><b>Category:</b> ${esc(ev.category)}</p>` : ""}
    ${posts.length ? `<details><summary>Top posts (${posts.length})</summary><ol>${posts.map(p => `<li>${esc(p.slice(0, 220))}</li>`).join("")}</ol></details>` : '<p class="muted">No post captions.</p>'}
  </div>`;
}

function build(cases: EvalCase[]) {
  const seed = arg("seed") ?? "review";
  const afterStem = arg("after");
  const out = arg("out");
  if (!afterStem || !out) throw new Error("Pass --after=<stem> and --out=<file>.");
  const dir = path.resolve(import.meta.dirname, "../docs/evals/personalization-intelligence");
  const report = JSON.parse(readFileSync(path.join(dir, `${afterStem}.json`), "utf8")) as EvalReport;
  const rand = rng(`${seed}:sides`);
  const key: Array<{ id: string; newSide: "A" | "B" }> = [];
  const cards = shuffle(report.cases, rng(`${seed}:order`)).map((row, index) => {
    const c = cases.find(x => x.id === row.caseId)!;
    const after: Side = {
      niche: row.niche.label,
      goal: row.goal.text ?? null,
      audiences: row.audiences.items.map(a => ({ who: a.who, outcome: a.outcome })),
      pillars: row.pillars.items.map(p => ({ title: p.title, description: p.description })),
    };
    const before = c.productionShown!;
    const newSide = rand() < 0.5 ? "A" : "B";
    key.push({ id: row.caseId, newSide });
    const [a, b] = newSide === "A" ? [after, before] : [before, after];
    return `<section class="card" data-id="${esc(row.caseId)}">
      <div class="num">${index + 1} / ${report.cases.length}</div>
      ${profileHtml(c)}
      <div class="sides">${sideHtml("A", a)}${sideHtml("B", b)}</div>
      <div class="pick" role="group" aria-label="Which is better?">
        ${["A is better", "B is better", "Both good", "Both bad"].map(t => `<button type="button" data-pick="${t}">${t}</button>`).join("")}
      </div>
      <input class="note" type="text" placeholder="Optional note: what is wrong or right?">
    </section>`;
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Strategy Review</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1f2328;--muted:#6b7280;--line:#e5e7eb;--accent:#2563eb;--good:#16a34a;--bad:#dc2626}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1115;--card:#171a21;--ink:#e6e8eb;--muted:#9aa3ae;--line:#2a2f3a;--accent:#60a5fa;--good:#4ade80;--bad:#f87171}}
:root[data-theme="dark"]{--bg:#0f1115;--card:#171a21;--ink:#e6e8eb;--muted:#9aa3ae;--line:#2a2f3a;--accent:#60a5fa;--good:#4ade80;--bad:#f87171}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
header h1{font-size:17px;margin:0;flex:1 1 auto}.progress{color:var(--muted)}
main{max-width:1100px;margin:0 auto;padding:16px}
.intro{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:18px}
.card.done{border-color:var(--accent)}.num{color:var(--muted);font-size:13px}
.profile .who{font-weight:600;font-size:17px}.profile p{margin:6px 0}.muted{color:var(--muted)}
.sides{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}@media(max-width:720px){.sides{grid-template-columns:1fr}}
.side{border:1px solid var(--line);border-radius:10px;padding:12px}.tag{font-weight:700;font-size:18px;color:var(--accent)}
.side h4{margin:10px 0 2px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.side ul{margin:4px 0;padding-left:18px}.side p{margin:2px 0}
.empty{color:var(--bad);font-style:italic}
.pick{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
button{font:inherit;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:8px 12px;cursor:pointer}
button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.note{width:100%;margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}
#copy{background:var(--good);color:#fff;border-color:var(--good)}
</style></head><body>
<header><h1>Strategy review: blind A/B</h1><span class="progress" id="progress"></span><button id="copy" type="button">Copy results</button><button id="dl" type="button">Download results</button></header>
<main>
<div class="intro"><b>How to use:</b> each card is one real SpyReels customer. One side is what the AI showed them during onboarding, the other is what the new version shows today. Sides are shuffled. Pick the one you would rather give this customer, or "Both good" / "Both bad". A short note on bad ones helps most. Your picks save in this browser. When done, press <b>Copy results</b> and paste them into the chat.</div>
${cards.join("\n")}
</main>
<script>
(function(){
  var KEY="sr-review-${esc(seed)}";var state={};try{state=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}render()}
  function render(){var cards=document.querySelectorAll(".card"),done=0;cards.forEach(function(c){var s=state[c.dataset.id]||{};c.querySelectorAll("button[data-pick]").forEach(function(b){b.classList.toggle("on",b.dataset.pick===s.p)});var n=c.querySelector(".note");if(document.activeElement!==n)n.value=s.n||"";c.classList.toggle("done",!!s.p);if(s.p)done++});document.getElementById("progress").textContent=done+" of "+cards.length+" rated"}
  document.addEventListener("click",function(e){var b=e.target.closest("button[data-pick]");if(!b)return;var id=b.closest(".card").dataset.id;state[id]=state[id]||{};state[id].p=b.dataset.pick;save()});
  document.addEventListener("input",function(e){if(!e.target.classList.contains("note"))return;var id=e.target.closest(".card").dataset.id;state[id]=state[id]||{};state[id].n=e.target.value;save()});
  function payload(){return JSON.stringify({pack:"${esc(seed)}",picks:state})}
  document.getElementById("copy").onclick=function(){var t=payload();if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){alert("Copied. Paste it into the chat.")},function(){prompt("Copy this:",t)})}else prompt("Copy this:",t)};
  document.getElementById("dl").onclick=function(){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([payload()],{type:"application/json"}));a.download="review-results.json";a.click()};
  render();
})();
</script></body></html>`;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(JSON.stringify({ reviewCases: key.length, seed }));
  console.log("A/B key (case id -> side showing the NEW version):");
  console.log(JSON.stringify(key));
}

const cases = loadEvalCases(process.argv);
if (process.argv.includes("--select")) select(cases);
else if (process.argv.includes("--build")) build(cases);
else throw new Error("Pass --select or --build.");
