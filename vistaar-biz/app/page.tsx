import Link from "next/link";
import { ArrowRight, BarChart3, Bot, CheckCircle2, Sparkles, Users } from "lucide-react";

const modules = [
  ["01", "Growth Audit", "See visibility, trust, content, conversion and lead gaps."],
  ["02", "AI Growth Manager", "Get ranked decisions instead of generic advice."],
  ["03", "Execution Studio", "Turn recommendations into concrete work."],
  ["04", "Leads & Conversion", "Connect growth activity to real opportunities."],
  ["05", "Expert Network", "Bring in trusted specialists when needed."],
  ["06", "Measure & Learn", "Track outcomes and improve the next move."]
];

export default function Home() {
  return (
    <main>
      <header className="nav">
        <Link href="/" className="brand"><span className="mark">V<span>AI</span></span><b>Vistaar-Biz</b></Link>
        <nav><a href="#platform">Platform</a><a href="#how">How it works</a><a href="#experts">Experts</a></nav>
        <Link href="/onboarding" className="navCta">Start free audit <ArrowRight size={15}/></Link>
      </header>

      <section className="hero">
        <div className="heroCopy">
          <div className="eyebrow"><Sparkles size={13}/> AI-POWERED BUSINESS GROWTH PLATFORM</div>
          <h1>Know where to grow.<br/><em>Know what to do next.</em></h1>
          <p>Vistaar-Biz turns your business data and digital presence into a clear growth plan — then helps you execute it, generate leads and measure what actually works.</p>
          <div className="actions"><Link className="primary" href="/onboarding">Get your free growth audit <ArrowRight size={17}/></Link><Link className="secondary" href="/dashboard">Open command centre</Link></div>
        </div>

        <div className="product">
          <div className="productTop"><span>Vistaar-Biz</span><small>AI GROWTH MANAGER</small></div>
          <div className="scoreRow"><div><small>GROWTH SCORE</small><strong>68<span>/100</span></strong><em>+8 this month</em></div><div className="ring">68</div></div>
          <div className="metrics">
            <div><small>VISIBILITY</small><b>78</b><span>Strong</span></div>
            <div><small>TRUST</small><b>64</b><span>Improve</span></div>
            <div><small>CONVERSION</small><b>53</b><span>Priority</span></div>
          </div>
          <div className="priority"><small>AI PRIORITY · 91 IMPACT</small><b>Upgrade product gallery</b><span>Highest-value next action</span></div>
        </div>
      </section>

      <div className="strip"><span>Audit</span><i>→</i><span>Diagnose</span><i>→</i><span>Execute</span><i>→</i><span>Convert</span><i>→</i><span>Learn</span></div>

      <section id="platform" className="section">
        <div className="eyebrow">THE PLATFORM</div>
        <h2>One system for the <em>whole growth loop.</em></h2>
        <div className="moduleGrid">{modules.map(([n,t,d]) => <article key={n}><small>{n}</small><h3>{t}</h3><p>{d}</p><Link href="/dashboard">Explore <ArrowRight size={14}/></Link></article>)}</div>
      </section>

      <section id="how" className="dark section">
        <div className="eyebrow">HOW IT WORKS</div>
        <h2>From uncertainty to <em>momentum.</em></h2>
        <div className="timeline">
          {["Understand","Decide","Execute","Measure"].map((x,i) => <div key={x}><b>0{i+1}</b><h3>{x}</h3><p>{["Audit your current position and find the gaps that matter.","Let AI rank the highest-value opportunities.","Turn the plan into actions, tasks, leads and expert work.","See what moved the numbers and feed it into the next decision."][i]}</p></div>)}
        </div>
      </section>

      <section id="experts" className="section experts">
        <div><div className="eyebrow">THE HUMAN LAYER</div><h2>When you need a person, <em>find the right one.</em></h2><p>Match the exact growth gap with trusted specialists while keeping their work connected to the business goal.</p></div>
        <div className="expertCard">{[["Studio Rewa","Product photography","96% match"],["LocalLift","Local SEO","93% match"],["PixelCraft","Landing pages","89% match"]].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span><strong>{x[2]}</strong></div>)}</div>
      </section>

      <section className="final"><div><h2>Growth gets easier when the <em>next move is clear.</em></h2><Link className="primary" href="/onboarding">Create your workspace <ArrowRight size={16}/></Link></div></section>
      <footer>Vistaar-Biz · AI-powered growth infrastructure for ambitious businesses.</footer>
    </main>
  );
}
