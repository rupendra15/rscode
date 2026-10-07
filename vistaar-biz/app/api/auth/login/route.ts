import { NextResponse } from "next/server";
import { signIn } from "../../../../lib/auth";
export async function POST(request:Request){
 try{const body=await request.json();const email=String(body.email||"").trim().toLowerCase();const password=String(body.password||"");if(!email||!password)return NextResponse.json({ok:false,error:"Email and password are required."},{status:400});
  const result=await signIn(email,password);const response=NextResponse.json({ok:true,...result.body});if(result.setCookie)response.headers.set("set-cookie",result.setCookie);return response;
 }catch(e){
  const message=e instanceof TypeError&&/fetch failed/i.test(e.message)
    ? "Vistaar backend is not running. Start the Java API on http://localhost:8080 and try again."
    : e instanceof Error ? e.message : "Unable to sign in.";
  return NextResponse.json({ok:false,error:message},{status:503});
 }
}