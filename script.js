const $ = id => document.getElementById(id);
let currentRows = [];
let bondType = 'par';
let currentPV = null;

const fmt = n => new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(Math.round(n || 0));
const fmt2 = n => new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}).format(n || 0);
function money(n){ return fmt(n); }
function toDate(s){ return new Date(s + 'T00:00:00'); }
function fmtDate(d){ return d.toLocaleDateString('en-GB'); }
function addMonths(date, months){ const d = new Date(date); const day = d.getDate(); d.setMonth(d.getMonth() + months); if (d.getDate() !== day) d.setDate(0); return d; }
function sameOrBefore(a,b){ return a.getTime() <= b.getTime() + 86400000/2; }
function monthsBetween(a,b){ return Math.max(1, Math.round((b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth()))); }
function annuityPV(rate, n){ return rate === 0 ? n : (1 - Math.pow(1 + rate, -n)) / rate; }
function singlePV(rate, n){ return Math.pow(1 + rate, -n); }

function getPaymentDates(issueDateStr, firstDateStr, maturityDateStr, ppy){
  const first = toDate(firstDateStr);
  const maturity = toDate(maturityDateStr);
  const step = Math.round(12 / ppy);
  const dates = [];
  let d = new Date(first);
  let guard = 0;
  while (sameOrBefore(d, maturity) && guard < 600){ dates.push(new Date(d)); d = addMonths(d, step); guard++; }
  if (!dates.length || dates[dates.length - 1].toDateString() !== maturity.toDateString()) dates.push(maturity);
  return dates;
}

function getInputs(){
  const ppy = +$('paymentsPerYear').value || 1;
  const dates = getPaymentDates($('issueDate').value, $('firstPaymentDate').value, $('maturityDate').value, ppy);
  const periods = dates.length;
  const face = +$('faceValue').value || 0;
  const coupon = (+$('couponRate').value || 0) / 100;
  const market = (+$('marketRate').value || 0) / 100;
  const cash = face * coupon / ppy;
  const effRate = market / ppy;
  const priceMode = $('priceMode').value;
  const pvPrincipal = face * singlePV(effRate, periods);
  const pvInterest = cash * annuityPV(effRate, periods);
  const calculatedPrice = pvPrincipal + pvInterest;
  const price = priceMode === 'calculate' ? calculatedPrice : (+$('issuePrice').value || 0);
  return { face, price, coupon, market, cash, effRate, ppy, periods, paymentDates: dates, issueDate: $('issueDate').value, firstPaymentDate: $('firstPaymentDate').value, maturityDate: $('maturityDate').value, method: $('method').value, priceMode, pvPrincipal, pvInterest, calculatedPrice };
}

function classify(face, price){ if(Math.abs(face-price)<0.5) return 'par'; return price<face?'discount':'premium'; }

function buildSchedule(){
  const x = getInputs();
  if (x.priceMode === 'calculate') $('issuePrice').value = Math.round(x.calculatedPrice);
  bondType = classify(x.face, x.price);
  currentPV = x;
  currentRows = [];
  let carrying = x.price;
  const totalAmort = Math.abs(x.face - x.price);
  const slAmort = x.periods ? totalAmort / x.periods : 0;
  currentRows.push({period:0, date:fmtDate(toDate(x.issueDate)), cash:0, expense:0, amort:0, carrying, opening:carrying});

  for(let i=1; i<=x.periods; i++){
    const opening = carrying;
    let expense, amort;
    if(x.method === 'effective'){
      expense = opening * x.effRate;
      amort = Math.abs(expense - x.cash);
      carrying = bondType === 'discount' ? opening + amort : bondType === 'premium' ? opening - amort : opening;
    } else {
      amort = slAmort;
      expense = bondType === 'discount' ? x.cash + amort : bondType === 'premium' ? x.cash - amort : x.cash;
      carrying = bondType === 'discount' ? opening + amort : bondType === 'premium' ? opening - amort : opening;
    }
    if(i === x.periods){
      carrying = x.face;
      amort = Math.abs(carrying - opening);
      expense = bondType === 'discount' ? x.cash + amort : bondType === 'premium' ? x.cash - amort : x.cash;
    }
    currentRows.push({period:i, date:fmtDate(x.paymentDates[i-1]), cash:x.cash, expense, amort, carrying, opening});
  }
  render(x);
}

function render(x){
  $('issuePriceWrap').classList.toggle('disabled', x.priceMode === 'calculate');
  $('issuePrice').disabled = x.priceMode === 'calculate';
  $('tableTitle').textContent = bondType==='discount' ? 'Bond Discount Amortization Schedule' : bondType==='premium' ? 'Bond Premium Amortization Schedule' : 'Bond Issued at Par Schedule';
  $('amortHeader').textContent = bondType==='discount' ? 'Discount Amortized' : bondType==='premium' ? 'Premium Amortized' : 'Amortized';
  const discountPremium = Math.abs(x.face - x.price);
  $('summary').innerHTML = `
    <div class="summary-row"><span>Status</span><b><span class="badge">${bondType.toUpperCase()}</span></b></div>
    <div class="summary-row"><span>Face Value</span><b>${money(x.face)}</b></div>
    <div class="summary-row"><span>Issue Price / Proceeds</span><b>${money(x.price)}</b></div>
    <div class="summary-row"><span>${bondType==='premium'?'Premium':bondType==='discount'?'Discount':'Premium/Discount'}</span><b>${bondType==='par'?'-':money(discountPremium)}</b></div>
    <div class="summary-row"><span>Coupon Rate</span><b>${fmt2(x.coupon*100)}%</b></div>
    <div class="summary-row"><span>Market Rate</span><b>${fmt2(x.market*100)}%</b></div>
    <div class="summary-row"><span>Jumlah Periode</span><b>${x.periods}</b></div>
    <div class="summary-row"><span>Payment Dates</span><b>${fmtDate(x.paymentDates[0])} – ${fmtDate(x.paymentDates[x.paymentDates.length-1])}</b></div>
    <div class="summary-row"><span>Method</span><b>${x.method==='effective'?'Effective Interest':'Straight Line'}</b></div>`;

  $('pvBox').innerHTML = `
    <div class="pv-title">Computation of ${bondType==='discount'?'Discount':bondType==='premium'?'Premium':'Issue Price'} on Bonds Payable</div>
    <div class="pv-row"><span>Maturity value of bonds payable</span><b>${money(x.face)}</b></div>
    <div class="pv-row"><span>Present value of principal: ${money(x.face)} × PVF(${fmt2(x.effRate*100)}%, ${x.periods})</span><b>${money(x.pvPrincipal)}</b></div>
    <div class="pv-row"><span>Present value of interest: ${money(x.cash)} × PV-OA(${fmt2(x.effRate*100)}%, ${x.periods})</span><b>${money(x.pvInterest)}</b></div>
    <div class="pv-row total"><span>Proceeds from sale of bonds</span><b>${money(x.price)}</b></div>
    <div class="pv-row ${bondType==='discount'?'red':''}"><span>${bondType==='discount'?'Discount on bonds payable':bondType==='premium'?'Premium on bonds payable':'Issued at par'}</span><b>${bondType==='par'?'-':money(discountPremium)}</b></div>`;

  const body = $('scheduleBody'); body.innerHTML = '';
  currentRows.forEach((r,idx)=>{
    const tr = document.createElement('tr'); tr.dataset.idx = idx;
    tr.innerHTML = `<td>${r.period}</td><td>${r.date}</td><td>${r.period?money(r.cash):'-'}</td><td>${r.period?money(r.expense):'-'}</td><td>${r.period?money(r.amort):'-'}</td><td>${money(r.carrying)}</td>`;
    tr.onclick = () => selectRow(idx); body.appendChild(tr);
  });
  const totals = currentRows.slice(1).reduce((a,r)=>({cash:a.cash+r.cash,expense:a.expense+r.expense,amort:a.amort+r.amort}),{cash:0,expense:0,amort:0});
  $('scheduleFoot').innerHTML = `<tr><td colspan="2">Total</td><td>${money(totals.cash)}</td><td>${money(totals.expense)}</td><td>${money(totals.amort)}</td><td>${money(x.face)}</td></tr>`;
  renderJournal(x); selectRow(1);
}

function selectRow(idx){
  document.querySelectorAll('tbody tr').forEach(r=>r.classList.remove('active'));
  const tr=document.querySelector(`tbody tr[data-idx="${idx}"]`); if(tr)tr.classList.add('active');
  const r=currentRows[idx], x=getInputs();
  if(!r || idx===0){ $('formulaBox').textContent='Baris 0 adalah proceeds/carrying amount awal saat obligasi diterbitkan.'; return; }
  const typeText=bondType==='discount'?'Discount Amortized = Interest Expense − Cash Paid':bondType==='premium'?'Premium Amortized = Cash Paid − Interest Expense':'Tidak ada amortisasi karena issued at par';
  $('formulaBox').textContent = `Harga penerbitan / Proceeds\n= PV Principal + PV Interest\n= ${money(x.pvPrincipal)} + ${money(x.pvInterest)}\n= ${money(x.price)}\n\nPeriode ${r.period} (${r.date})\n\nCash Paid = Face Value × Coupon Rate ÷ pembayaran per tahun\n= ${money(x.face)} × ${fmt2(x.coupon*100)}% ÷ ${x.ppy}\n= ${money(r.cash)}\n\nInterest Expense = Opening Carrying Amount × Market Rate ÷ pembayaran per tahun\n= ${money(r.opening)} × ${fmt2(x.market*100)}% ÷ ${x.ppy}\n= ${money(r.expense)}\n\n${typeText}\n= ${money(r.amort)}\n\nEnding Carrying Amount = ${bondType==='discount'?'Opening + Discount Amortized':bondType==='premium'?'Opening − Premium Amortized':'Opening'}\n= ${money(r.carrying)}`;
}

function renderJournal(x){
  let initial='';
  if(bondType==='discount') initial=`<div class="journal-entry"><b>Jurnal saat penerbitan (${fmtDate(toDate(x.issueDate))})</b><div class="dr"><span>Cash</span><span>${money(x.price)}</span></div><div class="dr"><span>Discount on Bonds Payable</span><span>${money(x.face-x.price)}</span></div><div class="cr"><span>Bonds Payable</span><span>${money(x.face)}</span></div></div>`;
  else if(bondType==='premium') initial=`<div class="journal-entry"><b>Jurnal saat penerbitan (${fmtDate(toDate(x.issueDate))})</b><div class="dr"><span>Cash</span><span>${money(x.price)}</span></div><div class="cr"><span>Bonds Payable</span><span>${money(x.face)}</span></div><div class="cr"><span>Premium on Bonds Payable</span><span>${money(x.price-x.face)}</span></div></div>`;
  else initial=`<div class="journal-entry"><b>Jurnal saat penerbitan (${fmtDate(toDate(x.issueDate))})</b><div class="dr"><span>Cash</span><span>${money(x.price)}</span></div><div class="cr"><span>Bonds Payable</span><span>${money(x.face)}</span></div></div>`;
  const r=currentRows[1]; let interest='';
  if(r){
    if(bondType==='discount') interest=`<div class="journal-entry"><b>Contoh jurnal pembayaran bunga periode 1 (${r.date})</b><div class="dr"><span>Interest Expense</span><span>${money(r.expense)}</span></div><div class="cr"><span>Discount on Bonds Payable</span><span>${money(r.amort)}</span></div><div class="cr"><span>Cash</span><span>${money(r.cash)}</span></div></div>`;
    else if(bondType==='premium') interest=`<div class="journal-entry"><b>Contoh jurnal pembayaran bunga periode 1 (${r.date})</b><div class="dr"><span>Interest Expense</span><span>${money(r.expense)}</span></div><div class="dr"><span>Premium on Bonds Payable</span><span>${money(r.amort)}</span></div><div class="cr"><span>Cash</span><span>${money(r.cash)}</span></div></div>`;
    else interest=`<div class="journal-entry"><b>Contoh jurnal pembayaran bunga periode 1 (${r.date})</b><div class="dr"><span>Interest Expense</span><span>${money(r.expense)}</span></div><div class="cr"><span>Cash</span><span>${money(r.cash)}</span></div></div>`;
  }
  $('journalBox').innerHTML=initial+interest+`<p class="note">Catatan: issuer tidak menyesuaikan nilai obligasi hanya karena harga pasar berubah setelah penerbitan.</p>`;
}

function exportCSV(){
  const rows=[['Period','Date','Cash Paid','Interest Expense','Amortized','Carrying Amount'],...currentRows.map(r=>[r.period,r.date,Math.round(r.cash),Math.round(r.expense),Math.round(r.amort),Math.round(r.carrying)])];
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='bond_issuer_schedule.csv'; a.click();
}

function syncMode(){ const calc = $('priceMode').value === 'calculate'; $('issuePrice').disabled = calc; $('issuePriceWrap').classList.toggle('disabled', calc); }
$('calculate').onclick=buildSchedule;
$('priceMode').onchange=()=>{ syncMode(); buildSchedule(); };
$('loadExample').onclick=()=>{ $('faceValue').value=100000;$('priceMode').value='calculate';$('issuePrice').value=92278;$('couponRate').value=8;$('marketRate').value=10;$('paymentsPerYear').value=2;$('issueDate').value='2025-01-01';$('firstPaymentDate').value='2025-07-01';$('maturityDate').value='2030-01-01';$('method').value='effective';buildSchedule(); };
$('printBtn').onclick=()=>window.print(); $('csvBtn').onclick=exportCSV; syncMode(); buildSchedule();
