import { NextResponse } from "next/server";
import { runGrowthAudit, type BusinessProfile } from "../../../lib/audit";
import { scanWebsite } from "../../../lib/site-scanner";
import { scanLocalPresence } from "../../../lib/local-scanner";

const headers=(key:string)=>({apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"});
const profileFromAssessment=(a:any):BusinessProfile=>({
  businessName:a.business_name,
  industry:a.industry,
  city:a.city,
  serviceArea:a.service_area,
  idealCustomer:a.ideal_customer,
  offerings:a.offerings,
  differentiator:a.differentiator,
  goal:a.goal,
  target:a.target,
  constraint:a.constraint,
  channels:a.channels,
  monthlyLeads:a.monthly_leads||undefined,
  conversion:a.conversion||undefined,
  website:a.website||undefined,
  google:a.google||undefined,
  instagram:a.instagram||undefined,
  otherLinks:a.other_links||undefined,
  challenge:a.challenge,
  notes:a.notes||undefined
});

async function buildFreshAudit(profile:BusinessProfile){
  const site=await scanWebsite(profile.website);
  const siteSignals=site?{
    website:site.url,reachable:site.reachable,https:site.https,title:site.title,
    hasCta:site.hasCta,hasContactPath:site.hasPhone||site.hasEmail||site.hasWhatsApp,
    hasReviews:site.hasReviews,hasLocalTerms:site.hasLocalTerms,hasImages:site.hasImages,
    imageCount:site.imageCount,wordCount:site.wordCount,signals:site.signals
  }:undefined;
  const local=await scanLocalPresence(profile.businessName,profile.industry,profile.city);
  const localSignals={
    found:local.found,matchedName:local.matchedName,displayName:local.displayName,
    nearbyCount:local.nearbyCount,category:local.category,signals:local.signals
  };
  return runGrowthAudit(profile,siteSignals,localSignals);
}

export async function GET(request:Request){
  const params=new URL(request.url).searchParams;
  const businessId=params.get("businessId");
  const assessmentId=params.get("assessmentId");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return NextResponse.json({ok:false,stored:false},{status:503});

  try{
    // If the browser has lost its local workspace IDs, recover the most recently submitted assessment.
    // This keeps the dashboard usable after refresh/new browser sessions without inventing a workspace.
    if(!businessId && !assessmentId){
      const latestRes=await fetch(url+"/rest/v1/growth_assessments?select=*&order=created_at.desc&limit=1",{headers:headers(key),cache:"no-store"});
      if(!latestRes.ok) return NextResponse.json({ok:false,error:"No saved assessment could be loaded."},{status:502});
      const latestRows=await latestRes.json();
      const latest=latestRows?.[0];
      if(!latest) return NextResponse.json({ok:false,error:"No assessment has been submitted yet."},{status:404});
      const recoveredId=latest.id;
      const recoveredUrl=new URL(request.url);
      recoveredUrl.searchParams.set("assessmentId",recoveredId);
      return GET(new Request(recoveredUrl.toString(),request));
    }

    if(assessmentId){
      const assessmentRes=await fetch(url+"/rest/v1/growth_assessments?select=*&id=eq."+encodeURIComponent(assessmentId)+"&limit=1",{headers:headers(key),cache:"no-store"});
      if(!assessmentRes.ok) return NextResponse.json({ok:false,error:"Assessment could not be loaded."},{status:502});
      const rows=await assessmentRes.json();
      const a=rows?.[0];
      if(!a) return NextResponse.json({ok:false,error:"Assessment not found."},{status:404});

      const profile=profileFromAssessment(a);
      let persistedAudit:any=null;
      let auditId=a.audit_id||null;
      let resolvedBusinessId=a.business_id||null;

      if(a.audit_id){
        const auditRes=await fetch(url+"/rest/v1/growth_audits?select=*&id=eq."+encodeURIComponent(a.audit_id)+"&limit=1",{headers:headers(key),cache:"no-store"});
        if(auditRes.ok){
          const auditRows=await auditRes.json();
          persistedAudit=auditRows?.[0]||null;
        }
      }
      if(!resolvedBusinessId && persistedAudit?.business_id) resolvedBusinessId=persistedAudit.business_id;

      if(!persistedAudit){
        const audit=await buildFreshAudit(profile);
        // Recovering an older assessment must create the same persistent workspace
        // as a fresh submission. Never leave the dashboard backed by transient data.
        if(!resolvedBusinessId){
          const businessResponse=await fetch(url+"/rest/v1/businesses",{
            method:"POST",
            headers:{...headers(key),Prefer:"return=representation"},
            body:JSON.stringify({
              name:profile.businessName,
              industry:profile.industry,
              city:profile.city,
              goal:profile.goal,
              website:profile.website||null,
              workspace_stage:"diagnosed",
              last_activity_at:new Date().toISOString()
            }),
            cache:"no-store"
          });
          if(businessResponse.ok){
            const businesses=await businessResponse.json();
            resolvedBusinessId=businesses?.[0]?.id||null;
          }
        }

        if(resolvedBusinessId){
          const auditResponse=await fetch(url+"/rest/v1/growth_audits",{
            method:"POST",
            headers:{...headers(key),Prefer:"return=representation"},
            body:JSON.stringify({
              business_id:resolvedBusinessId,
              overall_score:audit.overall,
              maturity:audit.maturity,
              result:audit
            }),
            cache:"no-store"
          });
          if(auditResponse.ok){
            const audits=await auditResponse.json();
            auditId=audits?.[0]?.id||null;
          }
        }

        if(assessmentId && (resolvedBusinessId||auditId)){
          await fetch(url+"/rest/v1/growth_assessments?id=eq."+encodeURIComponent(assessmentId),{
            method:"PATCH",
            headers:headers(key),
            body:JSON.stringify({business_id:resolvedBusinessId,audit_id:auditId,status:"analyzed"}),
            cache:"no-store"
          }).catch(()=>{});
        }

        let actions:any[]=[];
        if(resolvedBusinessId && auditId && audit.opportunities.length){
          const actionsResponse=await fetch(url+"/rest/v1/growth_actions",{
            method:"POST",
            headers:{...headers(key),Prefer:"return=representation"},
            body:JSON.stringify(audit.opportunities.map(o=>({
              business_id:resolvedBusinessId,
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
          if(actionsResponse.ok) actions=await actionsResponse.json();
        }

        return NextResponse.json({
          ok:true,
          business:{id:resolvedBusinessId,name:profile.businessName,industry:profile.industry,city:profile.city,goal:profile.goal,website:profile.website,workspace_stage:"diagnosed"},
          profile,
          audit,
          auditId,
          assessmentId,
          assessment:a,
          actions,
          leads:[],
          measurements:[],
          specialists:[]
        });
      }

      const actionsRes=await fetch(url+"/rest/v1/growth_actions?select=*&business_id=eq."+encodeURIComponent(persistedAudit.business_id)+"&audit_id=eq."+encodeURIComponent(persistedAudit.id)+"&order=impact.desc",{headers:headers(key),cache:"no-store"});
      const leadsRes=await fetch(url+"/rest/v1/growth_leads?select=*&business_id=eq."+encodeURIComponent(persistedAudit.business_id)+"&order=created_at.desc&limit=50",{headers:headers(key),cache:"no-store"});
      const measurementsRes=await fetch(url+"/rest/v1/growth_measurements?select=*&business_id=eq."+encodeURIComponent(persistedAudit.business_id)+"&order=measured_at.desc&limit=50",{headers:headers(key),cache:"no-store"});
      const specialistsRes=await fetch(url+"/rest/v1/specialist_requests?select=*&business_id=eq."+encodeURIComponent(persistedAudit.business_id)+"&order=created_at.desc&limit=20",{headers:headers(key),cache:"no-store"});
      const evidenceRes=await fetch(url+"/rest/v1/growth_evidence?select=*&business_id=eq."+encodeURIComponent(persistedAudit.business_id)+"&order=observed_at.desc&limit=100",{headers:headers(key),cache:"no-store"});
      let actions=actionsRes.ok?await actionsRes.json():[];
      const leads=leadsRes.ok?await leadsRes.json():[];
      const measurements=measurementsRes.ok?await measurementsRes.json():[];
      const specialists=specialistsRes.ok?await specialistsRes.json():[];
      const evidence=evidenceRes.ok?await evidenceRes.json():[];
      // Older workspaces can have a persisted audit but no persisted actions if
      // the original action insert failed. Repair that gap from the saved audit.
      if(!actions.length && persistedAudit?.result?.opportunities?.length){
        const repairResponse=await fetch(url+"/rest/v1/growth_actions",{
          method:"POST",
          headers:{...headers(key),Prefer:"return=representation"},
          body:JSON.stringify(persistedAudit.result.opportunities.map((o:any)=>({
            business_id:persistedAudit.business_id,
            audit_id:persistedAudit.id,
            title:o.title,area:o.area,impact:o.impact,effort:o.effort,mode:o.mode,
            status:"recommended",steps:o.steps||[],deliverable:o.deliverable||null,measurement:o.measurement||null
          }))),
          cache:"no-store"
        });
        if(repairResponse.ok) actions=await repairResponse.json();
      }
      return NextResponse.json({
        ok:true,
        business:{id:persistedAudit.business_id,name:profile.businessName,industry:profile.industry,city:profile.city,goal:profile.goal,website:profile.website,workspace_stage:"diagnosed"},
        profile,
        audit:persistedAudit.result,
        auditId:persistedAudit.id,
        auditCreatedAt:persistedAudit.created_at,
        assessmentId,
        assessment:a,
        actions,
        leads,
        measurements,
        specialists,
        evidence
      });
    }

    if(!businessId) return NextResponse.json({ok:false,error:"businessId or assessmentId is required."},{status:400});

    const [businessRes,auditRes,actionsRes,leadsRes,measurementsRes,specialistsRes]=await Promise.all([
      fetch(url+"/rest/v1/businesses?select=*&id=eq."+encodeURIComponent(businessId)+"&limit=1",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_audits?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=created_at.desc&limit=1",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_actions?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=impact.desc,created_at.desc&limit=20",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_leads?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=created_at.desc&limit=50",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_measurements?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=measured_at.desc&limit=50",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/specialist_requests?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=created_at.desc&limit=20",{headers:headers(key),cache:"no-store"}),
      fetch(url+"/rest/v1/growth_evidence?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=observed_at.desc&limit=100",{headers:headers(key),cache:"no-store"})
    ]);

    if(!businessRes.ok||!auditRes.ok) return NextResponse.json({ok:false,error:"Workspace data could not be loaded."},{status:502});
    const businesses=await businessRes.json();
    const audits=await auditRes.json();
    let actions=actionsRes.ok?await actionsRes.json():[];
    const leads=leadsRes.ok?await leadsRes.json():[];
    const measurements=measurementsRes.ok?await measurementsRes.json():[];
    const specialists=specialistsRes.ok?await specialistsRes.json():[];
    const evidence=evidenceRes.ok?await evidenceRes.json():[];
    if(!businesses?.[0]||!audits?.[0]) return NextResponse.json({ok:false,error:"Workspace not found."},{status:404});

    const b=businesses[0], latest=audits[0];
    if(!actions.length && latest?.result?.opportunities?.length){
      const repairResponse=await fetch(url+"/rest/v1/growth_actions",{
        method:"POST",
        headers:{...headers(key),Prefer:"return=representation"},
        body:JSON.stringify(latest.result.opportunities.map((o:any)=>({
          business_id:b.id,audit_id:latest.id,title:o.title,area:o.area,impact:o.impact,effort:o.effort,mode:o.mode,
          status:"recommended",steps:o.steps||[],deliverable:o.deliverable||null,measurement:o.measurement||null
        }))),
        cache:"no-store"
      });
      if(repairResponse.ok) actions=await repairResponse.json();
    }
    let assessment:any=null;
    const assessmentRes=await fetch(url+"/rest/v1/growth_assessments?select=*&business_id=eq."+encodeURIComponent(businessId)+"&order=created_at.desc&limit=1",{headers:headers(key),cache:"no-store"});
    if(assessmentRes.ok){
      const rows=await assessmentRes.json();
      assessment=rows?.[0]||null;
    }

    const profile=assessment?profileFromAssessment(assessment):{
      businessName:b.name,industry:b.industry,city:b.city,goal:b.goal,website:b.website||undefined
    };
    return NextResponse.json({
      ok:true,
      business:b,
      profile,
      audit:latest.result,
      auditId:latest.id,
      auditCreatedAt:latest.created_at,
      assessmentId:assessment?.id||null,
      assessment,
      actions,
      leads,
      measurements,
      specialists,
      evidence
    });
  }catch{
    return NextResponse.json({ok:false,error:"Unable to load the workspace."},{status:500});
  }
}
