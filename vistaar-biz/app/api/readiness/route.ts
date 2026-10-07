import { NextResponse } from "next/server";
import { requireRole } from "../../../lib/auth";

function db(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("Vistaar database is not configured.");
  return {url,key};
}
const h=(key:string,extra?:Record<string,string>)=>({apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...extra});

export async function POST(request:Request){
  try{
    const body=await request.json();
    const answers=Array.isArray(body.answers)?body.answers.map((v:any)=>Number(v)):[];
    const score=Number(body.readinessScore);
    if(answers.length!==6||answers.some(v=>![0,1,2,3].includes(v))||!Number.isFinite(score)) return NextResponse.json({ok:false,error:"Invalid readiness submission."},{status:400});
    const {url,key}=db();
    const response=await fetch(url+"/rest/v1/readiness_submissions",{
      method:"POST",headers:h(key,{Prefer:"return=representation"}),
      body:JSON.stringify({answers,readiness_score:Math.max(0,Math.min(100,Math.round(score))),source:"website-readiness-check"}),cache:"no-store"
    });
    if(!response.ok) return NextResponse.json({ok:false,error:"Readiness submission could not be saved."},{status:502});
    const rows=await response.json();
    return NextResponse.json({ok:true,id:rows?.[0]?.id||null});
  }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Unable to save readiness submission."},{status:500});}
}

export async function GET(){
  try{
    await requireRole(["admin","manager"]);
    const {url,key}=db();
    const response=await fetch(url+"/rest/v1/readiness_submissions?select=id,answers,readiness_score,source,created_at&order=created_at.desc&limit=100",{headers:h(key),cache:"no-store"});
    if(!response.ok) return NextResponse.json({ok:false,error:"Readiness submissions could not be loaded."},{status:502});
    return NextResponse.json({ok:true,submissions:await response.json()});
  }catch(e){const m=e instanceof Error?e.message:"Unable to load readiness submissions.";return NextResponse.json({ok:false,error:m==="FORBIDDEN"?"Manager or admin access is required.":m},{status:m==="FORBIDDEN"?403:500});}
}
