import { NextResponse } from "next/server";
import { signUp } from "../../../../lib/auth";
export async function POST(request:Request){
  try{
    const body=await request.json();
    const name=String(body.name||"").trim();
    const email=String(body.email||"").trim().toLowerCase();
    const password=String(body.password||"");
    if(!email||!password) return NextResponse.json({ok:false,error:"Email and password are required."},{status:400});
    if(password.length<8) return NextResponse.json({ok:false,error:"Password must be at least 8 characters."},{status:400});
    const data=await signUp(email,password,name);
    return NextResponse.json({ok:true,requiresConfirmation:!data.access_token});
  }catch(e){ return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Unable to create your account."},{status:400}); }
}