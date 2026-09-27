import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import fixture from './magnusCarlsenStatistics.json';
import './magnus-statistics.css';

const n = (value: number) => new Intl.NumberFormat('en-US').format(value);
const colors = { standard: '#aa94e3', rapid: '#7f8fcb', blitz: '#c6a9ec' };
type Series = keyof typeof colors;
type Opening = (typeof fixture.openings.white)[number];

function Card({ title, source, subtitle, className = '', children }: { title: string; source: string; subtitle?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.unobserve(entry.target);
    }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <section ref={ref} className={`mag-card ${visible ? 'is-visible' : ''} ${className}`}><header className="mag-card-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><span className="mag-source">{source}</span></header>{children}</section>;
}

function Count({ value, suffix = '', decimals = 0 }: { value: number; suffix?: string; decimals?: number }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
      const start = performance.now();
      let frame = 0;
      const tick = (time: number) => { const p = Math.min(1, (time - start) / 620); setShown(value * (1 - (1 - p) ** 3)); if (p < 1) frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }, { threshold: .2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);
  return <span ref={ref}>{decimals ? shown.toFixed(decimals) : n(Math.round(shown))}{suffix}</span>;
}

function Overview() {
  const { career, ratings } = fixture;
  return <><div className="mag-section-title"><div><span className="mag-eyebrow">PLAYER DOSSIER / 01</span><h2>Career overview</h2></div><div className="mag-scope-switch"><span className="selected">Career</span><span title="Recent dataset unavailable">Recent</span><span title="See ChessScope library section below">Library</span></div></div>
    <div className="mag-summary-grid">
      <div className="mag-summary"><small>Career games <i>365Chess</i></small><strong><Count value={career.games} /></strong><span>2000–2026 database coverage</span></div>
      <div className="mag-summary"><small>Career score <i>365Chess</i></small><strong><Count value={career.scorePct} decimals={2} suffix="%" /></strong><span>Wins + half of draws</span><div className="mag-summary-track"><b style={{width:`${career.scorePct}%`}} /></div></div>
      <div className="mag-summary"><small>Unbeaten <i>365Chess</i></small><strong><Count value={career.nonLossPct} decimals={2} suffix="%" /></strong><span>{n(career.nonLossGames)} of {n(career.games)} games</span><div className="mag-summary-track"><b style={{width:`${career.nonLossPct}%`}} /></div></div>
      <div className="mag-summary"><small>World rank <i>FIDE</i></small><strong>#<Count value={1} /></strong><span>{n(ratings.current.standard.rating)} classical · Sep 2026</span></div>
    </div></>;
}

function RatingTrajectory() {
  const data = fixture.ratings.monthlyHistory;
  const [selected, setSelected] = useState<'all' | Series>('all');
  const [hover, setHover] = useState<number | null>(null);
  const active = (Object.keys(colors) as Series[]).filter(key => selected === 'all' || key === selected);
  const values = data.flatMap(row => active.map(key => row[key]));
  const low = Math.floor((Math.min(...values) - 16) / 20) * 20;
  const high = Math.ceil((Math.max(...values) + 16) / 20) * 20;
  const x = (i: number) => 58 + i * 904 / (data.length - 1);
  const y = (rating: number) => 254 - (rating - low) / (high - low) * 212;
  const month = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-US', { month:'short', year:'numeric' });
  const focused = hover === null ? data.length - 1 : hover;
  return <Card title="Rating trajectory" subtitle="Official FIDE monthly rating history · Feb 2023–Sep 2026" source="FIDE" className="mag-span-12 mag-rating">
    <div className="mag-rating-top"><div className="mag-rating-current">{(Object.keys(colors) as Series[]).map(key=><div key={key}><span style={{color:colors[key]}}>● {key}</span><strong>{fixture.ratings.current[key].rating}</strong></div>)}</div><div className="mag-segments" aria-label="Rating series">{(['all','standard','rapid','blitz'] as const).map(key=><button key={key} className={selected===key?'active':''} onClick={()=>setSelected(key)}>{key==='all'?'All':key}</button>)}</div></div>
    <div className="mag-rating-plot" onPointerLeave={()=>setHover(null)}><svg viewBox="0 0 1000 288" role="img" aria-label="FIDE standard, rapid and blitz ratings from February 2023 through September 2026">
      {[0,.25,.5,.75,1].map((tick,i)=>{const rating=Math.round(low+(high-low)*(1-tick));const yy=42+tick*212;return <g key={i}><line x1="58" x2="962" y1={yy} y2={yy} className="mag-gridline"/><text x="48" y={yy+4} textAnchor="end" className="mag-axis">{rating}</text></g>})}
      {active.map(key=><polyline key={key} className="mag-rating-line" points={data.map((row,i)=>`${x(i)},${y(row[key])}`).join(' ')} stroke={colors[key]} />)}
      {[0,9,20,31,43].map(i=><text key={i} x={x(i)} y="282" textAnchor={i===0?'start':i===43?'end':'middle'} className="mag-axis">{month(data[i].period)}</text>)}
      {hover!==null && <><line x1={x(hover)} x2={x(hover)} y1="42" y2="254" className="mag-crosshair"/>{active.map(key=><circle key={key} cx={x(hover)} cy={y(data[hover][key])} r="5" fill={colors[key]} stroke="var(--color-bg-secondary)" strokeWidth="2"/>)}</>}
      <rect x="58" y="34" width="904" height="225" fill="transparent" onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(data.length-1,Math.round(((event.clientX-rect.left)/rect.width)*(data.length-1)))));}} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(data.length-1,Math.round(((event.clientX-rect.left)/rect.width)*(data.length-1)))));}}/>
    </svg>{hover!==null && <div className="mag-chart-tooltip" style={{left:`${Math.min(76,Math.max(6,hover/(data.length-1)*88))}%`}}><strong>{month(data[focused].period)}</strong>{active.map(key=>{const change=focused?data[focused][key]-data[focused-1][key]:0;return <span key={key}><i style={{background:colors[key]}}/>{key}<b>{data[focused][key]} <em>{change>0?`↑${change}`:change<0?`↓${-change}`:'—'}</em></b></span>})}</div>}</div>
    <div className="mag-peak-strip">{(Object.keys(colors) as Series[]).map(key=><span key={key}><i style={{background:colors[key]}}/>{key} peak <b>{fixture.ratings.peaks[key].rating}</b> · {month(fixture.ratings.peaks[key].period)}</span>)}</div>
  </Card>;
}

function CareerResults() {
  const career = fixture.career;
  const entries = [{label:'Wins',value:career.wins,pct:career.winPct,color:'#91b69e'},{label:'Draws',value:career.draws,pct:career.drawPct,color:'#9e98b5'},{label:'Losses',value:career.losses,pct:career.lossPct,color:'#c48791'}];
  const [hover,setHover]=useState<number|null>(null);
  let offset=0;
  return <Card title="Career results" source="365Chess Career" className="mag-span-5"><div className="mag-donut-layout"><div className="mag-donut"><svg viewBox="0 0 220 220" role="img" aria-label="Career results: 1745 wins, 1636 draws and 587 losses"><circle cx="110" cy="110" r="79" className="mag-donut-base"/>{entries.map((entry,i)=>{const dash=entry.pct*4.963;const start=offset;offset+=dash;return <circle key={entry.label} cx="110" cy="110" r="79" fill="none" stroke={entry.color} strokeWidth={hover===i?27:23} strokeDasharray={`${dash} ${496.3-dash}`} strokeDashoffset={-start} transform="rotate(-90 110 110)" className="mag-donut-segment" onPointerEnter={()=>setHover(i)} onPointerLeave={()=>setHover(null)}/>})}</svg><div className="mag-donut-center"><strong>{hover===null?n(career.games):n(entries[hover].value)}</strong><span>{hover===null?'career games':`${entries[hover].label.toLowerCase()} · ${entries[hover].pct}%`}</span></div></div><div className="mag-donut-legend">{entries.map((entry,i)=><div key={entry.label} onPointerEnter={()=>setHover(i)} onPointerLeave={()=>setHover(null)}><i style={{background:entry.color}}/><span>{entry.label}</span><strong>{n(entry.value)}</strong><small>{entry.pct}%</small></div>)}</div></div></Card>;
}

function Efficiency() {
  const c=fixture.career;
  const entries=[{label:'Score',pct:c.scorePct,note:'Wins + ½ draws',color:'#aa94e3'},{label:'Non-loss rate',pct:c.nonLossPct,note:'Wins + draws',color:'#91b69e'},{label:'Decisive games',pct:c.decisivePct,note:'Wins + losses',color:'#c6a9ec'}];
  return <Card title="Career efficiency" source="Derived · 365Chess Career" className="mag-span-7"><div className="mag-efficiency">{entries.map(entry=><div key={entry.label}><div className="mag-ring" style={{'--ring':entry.color,'--pct':`${entry.pct}%`} as CSSProperties}><span>{entry.pct}%</span></div><strong>{entry.label}</strong><small>{entry.note}</small></div>)}</div></Card>;
}

function OpeningRepertoire() {
  const [color,setColor]=useState<'white'|'black'>('white');
  const entries=fixture.openings[color];
  const max=Math.max(...entries.map(item=>item.games));
  return <Card title="Opening repertoire" source="365Chess Career" className="mag-span-7"><div className="mag-card-controls"><span>Most frequent ECO systems by color</span><div className="mag-segments">{(['white','black'] as const).map(side=><button className={color===side?'active':''} key={side} onClick={()=>setColor(side)}>{side}</button>)}</div></div><div className="mag-opening-bars">{entries.map(item=><div className="mag-opening-row" key={item.eco+item.name} title={`${item.eco} · ${item.name} · ${item.games} games`}><b>{item.eco}</b><span>{item.name}</span><div className="mag-opening-track"><i style={{width:`${item.games/max*100}%`}} /></div><strong>{item.games}<small> games</small></strong></div>)}</div><p className="mag-note">Counts show opening frequency; result splits are unavailable for this dataset.</p></Card>;
}

function RepertoireMap() {
  const white=fixture.openings.white;
  const black=fixture.openings.black;
  const total=[...white,...black].reduce((sum,item)=>sum+item.games,0);
  const group=(label:string,items:Opening[],tone:string)=><div className={`mag-map-group ${tone}`}><span>{label}</span><div style={{height:`${210*items.reduce((sum,item)=>sum+item.games,0)/total}px`}}>{items.map(item=><div key={item.eco+item.name} style={{flexGrow:item.games}} title={`${item.name}: ${item.games} games`}><b>{item.eco}</b><small>{item.name}</small><strong>{item.games}</strong></div>)}</div></div>;
  return <Card title="Most frequent systems" source="365Chess Career" className="mag-span-5"><div className="mag-treemap">{group('White',white,'light')}{group('Black',black,'dark')}</div></Card>;
}

function RatedActivity() {
  const [visible,setVisible]=useState<Record<Series,boolean>>({standard:true,rapid:true,blitz:true});
  const years=fixture.fideRatedActivity.years;
  const max=Math.max(...years.map(row=>row.total));
  const parts=Object.keys(colors) as Series[];
  return <Card title="Rated activity" subtitle="FIDE-rated games by time control" source="FIDE" className="mag-span-7"><div className="mag-activity-key">{parts.map(key=><button key={key} className={!visible[key]?'muted':''} onClick={()=>setVisible({...visible,[key]:!visible[key]})}><i style={{background:colors[key]}}/>{key}</button>)}</div><div className="mag-activity-chart">{years.map(row=><div className="mag-activity-year" key={row.year} title={`${row.year}: Standard ${row.standard}, Rapid ${row.rapid}, Blitz ${row.blitz} · Total ${row.total}`}><strong>{parts.reduce((sum,key)=>sum+(visible[key]?row[key]:0),0)}</strong><div className="mag-stack">{parts.map(key=><i key={key} style={{height:`${visible[key]?row[key]/max*100:0}%`,background:colors[key]}} />)}</div><span>{row.year}{row.partial?'*':''}</span></div>)}</div><p className="mag-note">* 2023 covers Feb–Dec in this fixture; 2026 is year to date.</p></Card>;
}

function CurrentVsPeak() {
  return <Card title="Current vs peak" source="FIDE" className="mag-span-5"><div className="mag-peak-bars">{(Object.keys(colors) as Series[]).map(key=>{const current=fixture.ratings.current[key].rating;const peak=fixture.ratings.peaks[key];return <div key={key}><div><b>{key}</b><span>{current} / {peak.rating}</span><strong>{peak.currentVsPeakPct}%</strong></div><div className="mag-peak-track"><i style={{width:`${peak.currentVsPeakPct}%`,background:colors[key]}}/><em/></div><small>{peak.currentDifference} Elo from {peak.period}</small></div>})}</div></Card>;
}

function WorldTitles() {
  const data=fixture.worldTitles;
  return <Card title="World titles" source="FIDE" className="mag-span-12 mag-titles"><div className="mag-titles-body"><div className="mag-titles-total"><strong>{data.combinedMainFideWorldTitles}</strong><span>senior individual world titles<br/>across three time controls</span></div><div className="mag-medal-rows">{(['classical','rapid','blitz'] as const).map(key=><div key={key}><span>{key}<b>{data[key].count}</b></span><div>{data[key].years.map(year=><i key={year} title={key==='blitz'&&year===2024?data.blitz.notes['2024']:`${key} world title · ${year}`}>{year}</i>)}</div></div>)}</div></div><p className="mag-note">World Cup winner · 2023. The 2024 Blitz title was shared with Ian Nepomniachtchi.</p></Card>;
}

function Timeline() {
  return <Card title="Career milestones" source="FIDE · career record" className="mag-span-12"><div className="mag-timeline">{fixture.careerMilestones.map((item,index)=><div key={`${item.year}-${index}`}><span>{item.year}</span><i/><strong>{item.title}</strong>{'value' in item && <small>{item.value} Elo</small>}</div>)}</div></Card>;
}

function Coverage() {
  const rows=fixture.datasetCoverage;
  const max=Math.max(...rows.map(item=>item.games));
  return <Card title="Game coverage" subtitle="Different databases include different game sets" source="Source comparison" className="mag-span-7"><div className="mag-coverage">{rows.map(item=><div key={item.name}><div><strong>{item.name}</strong><b>{n(item.games)}</b></div><div className="mag-coverage-track"><i style={{width:`${item.games/max*100}%`}}/></div><small>{item.usedFor}</small></div>)}</div><p className="mag-note">Totals differ because each database covers a different mix of formats, dates and events.</p></Card>;
}

function RecentEvents() {
  return <Card title="Recent events" source="365Chess" className="mag-span-5"><div className="mag-events">{fixture.recentEvents.map(item=><div key={item.name}><time>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}</time><strong>{item.name}</strong><small>{item.country} · Field average {item.fieldAverageElo} Elo</small></div>)}</div></Card>;
}

function LocalLibrary() {
  const d=fixture.chessscopeLocalSnapshot;
  return <Card title="ChessScope library" subtitle="Local indexed games and the current profile sample" source="ChessScope Library" className="mag-span-12"><div className="mag-local-grid"><div><strong>{n(d.gamesInLibrary)}</strong><span>games indexed</span></div><div><strong>{d.gamesLoaded}</strong><span>recent games loaded</span></div><div><strong>{d.gamesWithoutLoss}</strong><span>without a loss in sample</span></div><div><strong>{d.eventsPlayed}</strong><span>events in sample</span></div></div><p className="mag-note">Sample metrics come from the local ChessScope profile and do not represent the full career dataset.</p></Card>;
}

export function MagnusStatistics() {
  return <div className="mag-dossier"><Overview/><div className="mag-chart-grid"><RatingTrajectory/><CareerResults/><Efficiency/><OpeningRepertoire/><RepertoireMap/><RatedActivity/><CurrentVsPeak/><WorldTitles/><Timeline/><Coverage/><RecentEvents/><LocalLibrary/></div></div>;
}
