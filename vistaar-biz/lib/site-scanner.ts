export type SiteSignals={url:string;reachable:boolean;https:boolean;title:string;description:string;hasPhone:boolean;hasEmail:boolean;hasWhatsApp:boolean;hasForm:boolean;hasCta:boolean;hasLocalTerms:boolean;hasReviews:boolean;hasSocialLinks:boolean;hasImages:boolean;imageCount:number;wordCount:number;signals:string[]};

const cleanUrl=(input:string)=>{let u=input.trim();if(!/^https?:\/\//i.test(u))u="https://"+u;return new URL(u).toString()};

export async function scanWebsite(input?:string):Promise<SiteSignals|null>{
 if(!input?.trim()) return null;
 const url=cleanUrl(input);
 const fallback:SiteSignals={url,reachable:false,https:url.startsWith("https://"),title:"",description:"",hasPhone:false,hasEmail:false,hasWhatsApp:false,hasForm:false,hasCta:false,hasLocalTerms:false,hasReviews:false,hasSocialLinks:false,hasImages:false,imageCount:0,wordCount:0,signals:[]};
 try{
  const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(8000),headers:{"user-agent":"Vistaar-Biz-Growth-Audit/1.0"}});
  const html=await response.text();
  const text=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
  const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/\s+/g," ").trim().slice(0,160);
  const description=(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]||"").slice(0,220);
  const links=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]);
  const lower=html.toLowerCase();
  const imageCount=(html.match(/<img\b/gi)||[]).length;
  const out={...fallback,reachable:response.ok,title,description,hasPhone:/\+?\d[\d\s().-]{8,}\d/.test(text),hasEmail:/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text),hasWhatsApp:/whatsapp|wa\.me/i.test(lower),hasForm:/<form\b/i.test(lower),hasCta:/\b(book|call|contact|get started|enquire|quote|appointment|buy|order|whatsapp)\b/i.test(lower),hasLocalTerms:/\b(rewa|indore|bhopal|jabalpur|pune|delhi|mumbai|mp|madhya pradesh|near me|local)\b/i.test(lower),hasReviews:/review|testimonial|rating|google business/i.test(lower),hasSocialLinks:links.some(x=>/instagram|facebook|youtube|linkedin|twitter|x\.com/i.test(x)),hasImages:imageCount>0,imageCount,wordCount:text.split(/\s+/).filter(Boolean).length,signals:[]};
  out.signals=[
   out.https?"Secure HTTPS is present":"HTTPS is missing or unavailable",
   out.title?"Page title is present":"Page title is missing",
   out.description?"Meta description is present":"Meta description is missing",
   out.hasCta?"A conversion CTA is visible":"No obvious conversion CTA detected",
   out.hasPhone||out.hasEmail||out.hasWhatsApp?"A direct contact path is visible":"No clear direct contact path detected",
   out.hasReviews?"Trust/review language is present":"No visible review or trust language detected",
   out.hasLocalTerms?"Local relevance signals are present":"Local relevance signals are weak or absent",
   out.hasImages?"Visual content is present":"No images detected"
  ];
  return out;
 }catch{return fallback;}
}