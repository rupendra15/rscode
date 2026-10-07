import { NextResponse } from "next/server";
import { signIn } from "../../../../lib/auth";
export async function POST(request:Request){
  try{
    const body=await request.json();
    const email=String(body.email||"").trim().toLowerCase();
    const password=String(body.password||"");
    if(!email||!password) return NextResponse.json({ok:false,error:"Email and password are required."},{status:400});
    await signIn(email,password);
    return NextResponse.json({ok:true});
  }catch(e){ return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Unable to sign in."},{status:401}); }
}