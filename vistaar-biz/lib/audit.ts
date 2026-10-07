export type BusinessProfile = {
  businessName: string; industry: string; city: string; goal: string; website?: string;
};
export type GoogleAuditSignals = {website:string;rating:number|null;reviewCount:number|null;websiteClicks:number;phoneCalls:number;directionRequests:number;signals:string[]};
export type LocalAuditSignals = {found:boolean;matchedName:boolean;displayName:string;nearbyCount:number;category:string;signals:string[]};
export type SiteAuditSignals = {website:string;reachable:boolean;https:boolean;title:string;hasCta:boolean;hasContactPath:boolean;hasReviews:boolean;hasLocalTerms:boolean;hasImages:boolean;imageCount:number;wordCount:number;signals:string[]};
export type AuditResult = {
  overall:number;maturity:string;
  metrics:{key:string;label:string;score:number;status:string;reason:string}[];
  opportunities:{title:string;area:string;impact:number;effort:"Low"|"Medium"|"High";reason:string;mode:"AI"|"DIY"|"Expert"}[];
  nextMove:string;summary:string;dataSources:string[];site?:SiteAuditSignals;local?:LocalAuditSignals;google?:GoogleAuditSignals;reasoning:string[];
};
const clamp=(n:number)=>Math.max(20,Math.min(95,Math.round(n)));
const has=(value:string|undefined,patterns:RegExp[])=>Boolean(value&&patterns.some(p=>p.test(value)));

export function runGrowthAudit(profile:BusinessProfile,site?:SiteAuditSignals,local?:LocalAuditSignals,google?:GoogleAuditSignals):AuditResult{
  const goal=profile.goal.toLowerCase();

  const evidenceSets=[
    [
      profile.website?8:0, site?.reachable?10:0, site?.hasLocalTerms?14:0,
      local?.found?12:0, local?.matchedName?8:0,
      google?.websiteClicks&&google.websiteClicks>0?8:0,
      has(goal,[/lead/,/visibility/,/local/,/revenue/])?5:0
    ],
    [
      site?.hasReviews?15:0, local?.matchedName?10:0,
      google?.rating!==null&&google?.rating!==undefined?Math.min(18,Math.round(google.rating*3.6)):0,
      google?.reviewCount&&google.reviewCount>10?8:google?.reviewCount?4:0, profile.goal?5:0
    ],
    [
      site?.hasImages?14:0,
      site?.imageCount&&site.imageCount>=6?8:site?.imageCount?4:0,
      site?.wordCount&&site.wordCount>=300?10:site?.wordCount?5:0,
      site?.hasLocalTerms?8:0, profile.website?5:0
    ],
    [
      site?.hasCta?18:0, site?.hasContactPath?18:0, site?.reachable?8:0,
      google?.websiteClicks&&google.websiteClicks>0?5:0,
      google?.phoneCalls&&google.phoneCalls>0?5:0,
      has(goal,[/lead/,/booking/,/appointment/,/sales/,/revenue/])?8:0
    ],
    [
      site?.hasCta?14:0, site?.hasContactPath?14:0,
      google?.websiteClicks&&google.websiteClicks>0?8:0,
      google?.phoneCalls&&google.phoneCalls>0?8:0,
      google?.directionRequests&&google.directionRequests>0?6:0,
      local?.found?8:0,
      has(goal,[/lead/,/revenue/,/sales/,/booking/])?10:0
    ]
  ];

  const labels=["Discoverability","Trust & reputation","Content & visuals","Conversion","Lead generation"];
  const reasons=[
    "Search, local listing and visibility evidence determine how easily nearby customers can find the business.",
    "Reviews, proof and verified business information shape confidence before a customer contacts the business.",
    "Useful content, imagery and local relevance help turn attention into genuine interest.",
    "Clear calls-to-action and direct contact paths reduce friction between intent and enquiry.",
    "Measurable calls, clicks, directions and enquiry paths determine whether demand becomes a trackable opportunity."
  ];

  const externalAvailable=Boolean(site||local||google);
  const base=externalAvailable?28:32;
  const metrics=labels.map((label,index)=>{
    const evidence=evidenceSets[index].reduce((a,b)=>a+b,0);
    const score=clamp(base+evidence);
    return {
      key:label.toLowerCase().replace(/[^a-z]+/g,"-"),label,score,
      status:score>=72?"Strong":score>=55?"Improve":"Priority",
      reason:reasons[index]
    };
  });

  const overall=clamp(metrics.reduce((a,m)=>a+m.score,0)/metrics.length);
  const ranked=[...metrics].sort((a,b)=>a.score-b.score);
  const opportunityTemplates=[
    {title:"Strengthen local discovery",reason:"The current evidence shows room to make the business easier to find and recognise in high-intent local searches.",mode:"AI" as const},
    {title:"Upgrade trust and proof",reason:"The available reputation and proof signals are not yet strong enough to confidently support the customer decision.",mode:"Expert" as const},
    {title:"Remove enquiry friction",reason:"The current conversion evidence suggests customers may need a clearer, shorter path from intent to contact.",mode:"DIY" as const},
    {title:"Build a measurable lead path",reason:"The available evidence does not yet show a strong connection between attention and trackable enquiries.",mode:"AI" as const}
  ];

  const opportunities=ranked.slice(0,3).map((metric,i)=>{
    const template=opportunityTemplates[Math.min(i,opportunityTemplates.length-1)];
    return {
      title:template.title,area:metric.label,impact:Math.max(60,96-metric.score),
      effort:(i===0?"Low":i===1?"Medium":"Medium") as "Low"|"Medium"|"High",
      reason:template.reason,mode:template.mode
    };
  });

  const nextMove=opportunities[0]?.title||"Collect more business evidence";
  const maturity=overall>=75?"Ready to scale":overall>=60?"Building momentum":overall>=45?"Needs focus":"Needs a reset";
  const dataSources=["Business profile"];
  if(site)dataSources.push("Website signal scan");
  if(local)dataSources.push("Local directory signal scan");
  if(google)dataSources.push("Google Business Profile");

  const reasoning=[
    "Context: "+profile.industry+" in "+profile.city+", with a goal to "+profile.goal.toLowerCase()+".",
    site?.reachable?"Website evidence was scanned and used in the scoring.":"No reachable website evidence was available, so Vistaar avoids claiming website strengths.",
    google?.rating!==null&&google?.rating!==undefined
      ?"Google evidence: "+google.rating+"/5 with "+(google.reviewCount??0)+" reviews, "+google.websiteClicks+" website clicks, "+google.phoneCalls+" calls and "+google.directionRequests+" direction requests in the available period."
      :local?.found?"Local presence evidence was found; the business-name match is "+(local.matchedName?"strong":"weak")+".":"Local/Google evidence is not yet verified.",
    "Priority logic: the lowest evidence-backed growth dimension becomes the first recommended move.",
    "Decision: "+nextMove+" is ranked first because "+ranked[0].reason.toLowerCase()
  ];

  return {
    overall,maturity,metrics,opportunities,nextMove,
    summary:profile.businessName+" has a "+maturity.toLowerCase()+" foundation based on the evidence currently available. The highest-value opportunity is "+nextMove.toLowerCase()+".",
    dataSources,site,local,google,reasoning
  };
}