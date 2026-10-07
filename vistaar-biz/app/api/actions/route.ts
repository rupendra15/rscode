import { NextResponse } from "next/server";
import { requireRole } from "../../../../lib/auth";

const allowed=["recommended","planned","in_progress","blocked","done","dismissed"];

export async function PATCH(request:Request){
  try{
    await requireRole(["admin","manager"]);
    const body=await request.json();
    const id=String(body.id||"").trim();
    const status=String(body.status||"").trim();
    if(!id||!allowed.includes(status)) return NextResponse.json({ok:false,error:"A valid action id and status are required."},{status:400});

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return NextResponse.json({ok:false,error:"Workspace persistence is not configured."},{status:503});

    const now=new Date().toISOString();
    const actionPayload:any={
      status,
      started_at:status==="in_progress"?now:undefined,
      completed_at:status==="done"?now:null
    };
    Object.keys(actionPayload).forEach(k=>actionPayload[k]===undefined&&delete actionPayload[k]);
    const response=await fetch(url+"/rest/v1/growth_actions?id=eq."+encodeURIComponent(id),{
      method:"PATCH",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify(actionPayload),
      cache:"no-store"
    });
    if(!response.ok) return NextResponse.json({ok:false,error:"Action status could not be updated."},{status:502});
    const rows=await response.json();
    const action=rows?.[0]||null;
    if(action?.business_id){
      await fetch(url+"/rest/v1/businesses?id=eq."+encodeURIComponent(action.business_id),{
        method:"PATCH",
        headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
        body:JSON.stringify({
          workspace_stage:status==="in_progress"?"executing":status==="done"?"measuring":status==="blocked"?"blocked":"diagnosed",
          last_activity_at:now
        }),
        cache:"no-store"
      }).catch(()=>{});
    }
    return NextResponse.json({ok:true,action});
  }catch(e){
    const message=e instanceof Error?e.message:"";
    if(message==="UNAUTHENTICATED") return NextResponse.json({ok:false,error:"Please sign in."},{status:401});
    if(message==="FORBIDDEN") return NextResponse.json({ok:false,error:"This operation is available only to Vistaar admin and manager accounts."},{status:403});
    return NextResponse.json({ok:false,error:"Unable to update the growth action."},{status:500});
  }
}
