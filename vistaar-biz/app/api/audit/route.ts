import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";
import { scanLocalPresence } from "../../../lib/local-scanner";
import { backendFetch } from "../../../lib/backend";
import { runAiDiagnosis } from "../../../lib/ai-diagnosis";

export async function POST(request:Request){
  try{
    const body=await request.json() as BusinessProfile & {google?:any};
    const profile=body;
    if(!profile.businessName||!profile.industry||!profile.city||!profile.goal)return NextResponse.json({error:"Business name, category, city and goal are required."},{status:400});
    const site=await scanWebsite(profile.website);
    const siteSignals=site?{website:site.url,reachable:site.reachable,https:site.https,title:site.title,hasCta:site.hasCta,hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,hasReviews:site.hasReviews,hasLocalTerms:site.hasLocalTerms,hasImages:site.hasImages,imageCount:site.imageCount,wordCount:site.wordCount,signals:site.signals}:undefined;
    const local=await scanLocalPresence(profile.businessName,profile.industry,profile.city,profile.google);
    const localSignals={found:local.found,matchedName:local.matchedName,displayName:local.displayName,nearbyCount:local.nearbyCount,category:local.category,googleUrlSupplied:local.googleUrlSupplied,googleProfileDetected:local.googleProfileDetected,signals:local.signals};
    const google=body.google?{website:body.google.website||"",rating:body.google.rating??null,reviewCount:body.google.reviewCount??null,websiteClicks:Number(body.google.performance?.websiteClicks||0),phoneCalls:Number(body.google.performance?.phoneCalls||0),directionRequests:Number(body.google.performance?.directionRequests||0),signals:body.google.signals||[]}:undefined;
    const baseline=runGrowthAudit(profile,siteSignals,localSignals,google);
    const ai=await runAiDiagnosis({profile,site:siteSignals,local:localSignals,google,baseline});
    const audit=ai
      ? {...baseline,...ai,engine:"ai" as const,aiModel:process.env.OPENAI_MODEL?.trim()||"gpt-6-luna"}
      : baseline;
    const r=await backendFetch("/api/audit",{method:"POST",body:JSON.stringify({profile,audit})});
    const persisted=await r.json();
    return NextResponse.json({...persisted,generatedAt:new Date().toISOString()},{status:r.status});
  }catch{return NextResponse.json({error:"Unable to generate the growth audit."},{status:500});}
}