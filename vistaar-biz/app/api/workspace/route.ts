import { NextResponse } from "next/server";
import { backendFetch } from "../../../lib/backend";
export async function GET(request:Request){const qs=new URL(request.url).search;const r=await backendFetch("/api/workspace"+qs);return NextResponse.json(await r.json(),{status:r.status});}