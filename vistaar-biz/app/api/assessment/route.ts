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

    // Evidence collection happens before the diagnosis so every score has an
    // explicit business context + evidence basis.
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
      const representationHeaders={...headers,Prefer:"return=representation"};

      // 1. Save the user's source-of-truth assessment first. This prevents
      // orphan businesses/audits if the original submission cannot be stored.
      const assessmentResponse=await fetch(url+"/rest/v1/growth_assessments",{
        method:"POST",
        headers:representationHeaders,
        body:JSON.stringify({...record,status:"analyzed"}),
        cache:"no-store"
      });
      if(assessmentResponse.ok){
        const rows=await assessmentResponse.json();
        assessmentId=rows?.[0]?.id??null;
      } else {
        const detail=await assessmentResponse.text().catch(()=>"");
        return NextResponse.json({ok:false,error:"We couldn't save your assessment. Please try again.",detail:detail.slice(0,300)},{status:502});
      }

      // 2. Create the persistent business workspace from that assessment.
      const businessResponse=await fetch(url+"/rest/v1/businesses",{
        method:"POST",
        headers:representationHeaders,
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

      // 3. Persist the evidence-based diagnosis.
      if(businessId){
        const auditResponse=await fetch(url+"/rest/v1/growth_audits",{
          method:"POST",
          headers:representationHeaders,
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

      // 4. Link the source assessment to its workspace and diagnosis.
      if(assessmentId){
        await fetch(url+"/rest/v1/growth_assessments?id=eq."+encodeURIComponent(assessmentId),{
          method:"PATCH",
          headers,
          body:JSON.stringify({business_id:businessId,audit_id:auditId,status:businessId&&auditId?"analyzed":"submitted"}),
          cache:"no-store"
        }).catch(()=>{});
      }

      // 4b. Persist the evidence ledger separately from the diagnosis.
      // This lets the workspace explain not only what Vistaar decided, but why.
      let persistedEvidence:any[]=[];
      if(businessId){
        const evidence:any[]=[
          ["assessment","business_context","Business identity",record.business_name,"high"],
          ["assessment","market","Industry / market",record.industry,"high"],
          ["assessment","market","Primary city / market",record.city,"high"],
          ["assessment","market","Service area",record.service_area,"high"],
          ["assessment","customer","Ideal customer",record.ideal_customer,"high"],
          ["assessment","offer","Products / services",record.offerings,"high"],
          ["assessment","positioning","Differentiator",record.differentiator,"high"],
          ["assessment","goal","Primary growth outcome",record.goal,"high"],
          ["assessment","target","Success target",record.target,"high"],
          ["assessment","constraint","Business constraint",record.constraint,"high"],
          ["assessment","acquisition","Current acquisition channels",record.channels,"high"],
          ["assessment","challenge","Investigation request",record.challenge,"high"]
        ];
        if(record.monthly_leads) evidence.push(["assessment","baseline","Qualified enquiries per month",record.monthly_leads,"medium"]);
        if(record.conversion) evidence.push(["assessment","baseline","Enquiry-to-customer rate",record.conversion,"medium"]);
        if(siteSignals) evidence.push(
          ["website","technical","Website reachable",String(siteSignals.reachable),"high"],
          ["website","conversion","CTA present",String(siteSignals.hasCta),"high"],
          ["website","conversion","Contact path present",String(siteSignals.hasContactPath),"high"],
          ["website","trust","Reviews detected",String(siteSignals.hasReviews),"medium"],
          ["website","content","Images detected",String(siteSignals.imageCount),"high"],
          ["website","content","Word count",String(siteSignals.wordCount),"medium"]
        );
        if(localSignals) evidence.push(
          ["local","discovery","Local listing signal found",String(localSignals.found),"medium"],
          ["local","discovery","Business-name match",String(localSignals.matchedName),"medium"],
          ["local","market","Nearby category signals",String(localSignals.nearbyCount),"medium"]
        );
        if(audit.google) evidence.push(
          ["google","reputation","Google rating",String(audit.google.rating??"—"),"high"],
          ["google","reputation","Google review count",String(audit.google.reviewCount??0),"high"],
          ["google","engagement","Website clicks",String(audit.google.websiteClicks),"high"],
          ["google","engagement","Phone calls",String(audit.google.phoneCalls),"high"],
          ["google","engagement","Direction requests",String(audit.google.directionRequests),"high"]
        );
        const evidenceResponse=await fetch(url+"/rest/v1/growth_evidence",{
          method:"POST",
          headers:representationHeaders,
          body:JSON.stringify(evidence.map(([source,evidence_type,claim,value,confidence])=>({
            business_id:businessId,assessment_id:assessmentId,audit_id:auditId,
            source,evidence_type,claim,value,confidence
          }))),
          cache:"no-store"
        });
        if(evidenceResponse.ok) persistedEvidence=await evidenceResponse.json().catch(()=>[]);
        if(!evidenceResponse.ok){
          // Evidence persistence is additive. Do not invalidate an otherwise valid
          // assessment if an older Supabase project has not applied the migration yet.
        }
      }

      // 5. Turn diagnosis into executable, persisted actions.
      if(businessId && auditId && audit.opportunities.length){
        await fetch(url+"/rest/v1/growth_actions",{
          method:"POST",
          headers:representationHeaders,
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
      evidence:persistedEvidence,
      assessment:record
    });
  } catch {
    return NextResponse.json({ok:false,error:"We couldn't start the assessment. Please try again."},{status:500});
  }
}
