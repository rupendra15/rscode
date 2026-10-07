import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";
import { scanLocalPresence } from "../../../lib/local-scanner";

export async function POST(request:Request){
  try{
    const body=await request.json() as BusinessProfile & {google?:any};
    const profile=body;
    if(!profile.businessName||!profile.industry||!profile.city||!profile.goal)
      return NextResponse.json({error:"Business name, category, city and goal are required."},{status:400});
    const site=await scanWebsite(profile.website);
    const siteSignals=site?{website:site.url,reachable:site.reachable,https:site.https,title:site.title,hasCta:site.hasCta,hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,hasReviews:site.hasReviews,hasLocalTerms:site.hasLocalTerms,hasImages:site.hasImages,imageCount:site.imageCount,wordCount:site.wordCount,signals:site.signals}:undefined;
    const local=await scanLocalPresence(profile.businessName,profile.industry,profile.city);
    const localSignals={found:local.found,matchedName:local.matchedName,displayName:local.displayName,nearbyCount:local.nearbyCount,category:local.category,signals:local.signals};
    const google=body.google?{website:body.google.website||"",rating:body.google.rating??null,reviewCount:body.google.reviewCount??null,websiteClicks:Number(body.google.performance?.websiteClicks||0),phoneCalls:Number(body.google.performance?.phoneCalls||0),directionRequests:Number(body.google.performance?.directionRequests||0),signals:body.google.signals||[]}:undefined;
    const audit=runGrowthAudit(profile,siteSignals,localSignals,google);
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    let businessId:string|null=null, auditId:string|null=null;
    if(url&&key){
      const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
      const businessResponse=await fetch(url+"/rest/v1/businesses",{method:"POST",headers,body:JSON.stringify({name:profile.businessName,industry:profile.industry,city:profile.city,goal:profile.goal,website:profile.website||null}),cache:"no-store"});
      if(businessResponse.ok){
        const rows=await businessResponse.json(); businessId=rows?.[0]?.id??null;
      }
      if(businessId){
        const auditResponse=await fetch(url+"/rest/v1/growth_audits",{method:"POST",headers,body:JSON.stringify({business_id:businessId,overall_score:audit.overall,maturity:audit.maturity,result:audit}),cache:"no-store"});
        if(auditResponse.ok){
          const rows=await auditResponse.json(); auditId=rows?.[0]?.id??null;
        }
        if(audit.opportunities.length){
          await fetch(url+"/rest/v1/growth_actions",{method:"POST",headers,body:JSON.stringify(audit.opportunities.map(o=>({business_id:businessId,audit_id:auditId,title:o.title,area:o.area,impact:o.impact,effort:o.effort,mode:o.mode,status:"recommended"}))),cache:"no-store"});
        }
      }
    }
    return NextResponse.json({profile,audit,generatedAt:new Date().toISOString(),businessId,auditId});
  }catch{return NextResponse.json({error:"Unable to generate the growth audit."},{status:500});}
}