import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";
import { scanLocalPresence } from "../../../lib/local-scanner";
import { backendFetch } from "../../../lib/backend";
import { getAuthContext } from "../../../lib/auth";

export async function POST(request:Request){
  try{
    const body=await request.json();
    const required=["businessName","industry","city","serviceArea","idealCustomer","offerings","differentiator","goal","target","constraint","channels","challenge"];
    if(required.some(k=>!String(body[k]??"").trim()))return NextResponse.json({ok:false,error:"Please complete the required assessment fields."},{status:400});
    const record={
      business_name:String(body.businessName).trim(),industry:String(body.industry).trim(),city:String(body.city).trim(),service_area:String(body.serviceArea).trim(),
      ideal_customer:String(body.idealCustomer).trim(),offerings:String(body.offerings).trim(),differentiator:String(body.differentiator).trim(),
      goal:String(body.goal).trim(),target:String(body.target).trim(),constraint:String(body.constraint).trim(),channels:String(body.channels).trim(),
      monthly_leads:body.monthlyLeads?String(body.monthlyLeads).trim():null,conversion:body.conversion?String(body.conversion).trim():null,
      website:body.website?String(body.website).trim():null,google:body.google?String(body.google).trim():null,instagram:body.instagram?String(body.instagram).trim():null,
      other_links:body.otherLinks?String(body.otherLinks).trim():null,challenge:String(body.challenge).trim(),notes:body.notes?String(body.notes).trim():null
    };
    const profile:BusinessProfile={
      businessName:record.business_name,industry:record.industry,city:record.city,serviceArea:record.service_area,idealCustomer:record.ideal_customer,
      offerings:record.offerings,differentiator:record.differentiator,goal:record.goal,target:record.target,constraint:record.constraint,channels:record.channels,
      monthlyLeads:record.monthly_leads||undefined,conversion:record.conversion||undefined,challenge:record.challenge,notes:record.notes||undefined,
      website:record.website||undefined,google:record.google||undefined,instagram:record.instagram||undefined,otherLinks:record.other_links||undefined
    };
    const site=await scanWebsite(profile.website);
    const siteSignals=site?{website:site.url,reachable:site.reachable,https:site.https,title:site.title,hasCta:site.hasCta,hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,hasReviews:site.hasReviews,hasLocalTerms:site.hasLocalTerms,hasImages:site.hasImages,imageCount:site.imageCount,wordCount:site.wordCount,signals:site.signals}:undefined;
    const local=await scanLocalPresence(profile.businessName,profile.industry,profile.city);
    const localSignals={found:local.found,matchedName:local.matchedName,displayName:local.displayName,nearbyCount:local.nearbyCount,category:local.category,signals:local.signals};
    const audit=runGrowthAudit(profile,siteSignals,localSignals);
    const evidence:any[]=[
      ["assessment","business_context","Business identity",record.business_name,"high"],["assessment","market","Industry / market",record.industry,"high"],
      ["assessment","market","Primary city / market",record.city,"high"],["assessment","market","Service area",record.service_area,"high"],
      ["assessment","customer","Ideal customer",record.ideal_customer,"high"],["assessment","offer","Products / services",record.offerings,"high"],
      ["assessment","positioning","Differentiator",record.differentiator,"high"],["assessment","goal","Primary growth outcome",record.goal,"high"],
      ["assessment","target","Success target",record.target,"high"],["assessment","constraint","Business constraint",record.constraint,"high"],
      ["assessment","acquisition","Current acquisition channels",record.channels,"high"],["assessment","challenge","Investigation request",record.challenge,"high"],
      ...(record.notes?[["assessment","notes","Additional business notes",record.notes,"medium"]]:[]),
      ...(record.website?[["digital","website","Website supplied",record.website,"high"]]:[]),
      ...(record.google?[["digital","google","Google Business Profile supplied",record.google,"medium"]]:[]),
      ...(record.instagram?[["digital","instagram","Instagram supplied",record.instagram,"medium"]]:[]),
      ...(record.other_links?[["digital","other","Other digital links supplied",record.other_links,"medium"]]:[])
    ];
    if(record.monthly_leads)evidence.push(["assessment","baseline","Qualified enquiries per month",record.monthly_leads,"medium"]);
    if(record.conversion)evidence.push(["assessment","baseline","Enquiry-to-customer rate",record.conversion,"medium"]);
    if(siteSignals)evidence.push(["website","technical","Website reachable",String(siteSignals.reachable),"high"],["website","conversion","CTA present",String(siteSignals.hasCta),"high"],["website","conversion","Contact path present",String(siteSignals.hasContactPath),"high"],["website","trust","Reviews detected",String(siteSignals.hasReviews),"medium"],["website","content","Images detected",String(siteSignals.imageCount),"high"],["website","content","Word count",String(siteSignals.wordCount),"medium"]);
    if(localSignals)evidence.push(["local","discovery","Local listing signal found",String(localSignals.found),"medium"],["local","discovery","Business-name match",String(localSignals.matchedName),"medium"],["local","market","Nearby category signals",String(localSignals.nearbyCount),"medium"]);
    const auth=await getAuthContext();
    const evidenceRecords=evidence.map(([source,evidence_type,claim,value,confidence])=>({source,evidence_type,claim,value,confidence}));
    const r=await backendFetch("/api/assessment",{method:"POST",body:JSON.stringify({assessment:record,profile,audit,evidence:evidenceRecords,ownerUserId:auth?.userId||null})});
    const result=await r.json();
    return NextResponse.json({...result,profile,audit,assessment:record},{status:r.status});
  }catch{return NextResponse.json({ok:false,error:"We couldn't start the assessment. Please try again."},{status:500});}
}