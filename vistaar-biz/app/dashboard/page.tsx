import Link from "next/link";

const nav = ["Overview", "Growth Audit", "Leads", "Experts", "Execution", "Insights"];

export default function Dashboard() {
  return (
    <main className="dash">
      <aside>
        <Link href="/" className="sideBrand"><span className="mark">V<span>AI</span></span><b>Vistaar-Biz</b></Link>
        <small>GROWTH COMMAND CENTRE</small>
        {nav.map((x, i) => <Link key={x} className={i === 0 ? "active" : ""} href={i === 0 ? "/dashboard" : "/dashboard"}>{x}</Link>)}
      </aside>
      <section className="dashMain">
        <header className="dashHead"><div><small>OVERVIEW</small><h1>Your growth at a glance.</h1><p>Three opportunities are ready for action.</p></div><Link className="primary" href="/">Back to Vistaar-Biz</Link></header>
        <div className="dashGrid">
          <article className="big"><small>GROWTH SCORE</small><strong>68<span>/100</span></strong><em>+8 points this month</em></article>
          {[
            ["VISIBILITY","78","Strong"],["TRUST","64","Improve"],["CONVERSION","53","Priority"],["LEAD ENGINE","39","Critical"]
          ].map(x => <article key={x[0]}><small>{x[0]}</small><b>{x[1]}</b><span>{x[2]}</span></article>)}
        </div>
        <div className="panel"><small>WHAT TO DO NEXT</small><h2>Highest-value opportunities</h2>
          {[["Upgrade product gallery","91"],["Turn unanswered reviews into trust","88"],["Build a local lead capture page","82"]].map((x,i)=><div className="rec" key={x[0]}><span>0{i+1}</span><div><b>{x[0]}</b><p>High-impact action identified by Vistaar-Biz AI.</p></div><strong>{x[1]}</strong><Link href="/dashboard">Take action</Link></div>)}
        </div>
      </section>
    </main>
  );
}
