import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";

export async function POST(request:Request){
  try{
    const profile=(await request.json()) as BusinessProfile;
    if(!profile.businessName||!profile.industry||!profile.city||!profile.goal)
      return NextResponse.json({error:"Business name, category, city and goal are required."},{status:400});
    const site=await scanWebsite(profile.website);
    const siteSignals=site?{website:site.url,reachable:site.reachable,https:site.https,title:site.title,hasCta:site.hasCta,hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,hasReviews:site.hasReviews,hasLocalTerms:site.hasLocalTerms,hasImages:site.hasImages,imageCount:site.imageCount,wordCount:site.wordCount,signals:site.signals}:undefined;
    const audit=runGrowthAudit(profile,siteSignals);
    return NextResponse.json({profile,audit,generatedAt:new Date().toISOString()});
  }catch{return NextResponse.json({error:"Unable to generate the growth audit."},{status:500});}
}