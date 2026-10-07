import { NextResponse } from "next/server";
import { runGrowthAudit } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";
import { scanLocalPresence } from "../../../lib/local-scanner";

const headers=(key:string)=>({apikey:key,Authorization:"Bearer "+key});

export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const businessId=params.get("businessId");
  const assessmentId=params.get("assessmentId");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,stored:false},{status:503});

  try{
    if(assessmentId){
      const assessmentRes=await fetch(url+"/rest/v1/growth_assessments?select=*&id=eq."+encodeURIComponent(assessmentId)+"&limit=1",{headers:headers(key),cache:"no-store"});
      if(!assessmentRes.ok) return NextResponse.json({ok:false,error:"Assessment could not be loaded."},{status:502});
      const rows=await assessmentRes.json();
      const a=rows?.[0];
      if(!a) return NextResponse.json({ok:false,error:"Assessment not found."},{status:404});

      const profile={businessName:a.business_name,industry:a.industry,city:a.city,goal:a.goal,website:a.website||undefined};
      const site=await scanWebsite(profile.website);
      const siteSignals=site?{website:site.url,reachable:site.reachable,https:site.https,title:site.title,hasCta:site.hasCta,hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,hasReviews:site.hasReviews,hasLocalTerms:site.hasLocalTerms,hasImages:site.hasImages,imageCount:site.imageCount,wordCount:site.wordCount,signals:site.signals}:undefined;
      const local=await scanLocalPresence(profile.businessName,profile.industry,profile.city);
      const localSignals={found:local.found,matchedName:local.matchedName,displayName:local.displayName,nearbyCount:local.nearbyCount,category:local.category,signals:local.signals};
      const audit=runGrowthAudit(profile,siteSignals,localSignals);
      return NextResponse.json({ok:true,business:{id:null,name:profile.businessName,industry:profile.industry,city:profile.city,goal:profile.goal,website:profile.website},audit,assessmentId});
    }

    if(!businessId) return NextResponse.json({ok:false,error:"businessId or assessmentId is required."},{status:400});
    const [businessRes,auditRes,actionsRes]=await Promise.all([
      fetch(url+"/rest/v1/businesses?select=*&id=eq."+encodeURIComponent(businessId)+"&limit=1",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_audits?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=created_at.desc&limit=1",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_actions?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=impact.desc&limit=10",{headers:headers(key),cache:"no-store"})
    ]);
    if(!businessRes.ok||!auditRes.ok) return NextResponse.json({ok:false,error:"Workspace data could not be loaded."},{status:502});
    const businesses=await businessRes.json(), audits=await auditRes.json(), actions=actionsRes.ok?await actionsRes.json():[];
    if(!businesses?.[0]||!audits?.[0]) return NextResponse.json({ok:false,error:"Workspace not found."},{status:404});
    const b=businesses[0], latest=audits[0];
    return NextResponse.json({ok:true,business:b,audit:latest.result,auditId:latest.id,actions});
  }catch{
    return NextResponse.json({ok:false,error:"Unable to load the workspace."},{status:500});
  }
}