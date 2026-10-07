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
  googleUrlSupplied?:boolean;
  googleProfileDetected?:boolean;
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
    steps:string[];
    deliverable:string;
    measurement:string;
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
    const business=profile.businessName;
    const city=profile.city;
    const customer=profile.idealCustomer||"the ideal customer";
    const offerText=profile.offerings||"the core offer";
    const targetText=profile.target||"the stated 3–6 month target";
    const currentChannels=profile.channels||"the current acquisition channels";
    const localGoogleSupplied=Boolean(local?.googleUrlSupplied||profile.google);
    const localVerified=Boolean(local?.found&&local?.matchedName);
    const reviewContext=google?.rating!=null
      ? `The available Google data shows ${google.rating}/5 from ${google.reviewCount??0} reviews.`
      : site?.hasReviews
        ? "The website contains review/testimonial language, but no verified Google review count was available."
        : "No strong review proof was verified in the available evidence.";

    if(metricKey==="discoverability") return {
      title:localGoogleSupplied&&!localVerified
        ?"Verify and strengthen the Google Business Profile"
        :"Build stronger local discovery for "+business,
      reason:localGoogleSupplied&&!localVerified
        ?`You supplied a Google Business/Maps link, but Vistaar could not independently match the business through its public directory scan. That is a verification limitation—not proof that the Google listing does not exist. For ${business} in ${city}, the first job is to verify the exact profile identity and make the profile, website and service area consistent.`
        :localVerified
          ?`The business has an independently matched local signal. The next opportunity is to improve the information and search paths that turn local discovery into visits, calls or enquiries for ${business}.`
          :`Vistaar does not have a verified local listing signal yet. For ${business} in ${city}, local discovery should be established before spending more effort on broad marketing.`,
      mode:"Expert" as const,
      specialist:"Local SEO & Google Business",
      steps:localGoogleSupplied&&!localVerified
        ?[
          "Open the supplied Google Business Profile and confirm the business name, primary category, address/service area, phone and website exactly match the real business.",
          "Check that the profile is verified and that the website URL points to the same business/location.",
          "Complete the profile with accurate hours, services/menu, photos and relevant attributes; remove outdated or duplicate information.",
          "Create a review-request process for real customers and reply to new reviews consistently.",
          "Track Google Search/Maps searches, profile views, website clicks, calls and direction requests each month."
        ]
        :[
          `Map the highest-intent searches customers in ${city} use for ${offerText}.`,
          "Align Google Business Profile, website title/content, category and service-area information around those searches.",
          "Create or improve dedicated pages/content for the highest-value services and locations.",
          "Build a repeatable review, photo and Google update/post process.",
          "Track discovery actions and qualified enquiries rather than impressions alone."
        ],
      deliverable:"A Google/local search optimisation brief with exact profile, website and content changes.",
      measurement:"Google profile searches/views, website clicks, calls, directions and qualified enquiries."
    };

    if(metricKey==="trust-reputation") return {
      title:google?.rating!=null
        ?`Turn ${google.reviewCount??0} Google reviews into stronger buying proof`
        :"Build a repeatable review and proof system",
      reason:`${reviewContext} For ${customer}, Vistaar should turn proof into visible decision support instead of simply asking for more marketing activity.`,
      mode:"Expert" as const,
      specialist:"Reviews, content & brand proof",
      steps:[
        `Audit the current proof against what ${customer} needs before choosing ${offerText}.`,
        "Identify the 3 strongest proof themes: customer outcome, quality/experience and differentiation.",
        "Create a review-request workflow triggered after a successful customer interaction; never incentivise or fabricate reviews.",
        "Add the strongest verified reviews, outcomes, FAQs and proof points to the highest-intent website page.",
        "Track review growth, response rate, engagement with proof and qualified enquiries."
      ],
      deliverable:"A trust/proof improvement brief plus review-request workflow and website proof structure.",
      measurement:"Review count/rating, review response coverage, proof engagement and qualified enquiry conversion."
    };

    if(metricKey==="content-visuals") return {
      title:"Make the offer immediately clear to the right customer",
      reason:`The assessment says the ideal customer is ${customer} and the offer is ${offerText}. The website scan found ${site?.wordCount??0} words and ${site?.imageCount??0} images, so the priority is not 'create more content'—it is to make the most important customer decision obvious.`,
      mode:"Expert" as const,
      specialist:"Content, design & web",
      steps:[
        `Rewrite the first screen of the primary landing page around ${customer}: what you provide, for whom, why it is different and what to do next.`,
        `Turn ${offerText} into clear service/product sections with benefits, proof, FAQs and one primary CTA.`,
        "Replace generic visuals with real business/product/location/customer proof where available.",
        "Add local and service-specific wording naturally where it helps the customer understand relevance.",
        "Compare engagement and enquiry actions before and after the changes."
      ],
      deliverable:"A page-level content and visual execution brief with copy sections, proof requirements and CTA placement.",
      measurement:"CTA clicks, contact actions, engaged sessions and qualified enquiries."
    };

    if(metricKey==="conversion") return {
      title:"Create one obvious path from interest to enquiry",
      reason:`Your stated goal is ${profile.goal}. The conversion layer should therefore be designed around the action that represents success—not around adding more pages or generic CTAs. Current target: ${targetText}.`,
      mode:"Expert" as const,
      specialist:"Conversion & landing pages",
      steps:[
        `Choose the single primary conversion action for ${business}: call, WhatsApp, booking, enquiry form or another real customer action.`,
        "Place that action above the fold and repeat it at the decision points where customers need it.",
        "Remove unnecessary fields/steps and make the response expectation clear (what happens after enquiry and how quickly).",
        `Build a simple conversion event around ${targetText} so every channel can be compared.`,
        "Review conversion rate weekly and diagnose where interested visitors drop before enquiry."
      ],
      deliverable:"A concrete enquiry-flow map and implementation checklist for the primary conversion path.",
      measurement:"CTA clicks, calls/WhatsApp/form submissions, qualified enquiries and enquiry-to-customer rate."
    };

    return {
      title:profile.monthlyLeads||profile.conversion
        ?`Turn ${currentChannels} into a measurable qualified-lead system`
        :"Build a measurable qualified-lead system",
      reason:`The business currently reports ${profile.monthlyLeads||"no confirmed monthly enquiry baseline"} qualified enquiries/month and an enquiry-to-customer rate of ${profile.conversion||"not yet measured"}. Vistaar should first establish attribution and lead quality before recommending more acquisition spend.`,
      mode:"AI" as const,
      specialist:"Lead generation & CRM",
      steps:[
        "Define exactly what counts as a qualified enquiry and what counts as a sale.",
        `Tag every enquiry by source: ${currentChannels} plus website, Google, Instagram and any other active channel.`,
        "Create a simple lead-status flow: New → Contacted → Qualified → Won/Lost, with a reason for lost leads.",
        "Measure source-level qualified leads, conversion rate and revenue/value where available.",
        "Only increase activity or budget on channels that produce acceptable qualified-lead economics."
      ],
      deliverable:"A lead-source tracking plan, qualification definition and lightweight pipeline structure.",
      measurement:"Qualified leads by source, response time, conversion rate, cost/value per qualified lead and sales."
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
      specialist:t.specialist,
      steps:t.steps,
      deliverable:t.deliverable,
      measurement:t.measurement
    };
  });

  const nextMove=opportunities[0]?.title||"Collect more business evidence";
  const overall=clamp(metrics.reduce((a,m)=>a+m.score,0)/metrics.length);
  const maturity=overall>=75?"Ready to scale":overall>=60?"Building momentum":overall>=45?"Needs focus":"Needs a reset";

  const dataSources=["Detailed business assessment"];
  if(site)dataSources.push("Website signal scan");
  if(local)dataSources.push("Local presence signal scan");
  if(google)dataSources.push("Google Business Profile");
  if(profile.website)dataSources.push("Website URL supplied");
  if(profile.google)dataSources.push("Google Business Profile URL supplied");
  if(profile.instagram)dataSources.push("Instagram supplied");
  if(profile.otherLinks)dataSources.push("Other digital links supplied");

  const digitalContext=[
    profile.website?"Website supplied: "+profile.website:"",
    profile.google?"Google Business Profile supplied: "+profile.google:"",
    profile.instagram?"Instagram supplied: "+profile.instagram:"",
    profile.otherLinks?"Other digital links supplied: "+profile.otherLinks:""
  ].filter(Boolean).join(" · ");

  const diagnosticBasis=[
    "Business: "+profile.businessName+" · "+profile.industry+" · "+profile.city+(profile.serviceArea?" · serves "+profile.serviceArea:""),
    profile.idealCustomer?"Ideal customer: "+profile.idealCustomer: "Ideal customer: not supplied",
    profile.offerings?"Offer: "+profile.offerings:"Offer: not supplied",
    profile.differentiator?"Differentiator: "+profile.differentiator:"Differentiator: not supplied",
    "Goal: "+profile.goal+(profile.target?" · success target: "+profile.target:""),
    profile.constraint?"Constraint: "+profile.constraint:"Constraint: not supplied",
    profile.channels?"Current acquisition: "+profile.channels:"Current acquisition: not supplied",
    profile.challenge?"Investigation request: "+profile.challenge:"Investigation request: not supplied",
    profile.monthlyLeads?"Qualified enquiries/month: "+profile.monthlyLeads:"Qualified enquiries/month: not supplied",
    profile.conversion?"Enquiry-to-customer rate: "+profile.conversion:"Enquiry-to-customer rate: not supplied",
    profile.notes?"Additional business notes: "+profile.notes:"Additional business notes: not supplied",
    digitalContext||"Digital links: none supplied"
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

  const contextHint=[target,challenge,constraint,channels,audience,offer,differentiator,profile.notes,digitalContext].filter(Boolean).join(" ");
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
