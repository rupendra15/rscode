export type BusinessProfile = {
  businessName: string;
  industry: string;
  city: string;
  goal: string;
  website?: string;
};

export type AuditResult = {
  overall: number;
  maturity: string;
  metrics: { key: string; label: string; score: number; status: string; reason: string }[];
  opportunities: { title: string; area: string; impact: number; effort: "Low"|"Medium"|"High"; reason: string; mode: "AI"|"DIY"|"Expert" }[];
  nextMove: string;
  summary: string;
};

const clamp=(n:number)=>Math.max(20,Math.min(95,Math.round(n)));
const hash=(s:string)=>[...s].reduce((a,c)=>((a*31)+c.charCodeAt(0))%997,7);

export function runGrowthAudit(profile:BusinessProfile):AuditResult{
  const seed=hash(profile.businessName+"|"+profile.city+"|"+profile.industry);
  const localBoost=/rewa|indore|bhopal|jabalpur|pune|delhi|mumbai|bangalore|hyderabad|jaipur/i.test(profile.city)?5:0;
  const siteBoost=profile.website?.trim()?8:0;
  const leadGoal=/lead|revenue|conversion/i.test(profile.goal)?5:0;
  const base=[61+(seed%11),55+((seed>>2)%13),48+((seed>>3)%16),46+((seed>>4)%15),39+((seed>>5)%17)];
  const scores=[
    clamp(base[0]+localBoost+siteBoost),
    clamp(base[1]+localBoost),
    clamp(base[2]+siteBoost),
    clamp(base[3]+leadGoal+siteBoost),
    clamp(base[4]+leadGoal+localBoost)
  ];
  const labels=["Discoverability","Trust & reputation","Content & visuals","Conversion","Lead generation"];
  const reasons=[
    "Local presence and search intent determine how easily nearby customers can find you.",
    "Reviews, proof and business information shape confidence before a customer contacts you.",
    "Visual consistency and useful content influence whether attention becomes interest.",
    "Clear offers, calls-to-action and contact paths reduce friction.",
    "Lead capture and follow-up determine whether demand becomes a measurable opportunity."
  ];
  const metrics=scores.map((score,i)=>({key:labels[i].toLowerCase().replace(/[^a-z]+/g,"-"),label:labels[i],score,status:score>=70?"Strong":score>=55?"Improve":"Priority",reason:reasons[i]}));
  const weighted=metrics.reduce((a,m)=>a+m.score,0)/metrics.length;
  const overall=clamp(weighted);
  const ranked=[...metrics].sort((a,b)=>a.score-b.score);
  const modes=["AI","DIY","Expert"] as const;
  const opportunities=ranked.slice(0,3).map((m,i)=>({
    title:["Build a stronger local enquiry path","Upgrade trust and proof","Turn attention into a repeatable content system"][i],
    area:m.label,
    impact:Math.max(72,96-m.score),
    effort:i===0?"Low":i===1?"Medium":"Medium" as "Low"|"Medium"|"High",
    reason:m.reason,
    mode:modes[(seed+i)%modes.length]
  }));
  const nextMove=opportunities[0].title;
  const maturity=overall>=75?"Ready to scale":overall>=60?"Building momentum":overall>=45?"Needs focus":"Needs a reset";
  return {overall,maturity,metrics,opportunities,nextMove,summary:`${profile.businessName} has a ${maturity.toLowerCase()} foundation. The highest-value opportunity is ${nextMove.toLowerCase()}.`};
}