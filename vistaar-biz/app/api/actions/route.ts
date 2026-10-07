import { NextResponse } from "next/server";

const allowed=["recommended","planned","in_progress","blocked","done","dismissed"];

export async function PATCH(request:Request){
  try{
    const body=await request.json();
    const id=String(body.id||"").trim();
    const status=String(body.status||"").trim();
    if(!id||!allowed.includes(status)) return NextResponse.json({ok:false,error:"A valid action id and status are required."},{status:400});

    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return NextResponse.json({ok:false,error:"Workspace persistence is not configured."},{status:503});

    const response=await fetch(url+"/rest/v1/growth_actions?id=eq."+encodeURIComponent(id),{
      method:"PATCH",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=representation"},
      body:JSON.stringify({status}),
      cache:"no-store"
    });
    if(!response.ok) return NextResponse.json({ok:false,error:"Action status could not be updated."},{status:502});
    const rows=await response.json();
    return NextResponse.json({ok:true,action:rows?.[0]||null});
  }catch{
    return NextResponse.json({ok:false,error:"Unable to update the growth action."},{status:500});
  }
}
