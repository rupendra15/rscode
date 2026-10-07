import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";
import { scanLocalPresence } from "../../../lib/local-scanner";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const required = ["businessName","industry","city","serviceArea","idealCustomer","offerings","differentiator","goal","target","constraint","channels","challenge"];
    if (required.some((key) => !String(body[key] ?? "").trim())) {
      return NextResponse.json({ ok:false, error:"Please complete the required assessment fields." }, { status:400 });
    }

    const record = {
      business_name:String(body.businessName).trim(),
      industry:String(body.industry).trim(),
      city:String(body.city).trim(),
      service_area:String(body.serviceArea).trim(),
      ideal_customer:String(body.idealCustomer).trim(),
      offerings:String(body.offerings).trim(),
      differentiator:String(body.differentiator).trim(),
      goal:String(body.goal).trim(),
      target:String(body.target).trim(),
      constraint:String(body.constraint).trim(),
      channels:String(body.channels).trim(),
      monthly_leads:body.monthlyLeads?String(body.monthlyLeads).trim():null,
      conversion:body.conversion?String(body.conversion).trim():null,
      website:body.website?String(body.website).trim():null,
      google:body.google?String(body.google).trim():null,
      instagram:body.instagram?String(body.instagram).trim():null,
      other_links:body.otherLinks?String(body.otherLinks).trim():null,
      challenge:String(body.challenge).trim(),
      notes:body.notes?String(body.notes).trim():null
    };

    const profile:BusinessProfile = {
      businessName:record.business_name,
      industry:record.industry,
      city:record.city,
      serviceArea:record.service_area,
      idealCustomer:record.ideal_customer,
      offerings:record.offerings,
      differentiator:record.differentiator,
      goal:record.goal,
      target:record.target,
      constraint:record.constraint,
      channels:record.channels,
      monthlyLeads:record.monthly_leads||undefined,
      conversion:record.conversion||undefined,
      challenge:record.challenge,
      notes:record.notes||undefined,
      website:record.website||undefined,
      google:record.google||undefined,
      instagram:record.instagram||undefined,
      otherLinks:record.other_links||undefined
    };

    const site = await scanWebsite(profile.website);
    const siteSignals = site ? {
      website:site.url, reachable:site.reachable, https:site.https, title:site.title,
      hasCta:site.hasCta, hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,
      hasReviews:site.hasReviews, hasLocalTerms:site.hasLocalTerms, hasImages:site.hasImages,
      imageCount:site.imageCount, wordCount:site.wordCount, signals:site.signals
    } : undefined;

    const local = await scanLocalPresence(profile.businessName, profile.industry, profile.city);
    const localSignals = {
      found:local.found, matchedName:local.matchedName, displayName:local.displayName,
      nearbyCount:local.nearbyCount, category:local.category, signals:local.signals
    };
    const audit = runGrowthAudit(profile, siteSignals, localSignals);

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    let assessmentId:string|null=null;
    let businessId:string|null=null;
    let auditId:string|null=null;

    if(url && key){
      const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};

      const businessResponse=await fetch(url+"/rest/v1/businesses",{
        method:"POST",headers:{...headers,Prefer:"return=representation"},
        body:JSON.stringify({
          name:record.business_name,
          industry:record.industry,
          city:record.city,
          goal:record.goal,
          website:record.website||null,
          workspace_stage:"diagnosed",
          last_activity_at:new Date().toISOString()
        }),
        cache:"no-store"
      });
      if(businessResponse.ok){
        const businesses=await businessResponse.json();
        businessId=businesses?.[0]?.id??null;
      }

      if(businessId){
        const auditResponse=await fetch(url+"/rest/v1/growth_audits",{
          method:"POST",headers:{...headers,Prefer:"return=representation"},
          body:JSON.stringify({
            business_id:businessId,
            overall_score:audit.overall,
            maturity:audit.maturity,
            result:audit
          }),
          cache:"no-store"
        });
        if(auditResponse.ok){
          const audits=await auditResponse.json();
          auditId=audits?.[0]?.id??null;
        }
      }

      const assessmentResponse=await fetch(url+"/rest/v1/growth_assessments",{
        method:"POST",
        headers:{...headers,Prefer:"return=representation"},
        body:JSON.stringify({...record,status:"analyzed"}),
        cache:"no-store"
      });
      if(assessmentResponse.ok){
        const rows=await assessmentResponse.json();
        assessmentId=rows?.[0]?.id??null;
      }

      // The relation columns are additive schema support. Older databases can still
      // recover the workspace by assessment id, so a failed relation patch must not
      // invalidate a successful assessment.
      if(assessmentId && (businessId||auditId)){
        await fetch(url+"/rest/v1/growth_assessments?id=eq."+encodeURIComponent(assessmentId),{
          method:"PATCH",
          headers,
          body:JSON.stringify({business_id:businessId,audit_id:auditId}),
          cache:"no-store"
        }).catch(()=>{});
      }

      if(businessId && auditId && audit.opportunities.length){
        await fetch(url+"/rest/v1/growth_actions",{
          method:"POST",
          headers:{...headers,Prefer:"return=representation"},
          body:JSON.stringify(audit.opportunities.map(o=>({
            business_id:businessId,
            audit_id:auditId,
            title:o.title,
            area:o.area,
            impact:o.impact,
            effort:o.effort,
            mode:o.mode,
            status:"recommended",
            steps:o.steps,
            deliverable:o.deliverable,
            measurement:o.measurement
          }))),
          cache:"no-store"
        });
      }
    }

    return NextResponse.json({
      ok:true,
      stored:Boolean(assessmentId||businessId||auditId),
      id:assessmentId,
      businessId,
      auditId,
      profile,
      audit,
      assessment:record
    });
  } catch {
    return NextResponse.json({ok:false,error:"We couldn't start the assessment. Please try again."},{status:500});
  }
}
