import type { AuditResult, BusinessProfile, SiteAuditSignals, LocalAuditSignals, GoogleAuditSignals } from "./audit";

type AiInput = {
  profile: BusinessProfile;
  site?: SiteAuditSignals;
  local?: LocalAuditSignals;
  google?: GoogleAuditSignals;
  baseline: AuditResult;
};

export type AiDiagnosis = Pick<AuditResult,
  "overall"|"maturity"|"metrics"|"opportunities"|"nextMove"|"summary"|"reasoning"
> & {
  findings: Array<{
    title:string;
    severity:"priority"|"attention"|"strength";
    area:string;
    evidence:string[];
    implication:string;
  }>;
};

const schema={
  type:"object", additionalProperties:false,
  properties:{
    overall:{type:"integer",minimum:20,maximum:95}, maturity:{type:"string"}, summary:{type:"string"}, nextMove:{type:"string"},
    reasoning:{type:"array",items:{type:"string"},minItems:4,maxItems:6},
    metrics:{type:"array",minItems:5,maxItems:5,items:{type:"object",additionalProperties:false,properties:{
      key:{type:"string"},label:{type:"string"},score:{type:"integer",minimum:20,maximum:95},
      status:{type:"string",enum:["Strong","Improve","Priority"]},reason:{type:"string"}
    },required:["key","label","score","status","reason"]}},
    findings:{type:"array",minItems:3,maxItems:6,items:{type:"object",additionalProperties:false,properties:{
      title:{type:"string"},severity:{type:"string",enum:["priority","attention","strength"]},area:{type:"string"},
      evidence:{type:"array",items:{type:"string"},minItems:1,maxItems:4},implication:{type:"string"}
    },required:["title","severity","area","evidence","implication"]}},
    opportunities:{type:"array",minItems:3,maxItems:3,items:{type:"object",additionalProperties:false,properties:{
      title:{type:"string"},area:{type:"string"},impact:{type:"integer",minimum:40,maximum:95},
      effort:{type:"string",enum:["Low","Medium","High"]},reason:{type:"string"},
      mode:{type:"string",enum:["AI","DIY","Expert"]},specialist:{type:"string"},
      steps:{type:"array",items:{type:"string"},minItems:4,maxItems:7},
      deliverable:{type:"string"},measurement:{type:"string"}
    },required:["title","area","impact","effort","reason","mode","specialist","steps","deliverable","measurement"]}}
  },
  required:["overall","maturity","summary","nextMove","reasoning","metrics","findings","opportunities"]
};

function cleanText(v:unknown){return typeof v==="string"?v.trim():"";}
function normalizeMetric(m:any,i:number){
  const labels=["Discoverability","Trust & reputation","Content & visuals","Conversion","Lead generation"];
  const label=cleanText(m?.label)||labels[i]||"Growth";
  const score=Math.max(20,Math.min(95,Number(m?.score)||50));
  return {key:cleanText(m?.key)||label.toLowerCase().replace(/[^a-z]+/g,"-"),label,score,
    status:(["Strong","Improve","Priority"].includes(m?.status)?m.status:(score>=72?"Strong":score>=55?"Improve":"Priority")) as "Strong"|"Improve"|"Priority",
    reason:cleanText(m?.reason)||"Insufficient evidence to make a stronger claim."};
}

export type AiDiagnosisResult = { diagnosis: AiDiagnosis|null; error?: string; model?: string };

export async function runAiDiagnosisDetailed(input:AiInput):Promise<AiDiagnosisResult>{
  const apiKey=process.env.OPENAI_API_KEY?.trim();
  if(!apiKey)return {diagnosis:null,error:"OPENAI_API_KEY is not available to the Next.js server. Check vistaar-biz/.env.local and restart npm run dev."};
  const model=process.env.OPENAI_MODEL?.trim()||"gpt-6-luna";
  const payload={
    business:input.profile,
    observedEvidence:{website:input.site||null,local:input.local||null,google:input.google||null},
    deterministicBaseline:{metrics:input.baseline.metrics,opportunities:input.baseline.opportunities.map(x=>({area:x.area,title:x.title,reason:x.reason})),score:input.baseline.overall}
  };
  const instructions=[
    "You are Vistaar Intelligence, the senior growth strategist inside a business growth platform.",
    "Diagnose this specific business and turn its actual context plus observed evidence into a ranked commercial growth plan.",
    "Never invent customers, reviews, traffic, revenue, rankings, competitors, Google performance, website claims or outcomes.",
    "A supplied URL is INPUT, not proof that the profile/listing is verified. Distinguish supplied, scanned, independently matched and measured evidence.",
    "Missing data must be called not verified or not supplied; never convert missing data into a negative business fact.",
    "Respect the business goal, ideal customer, offer, differentiator, target, constraint, channels, monthly enquiries and conversion rate. These determine priority.",
    "Score evidence strength/readiness, NOT imagined business performance. Website word/image counts do not prove content quality.",
    "Every finding must contain concrete evidence and explain why it matters.",
    "Every opportunity must be something Vistaar could actually sell or execute. Give 4-7 specific implementation steps, a concrete deliverable and measurable success criteria.",
    "Never use vague advice such as improve marketing, increase visibility, create content or build trust without specifying exactly what to change, where, for whom and how it will be measured.",
    "Rank opportunities by business impact, evidence of the problem, relevance to the stated goal and feasibility; do not simply select the three lowest scores.",
    "If the strongest opportunity is Google/local discovery, explain exactly what is known and what still needs verification. If Google data is absent, do not pretend it exists.",
    "Prefer: The owner wants X, current evidence shows Y, therefore the next action is Z.",
    "Return ONLY JSON matching the requested schema.",
    "",
    "BUSINESS + EVIDENCE:",
    JSON.stringify(payload,null,2)
  ].join("\n");

  try{
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
      body:JSON.stringify({model,input:[{role:"system",content:instructions}],text:{format:{type:"json_schema",name:"vistaar_growth_diagnosis",strict:true,schema}},max_output_tokens:4500}),
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok){
      const detail=await response.text().catch(()=>"");
      let message=`OpenAI API returned HTTP ${response.status}.`;
      try{const parsedError=JSON.parse(detail);const apiMessage=parsedError?.error?.message;if(typeof apiMessage==="string"&&apiMessage.trim())message+=` ${apiMessage.trim()}`;}catch{}
      return {diagnosis:null,error:message,model};
    }
    const raw=await response.json() as any;
    const outputText=typeof raw.output_text==="string"?raw.output_text:
      Array.isArray(raw.output)?raw.output.flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).map((item:any)=>item?.text).filter((value:any)=>typeof value==="string").join(""):"";
    if(!outputText)return {diagnosis:null,error:"OpenAI returned no structured diagnosis output.",model};
    let parsed:any;
    try{parsed=JSON.parse(outputText);}catch{return {diagnosis:null,error:"OpenAI returned output that was not valid JSON.",model};}
    if(!parsed||!Array.isArray(parsed.opportunities)||!Array.isArray(parsed.metrics))return {diagnosis:null,error:"OpenAI returned an incomplete diagnosis payload.",model};
    return {diagnosis:{
      overall:Math.max(20,Math.min(95,Number(parsed.overall)||input.baseline.overall)),
      maturity:cleanText(parsed.maturity)||input.baseline.maturity,
      summary:cleanText(parsed.summary)||input.baseline.summary,
      nextMove:cleanText(parsed.nextMove)||input.baseline.nextMove,
      reasoning:Array.isArray(parsed.reasoning)?parsed.reasoning.map(cleanText).filter(Boolean).slice(0,6):input.baseline.reasoning,
      metrics:parsed.metrics.slice(0,5).map(normalizeMetric),
      findings:Array.isArray(parsed.findings)?parsed.findings.slice(0,6).map((f:any)=>({
        title:cleanText(f.title)||"Finding",severity:(["priority","attention","strength"].includes(f.severity)?f.severity:"attention") as "priority"|"attention"|"strength",
        area:cleanText(f.area)||"Growth",evidence:Array.isArray(f.evidence)?f.evidence.map(cleanText).filter(Boolean).slice(0,4):[],
        implication:cleanText(f.implication)||"Further evidence is needed before making a stronger recommendation."
      })):[],
      opportunities:parsed.opportunities.slice(0,3).map((o:any)=>({
        title:cleanText(o.title)||"Priority growth action",area:cleanText(o.area)||"Growth",
        impact:Math.max(40,Math.min(95,Number(o.impact)||60)),effort:o.effort==="High"?"High":o.effort==="Medium"?"Medium":"Low",
        reason:cleanText(o.reason)||"This action is relevant to the stated business goal.",
        mode:o.mode==="DIY"?"DIY":o.mode==="Expert"?"Expert":"AI",specialist:cleanText(o.specialist)||"Vistaar Growth Strategy",
        steps:Array.isArray(o.steps)?o.steps.map(cleanText).filter(Boolean).slice(0,7):[],
        deliverable:cleanText(o.deliverable)||"A concrete implementation brief.",
        measurement:cleanText(o.measurement)||"Qualified enquiries and conversion outcomes."
      }))
    }};
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown OpenAI request error.";
    return {diagnosis:null,error:`OpenAI diagnosis request failed: ${message}`,model};
  }
}

export async function runAiDiagnosis(input:AiInput):Promise<AiDiagnosis|null>{
  const result=await runAiDiagnosisDetailed(input);
  return result.diagnosis;
}
