const SEC_HEADERS={
  'User-Agent':'Compounder family investing app admin@agentzen.io',
  'Accept-Encoding':'gzip, deflate'
};

const KNOWN_SHARIAH={
  SPUS:'compliant',AVGO:'compliant',MA:'compliant',ANET:'compliant',PANW:'compliant',NVDA:'compliant',NOW:'compliant',
  MSFT:'questionable',GOOGL:'questionable',META:'questionable',AMZN:'questionable'
};

// Clearly impermissible primary-business SIC groups. Anything not caught here is NOT automatically called halal.
function prohibitedBySic(sic){
  const n=Number(sic); if(!Number.isFinite(n)) return false;
  return (
    (n>=2080&&n<=2087) || // beverages incl. alcoholic
    (n>=2100&&n<=2199) || // tobacco
    (n>=6020&&n<=6099) || // banks / depository institutions
    (n>=6140&&n<=6163) || // consumer credit / mortgage bankers
    (n>=6210&&n<=6289) || // securities brokers / investment services
    (n>=6310&&n<=6399) || // insurance
    n===7993 || n===7999    // coin-operated amusement / misc recreation incl gambling exposure
  );
}

async function fetchJson(url){
  const r=await fetch(url,{headers:SEC_HEADERS});
  if(!r.ok) throw new Error(`SEC_${r.status}`);
  return r.json();
}

async function resolveCompany(symbol){
  const tickers=await fetchJson('https://www.sec.gov/files/company_tickers.json');
  const row=Object.values(tickers).find(x=>String(x.ticker||'').toUpperCase()===String(symbol).toUpperCase());
  if(!row) throw new Error('SEC_COMPANY_NOT_FOUND');
  const cik=String(row.cik_str).padStart(10,'0');
  return {symbol:String(row.ticker).toUpperCase(),name:row.title,cik};
}

function factCandidates(facts,names){
  for(const name of names){
    const f=facts?.['us-gaap']?.[name];
    if(!f?.units) continue;
    const units=Object.values(f.units)[0];
    if(Array.isArray(units)&&units.length) return units;
  }
  return [];
}

function annualSeries(facts,names){
  const rows=factCandidates(facts,names)
    .filter(x=>x.form==='10-K'&&Number.isFinite(Number(x.val))&&x.fy)
    .map(x=>({year:Number(x.fy),value:Number(x.val),filed:x.filed,end:x.end,accn:x.accn}));
  const byYear=new Map();
  for(const r of rows){const prev=byYear.get(r.year);if(!prev||String(r.filed)>String(prev.filed))byYear.set(r.year,r)}
  return [...byYear.values()].sort((a,b)=>a.year-b.year).slice(-11);
}

function latest(series){return series?.length?series[series.length-1]:null}
function prior(series){return series?.length>1?series[series.length-2]:null}
function yoy(series){const a=latest(series),b=prior(series);if(!a||!b||b.value===0)return null;return((a.value-b.value)/Math.abs(b.value))*100}
function cagr(series,years){if(!series?.length)return null;const end=latest(series);const targetYear=end.year-years;const start=series.find(x=>x.year===targetYear);if(!start||start.value<=0||end.value<=0)return null;return(Math.pow(end.value/start.value,1/years)-1)*100}
function pct(v){return Number.isFinite(v)?Math.round(v*10)/10:null}

function metric(facts,key,names){const series=annualSeries(facts,names);return{key,series,latest:latest(series)?.value??null,latestYear:latest(series)?.year??null,yoy:pct(yoy(series)),cagr3:pct(cagr(series,3)),cagr5:pct(cagr(series,5)),cagr10:pct(cagr(series,10))}}

function classifyTrend(m){
  if(m.latest==null) return 'unknown';
  if(m.yoy==null) return 'stable';
  if(m.yoy>=5) return 'improving';
  if(m.yoy<=-10) return 'weakening';
  return 'stable';
}

function healthFromMetrics(metrics){
  const core=[metrics.revenue,metrics.operatingIncome,metrics.netIncome,metrics.operatingCashFlow];
  const known=core.filter(x=>x.yoy!=null);
  if(!known.length)return{status:'unknown',score:null,summary:'Not enough verified annual financial history yet.'};
  let score=0;
  for(const m of known){if(m.yoy>=5)score+=1;else if(m.yoy<=-10)score-=1}
  let status='some-concerns';
  if(score>=2)status='healthy';
  if(score<=-2)status='weakening';
  return{status,score,summary:status==='healthy'?'Core annual financial trends are broadly positive.':status==='weakening'?'Several core annual financial trends are deteriorating.':'The verified financial picture is mixed or relatively stable.'};
}

function shariahStatus(symbol,submissions){
  if(KNOWN_SHARIAH[symbol]) return {status:KNOWN_SHARIAH[symbol],reason:'Current Compounder reviewed classification',method:'reviewed'};
  const sic=Number(submissions?.sic);
  if(prohibitedBySic(sic)) return {status:'non-compliant',reason:`Primary business SIC ${sic} falls in a blocked activity group`,method:'business-activity-screen'};
  return {status:'unknown',reason:'No verified Shariah screen has been completed for this security yet',method:'pending-screen'};
}

export async function buildResearchSnapshot(symbol){
  const company=await resolveCompany(symbol);
  const [facts,submissions]=await Promise.all([
    fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`),
    fetchJson(`https://data.sec.gov/submissions/CIK${company.cik}.json`)
  ]);
  const metrics={
    revenue:metric(facts.facts,'revenue',['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet']),
    operatingIncome:metric(facts.facts,'operatingIncome',['OperatingIncomeLoss']),
    netIncome:metric(facts.facts,'netIncome',['NetIncomeLoss','ProfitLoss']),
    eps:metric(facts.facts,'eps',['EarningsPerShareDiluted']),
    operatingCashFlow:metric(facts.facts,'operatingCashFlow',['NetCashProvidedByUsedInOperatingActivities']),
    capex:metric(facts.facts,'capex',['PaymentsToAcquirePropertyPlantAndEquipment']),
    cash:metric(facts.facts,'cash',['CashAndCashEquivalentsAtCarryingValue','CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']),
    debt:metric(facts.facts,'debt',['LongTermDebtAndFinanceLeaseObligationsCurrent','LongTermDebtCurrent','LongTermDebtNoncurrent'])
  };
  const health=healthFromMetrics(metrics);
  const shariah=shariahStatus(company.symbol,submissions);
  const recent=submissions?.filings?.recent||{};
  const filings=[];
  for(let i=0;i<Math.min(12,recent.form?.length||0);i++){
    if(['10-K','10-Q','8-K'].includes(recent.form[i])) filings.push({form:recent.form[i],filed:recent.filingDate?.[i],period:recent.reportDate?.[i],accession:recent.accessionNumber?.[i],document:recent.primaryDocument?.[i]});
  }
  return {
    symbol:company.symbol,name:company.name,cik:company.cik,
    company:{sic:submissions?.sic||null,sicDescription:submissions?.sicDescription||null,stateOfIncorporation:submissions?.stateOfIncorporation||null,fiscalYearEnd:submissions?.fiscalYearEnd||null},
    shariah,health,metrics,filings,
    sections:{
      business:{status:'available',summary:submissions?.sicDescription?`Primary SEC industry: ${submissions.sicDescription}.`:'SEC company identity is available; detailed business narrative is pending filing-text extraction.'},
      risks:{status:'pending',summary:'Risk-factor text extraction from the latest filing is not yet available.'},
      income:{status:classifyTrend(metrics.revenue),summary:'Verified from SEC XBRL annual filings.'},
      cashFlow:{status:classifyTrend(metrics.operatingCashFlow),summary:'Verified from SEC XBRL annual filings.'},
      balanceSheet:{status:(metrics.cash.latest!=null||metrics.debt.latest!=null)?'available':'unknown',summary:'Cash and debt are taken from verified SEC XBRL facts when reported.'}
    },
    source:'SEC EDGAR / XBRL',generatedAt:new Date().toISOString()
  };
}
