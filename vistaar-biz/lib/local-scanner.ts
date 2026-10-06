export type LocalSignals={query:string;found:boolean;matchedName:boolean;displayName:string;address:string;lat?:number;lon?:number;category:string;nearbyCount:number;source:"OpenStreetMap";signals:string[]};

const esc=(s:string)=>encodeURIComponent(s.trim());

export async function scanLocalPresence(businessName:string,industry:string,city:string):Promise<LocalSignals>{
 const query=businessName+", "+city;
 const fallback:LocalSignals={query,found:false,matchedName:false,displayName:"",address:"",category:"",nearbyCount:0,source:"OpenStreetMap",signals:["Local directory scan unavailable"]};
 try{
  const headers={"user-agent":"Vistaar-Biz/1.0 growth-audit","accept-language":"en"};
  const r=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q="+esc(query),{headers,signal:AbortSignal.timeout(7000)});
  const data=await r.json() as Array<{display_name:string;lat:string;lon:string;type:string;class:string}>;
  const words=businessName.toLowerCase().split(/\s+/).filter(w=>w.length>3);
  const hit=data.find(x=>words.some(w=>x.display_name.toLowerCase().includes(w)))||data[0];
  const nr=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=50&q="+esc(industry+", "+city),{headers,signal:AbortSignal.timeout(7000)});
  const nearby=await nr.json() as unknown[];
  const found=Boolean(hit);
  const matchedName=Boolean(hit&&words.filter(w=>hit.display_name.toLowerCase().includes(w)).length>=Math.min(2,words.length||1));
  return {query,found,matchedName,displayName:hit?.display_name||"",address:hit?.display_name||"",lat:hit?Number(hit.lat):undefined,lon:hit?Number(hit.lon):undefined,category:hit?.type||hit?.class||"",nearbyCount:nearby.length,source:"OpenStreetMap",signals:[found?"A local directory listing was found":"No matching local directory listing was found",matchedName?"Business-name terms match the listing":"Business-name match is weak",nearby.length?nearby.length+" nearby category results detected":"Few nearby category results detected"]};
 }catch{return fallback;}
}