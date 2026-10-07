export type BusinessProfile = {
  businessName: string;
  industry: string;
  city: string;
  serviceArea?: string;
  idealCustomer?: string;
  offerings?: string;
  differentiator?: string;
  goal: string;
  target?: string;
  constraint?: string;
  channels?: string;
  monthlyLeads?: string;
  conversion?: string;
  challenge?: string;
  notes?: string;
  website?: string;
  google?: string;
  instagram?: string;
  otherLinks?: string;
};

export type GoogleAuditSignals = {
  website:string;
  rating:number|null;
  reviewCount:number|null;
  websiteClicks:number;
  phoneCalls:number;
  directionRequests:number;
  signals:string[];
};

export type LocalAuditSignals = {
  found:boolean;
  matchedName:boolean;
  displayName:string;
  nearbyCount:number;
  category:string;
  signals:string[];
};

export type SiteAuditSignals = {
  website:string;
  reachable:boolean;
  https:boolean;
  title:string;
  hasCta:boolean;
  hasContactPath:boolean;
  hasReviews:boolean;
  hasLocalTerms:boolean;
  hasImages:boolean;
  imageCount:number;
  wordCount:number;
  signals:string[];
};

export type AuditResult = {
  overall:number;
  maturity:string;
  metrics:{key:string;label:string;score:number;status:string;reason:string}[];
  opportunities:{
    title:string;
    area:string;
    impact:number;
    effort:"Low"|"Medium"|"High";
    reason:string;
    mode:"AI"|"DIY"|"Expert";
    specialist:string;
  }[];
  nextMove:string;
  summary:string;
  dataSources:string[];
  site?:SiteAuditSignals;
  local?:LocalAuditSignals;
  google?:GoogleAuditSignals;
  reasoning:string[];
  diagnosticBasis:string[];
};

const clamp=(n:number)=>Math.max(20,Math.min(95,Math.round(n)));
const has=(value:string|undefined,patterns:RegExp[])=>Boolean(value&&patterns.some(p=>p.test(value)));
const text=(value:string|undefined)=>String(value||"").trim().toLowerCase();

export function runGrowthAudit(
  profile:BusinessProfile,
  site?:SiteAuditSignals,
  local?:LocalAuditSignals,
  google?:GoogleAuditSignals
):AuditResult{
  const goal=text(profile.goal);
  const challenge=text(profile.challenge);
  const constraint=text(profile.constraint);
  const channels=text(profile.channels);
  const target=text(profile.target);
  const audience=text(profile.idealCustomer);
  const offer=text(profile.offerings);
  const differentiator=text(profile.differentiator);

  const evidenceSets=[
    [
      profile.website?7:0,
      site?.reachable?9:0,
      site?.hasLocalTerms?12:0,
      local?.found?11:0,
      local?.matchedName?8:0,
      google?.websiteClicks&&google.websiteClicks>0?8:0,
      has(goal,[/lead/,/visibility/,/local/,/revenue/,/sales/])?5:0,
      profile.serviceArea?3:0
    ],
    [
      site?.hasReviews?14:0,
      local?.matchedName?8:0,
      google?.rating!=null?Math.min(18,Math.round(google.rating*3.6)):0,
      google?.reviewCount&&google.reviewCount>10?8:google?.reviewCount?4:0,
      profile.differentiator?5:0,
      profile.offerings?4:0
    ],
    [
      site?.hasImages?12:0,
      site?.imageCount&&site.imageCount>=6?8:site?.imageCount?4:0,
      site?.wordCount&&site.wordCount>=300?10:site?.wordCount?5:0,
      site?.hasLocalTerms?7:0,
      profile.offerings?5:0,
      profile.differentiator?4:0,
      profile.idealCustomer?4:0
    ],
    [
      site?.hasCta?17:0,
      site?.hasContactPath?17:0,
      site?.reachable?7:0,
      google?.websiteClicks&&google.websiteClicks>0?5:0,
      google?.phoneCalls&&google.phoneCalls>0?5:0,
      has(goal,[/lead/,/booking/,/appointment/,/sales/,/revenue/,/call/,/whatsapp/])?8:0,
      target?4:0
    ],
    [
      site?.hasCta?12:0,
      site?.hasContactPath?12:0,
      google?.websiteClicks&&google.websiteClicks>0?8:0,
      google?.phoneCalls&&google.phoneCalls>0?8:0,
      google?.directionRequests&&google.directionRequests>0?6:0,
      local?.found?8:0,
      has(goal,[/lead/,/revenue/,/sales/,/booking/,/customer/])?8:0,
      profile.monthlyLeads?3:0,
      profile.conversion?3:0
    ]
  ];

  const labels=["Discoverability","Trust & reputation","Content & visuals","Conversion","Lead generation"];
  const reasons=[
    "Findability is scored from the website, local presence, service area and available discovery signals.",
    "Trust is scored from reviews, verified local identity and the strength of the offer and differentiator you described.",
    "Content quality combines scanned website evidence with the clarity of your offer, audience and differentiation.",
    "Conversion reflects the presence of direct contact paths plus how clearly the stated growth goal and success target can become an action.",
    "Lead generation combines measurable demand signals with the current enquiry path, acquisition channels and stated lead/conversion context."
  ];

  const externalAvailable=Boolean(site||local||google);
  const base=externalAvailable?26:30;
  const metrics=labels.map((label,index)=>{
    const evidence=evidenceSets[index].reduce((a,b)=>a+b,0);
    const score=clamp(base+evidence);
    return {
      key:label.toLowerCase().replace(/[^a-z]+/g,"-"),
      label,
      score,
      status:score>=72?"Strong":score>=55?"Improve":"Priority",
      reason:reasons[index]
    };
  });

  const ranked=[...metrics].sort((a,b)=>a.score-b.score);
  const templateFor=(metricKey:string)=>{
    if(metricKey==="discoverability") return {
      title:"Strengthen local discovery",
      reason:local?.found
        ?"Your business is visible in the local evidence, but there is still room to make the listing, local relevance and high-intent discovery path stronger."
        :"Vistaar could not verify enough local discovery evidence yet, so improving your search and local presence is the clearest visibility opportunity.",
      mode:"AI" as const,
      specialist:"Local SEO & Google Business"
    };
    if(metricKey==="trust-reputation") return {
      title:"Upgrade trust and proof",
      reason:"The current evidence and the business context you supplied suggest that stronger proof, reviews, differentiation and customer-facing evidence could reduce decision friction.",
      mode:"Expert" as const,
      specialist:"Reviews, content & brand proof"
    };
    if(metricKey==="content-visuals") return {
      title:"Clarify the offer for your ideal customer",
      reason:audience&&offer
        ?"Your audience and offer are defined, but the scanned presence should make that value obvious before asking someone to enquire."
        :"The assessment does not yet provide enough strong content evidence to show why the right customer should choose you.",
      mode:"Expert" as const,
      specialist:"Content, design & web"
    };
    if(metricKey==="conversion") return {
      title:"Remove enquiry friction",
      reason:constraint
        ?"Your stated constraint makes a shorter, clearer path from intent to enquiry especially important."
        :"The available conversion evidence does not yet show a strong, obvious path from customer intent to enquiry.",
      mode:"DIY" as const,
      specialist:"Conversion & landing pages"
    };
    return {
      title:"Build a measurable lead path",
      reason:profile.monthlyLeads||profile.conversion
        ?"Your assessment includes lead/conversion context, so the next step should connect acquisition activity to measurable qualified enquiries rather than just more activity."
        :"The available evidence does not yet show a strong connection between attention and trackable enquiries.",
      mode:"AI" as const,
      specialist:"Lead generation & CRM"
    };
  };

  const opportunities=ranked.slice(0,3).map((metric,i)=>{
    const t=templateFor(metric.key);
    return {
      title:t.title,
      area:metric.label,
      impact:Math.max(58,96-metric.score),
      effort:(i===0?"Low":i===1?"Medium":"High") as "Low"|"Medium"|"High",
      reason:t.reason,
      mode:t.mode,
      specialist:t.specialist
    };
  });

  const nextMove=opportunities[0]?.title||"Collect more business evidence";
  const overall=clamp(metrics.reduce((a,m)=>a+m.score,0)/metrics.length);
  const maturity=overall>=75?"Ready to scale":overall>=60?"Building momentum":overall>=45?"Needs focus":"Needs a reset";

  const dataSources=["Detailed business assessment"];
  if(site)dataSources.push("Website signal scan");
  if(local)dataSources.push("Local presence signal scan");
  if(google)dataSources.push("Google Business Profile");
  if(profile.instagram)dataSources.push("Instagram supplied");
  if(profile.otherLinks)dataSources.push("Other digital links supplied");

  const diagnosticBasis=[
    "Business: "+profile.businessName+" · "+profile.industry+" · "+profile.city+(profile.serviceArea?" · serves "+profile.serviceArea:""),
    profile.idealCustomer?"Ideal customer: "+profile.idealCustomer: "Ideal customer: not supplied",
    profile.offerings?"Offer: "+profile.offerings:"Offer: not supplied",
    profile.differentiator?"Differentiator: "+profile.differentiator:"Differentiator: not supplied",
    "Goal: "+profile.goal+(profile.target?" · success target: "+profile.target:""),
    profile.constraint?"Constraint: "+profile.constraint:"Constraint: not supplied",
    profile.channels?"Current acquisition: "+profile.channels:"Current acquisition: not supplied",
    profile.challenge?"Investigation request: "+profile.challenge:"Investigation request: not supplied"
  ];

  const reasoning=[
    "Context: "+profile.industry+" in "+profile.city+" with the goal to "+profile.goal.toLowerCase()+".",
    profile.challenge?"Your investigation request is: "+profile.challenge+".":"The diagnosis uses the business context supplied in the assessment.",
    site?.reachable?"Website evidence was scanned and used in the scoring.":"No reachable website evidence was available, so Vistaar avoids claiming website strengths.",
    google?.rating!=null
      ?"Google evidence: "+google.rating+"/5 with "+(google.reviewCount??0)+" reviews, "+google.websiteClicks+" website clicks, "+google.phoneCalls+" calls and "+google.directionRequests+" direction requests in the available period."
      :local?.found?"Local presence evidence was found; the business-name match is "+(local.matchedName?"strong":"weak")+".":"Local/Google evidence is not yet verified.",
    "Priority logic: Vistaar ranks the lowest evidence-backed growth dimensions first instead of using a fixed score.",
    "Decision: "+nextMove+" is first because "+ranked[0].reason.toLowerCase()
  ];

  const contextHint=[target,challenge,constraint,channels,audience,offer,differentiator].filter(Boolean).join(" ");
  const summary=profile.businessName+" has a "+maturity.toLowerCase()+" foundation based on the business context and evidence currently available. "+(contextHint
    ?"The diagnosis also incorporates the specific goals, constraints and customer context you supplied. "
    :"")+"The highest-value opportunity is "+nextMove.toLowerCase()+".";

  return {
    overall,
    maturity,
    metrics,
    opportunities,
    nextMove,
    summary,
    dataSources,
    site,
    local,
    google,
    reasoning,
    diagnosticBasis
  };
}
