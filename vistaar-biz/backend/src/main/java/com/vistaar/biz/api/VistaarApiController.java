package com.vistaar.biz.api;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vistaar.biz.auth.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.postgresql.util.PGobject;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class VistaarApiController {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final AuthService auth;

    public VistaarApiController(JdbcTemplate db, ObjectMapper json, AuthService auth) {
        this.db = db; this.json = json; this.auth = auth;
    }

    private Map<String,Object> user(HttpServletRequest r) { return auth.currentUser(r); }
    private boolean role(HttpServletRequest r, String... roles) {
        Map<String,Object> u=user(r); if(u==null) return false;
        return Arrays.asList(roles).contains(String.valueOf(u.get("role")));
    }
    private ResponseEntity<Map<String,Object>> unauthorized() { return ResponseEntity.status(401).body(Map.of("ok",false,"error","Please sign in.")); }
    private ResponseEntity<Map<String,Object>> forbidden() { return ResponseEntity.status(403).body(Map.of("ok",false,"error","You do not have permission for this operation.")); }
    private PGobject jsonb(Object value) {
        try { PGobject o=new PGobject(); o.setType("jsonb"); o.setValue(json.writeValueAsString(value==null?Map.of():value)); return o; }
        catch(JsonProcessingException | java.sql.SQLException e){ throw new IllegalArgumentException("Invalid JSON data.", e); }
    }
    private String str(Map<String,Object> b,String k){ Object v=b.get(k); return v==null?null:String.valueOf(v).trim(); }
    private int asInt(Object value){ return value instanceof Number n ? n.intValue() : 0; }
    private Object uuid(String s){ return s==null||s.isBlank()?null:UUID.fromString(s); }
    private Object jsonValue(Object value){
        if(value instanceof PGobject p){ try { return json.readValue(p.getValue(), Object.class); } catch(Exception ignored) { return p.getValue(); } }
        return value;
    }

    @PostMapping("/assessment")
    public ResponseEntity<?> assessment(@RequestBody Map<String,Object> b, HttpServletRequest r) {
        try {
            Map<String,Object> record=(Map<String,Object>)b.getOrDefault("assessment", b);
            Map<String,Object> profile=(Map<String,Object>)b.get("profile");
            Map<String,Object> audit=(Map<String,Object>)b.get("audit");
            List<Map<String,Object>> evidence=(List<Map<String,Object>>)b.getOrDefault("evidence", List.of());
            String businessName=str(record,"business_name");
            if(businessName==null||str(record,"industry")==null||str(record,"city")==null) return ResponseEntity.badRequest().body(Map.of("ok",false,"error","Required assessment fields are missing."));
            Map<String,Object> u=user(r); UUID owner=u==null?null:UUID.fromString(String.valueOf(u.get("id")));

            UUID businessId=null;
            if(owner!=null) {
                List<Map<String,Object>> rows=db.queryForList("select id from businesses where owner_user_id=? and name=? order by created_at limit 1",owner,businessName);
                if(!rows.isEmpty()) businessId=(UUID)rows.get(0).get("id");
            }
            if(businessId==null){
                businessId=UUID.randomUUID();
                db.update("insert into businesses(id,owner_user_id,owner_email,name,industry,city,goal,website,workspace_stage,last_activity_at) values(?,?,?,?,?,?,?,?,?,now())",
                    businessId,owner,u==null?null:u.get("email"),businessName,str(record,"industry"),str(record,"city"),str(record,"goal"),str(record,"website"),"diagnosed");
            }
            int version=1;
            Integer max=db.queryForObject("select coalesce(max(version),0) from growth_assessments where business_id=?",Integer.class,businessId);
            if(max!=null) version=max+1;
            UUID assessmentId=UUID.randomUUID();
            db.update("""
              insert into growth_assessments(id,business_id,owner_user_id,version,business_name,industry,city,service_area,ideal_customer,offerings,differentiator,goal,target,constraint_text,channels,monthly_leads,conversion,website,google,instagram,other_links,challenge,notes,status)
              values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,assessmentId,businessId,owner,version,businessName,str(record,"industry"),str(record,"city"),str(record,"service_area"),str(record,"ideal_customer"),str(record,"offerings"),str(record,"differentiator"),str(record,"goal"),str(record,"target"),str(record,"constraint"),str(record,"channels"),str(record,"monthly_leads"),str(record,"conversion"),str(record,"website"),str(record,"google"),str(record,"instagram"),str(record,"other_links"),str(record,"challenge"),str(record,"notes"),"analyzed");

            UUID auditId=null;
            if(audit!=null){
                auditId=UUID.randomUUID();
                Number score=(Number)audit.getOrDefault("overall",0);
                db.update("insert into growth_audits(id,business_id,overall_score,maturity,result) values(?,?,?,?,?)",
                    auditId,businessId,score.intValue(),str(audit,"maturity"),jsonb(audit));
                db.update("update growth_assessments set audit_id=? where id=?",auditId,assessmentId);
                Object opportunities=audit.get("opportunities");
                if(opportunities instanceof List<?> list) for(Object item:list){
                    if(item instanceof Map<?,?> raw){
                        Map<String,Object> m=(Map<String,Object>)raw;
                        db.update("insert into growth_actions(id,business_id,audit_id,title,area,impact,effort,mode,status,steps,deliverable,measurement) values(?,?,?,?,?,?,?,?,?,?,?,?)",
                            UUID.randomUUID(),businessId,auditId,String.valueOf(m.get("title")),String.valueOf(m.get("area")),
                            asInt(m.get("impact")),String.valueOf(m.get("effort")==null?"medium":m.get("effort")),
                            String.valueOf(m.get("mode")==null?"vistaar":m.get("mode")), "recommended",jsonb(m.get("steps")),m.get("deliverable"),m.get("measurement"));
                    }
                }
            }
            for(Map<String,Object> e:evidence){
                db.update("insert into growth_evidence(id,business_id,assessment_id,audit_id,source,evidence_type,claim,value,confidence,metadata) values(?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(),businessId,assessmentId,auditId,e.get("source"),e.get("evidence_type"),e.get("claim"),e.get("value"),e.getOrDefault("confidence","medium"),jsonb(e.get("metadata")));
            }
            Map<String,Object> out=new LinkedHashMap<>(); out.put("ok",true); out.put("stored",true); out.put("id",assessmentId.toString()); out.put("businessId",businessId.toString()); out.put("auditId",auditId==null?null:auditId.toString()); out.put("profile",profile==null?Map.of():profile); out.put("audit",audit==null?Map.of():audit); return ResponseEntity.ok(out);
        } catch(Exception e) { return ResponseEntity.internalServerError().body(Map.of("ok",false,"error","We couldn't save your assessment.","detail",e.getMessage()==null?"":e.getMessage())); }
    }

    @PostMapping("/audit")
    public ResponseEntity<?> audit(@RequestBody Map<String,Object> b, HttpServletRequest r) {
        Map<String,Object> profile=(Map<String,Object>)b.get("profile");
        Map<String,Object> audit=(Map<String,Object>)b.get("audit");
        String assessmentIdText=str(b,"assessmentId");
        if(profile==null||audit==null)return ResponseEntity.badRequest().body(Map.of("error","Profile and audit are required."));
        Map<String,Object> u=user(r); UUID owner=u==null?null:UUID.fromString(String.valueOf(u.get("id")));

        UUID bid=null;
        UUID assessmentId=null;
        if(assessmentIdText!=null&&!assessmentIdText.isBlank()){
            assessmentId=UUID.fromString(assessmentIdText);
            List<Map<String,Object>> rows=db.queryForList("select business_id from growth_assessments where id=? limit 1",assessmentId);
            if(!rows.isEmpty()) bid=(UUID)rows.get(0).get("business_id");
        }

        if(bid==null){
            List<Map<String,Object>> rows=db.queryForList(
                "select id from businesses where owner_user_id=? and lower(name)=lower(?) and lower(city)=lower(?) order by last_activity_at desc,created_at desc limit 1",
                owner,profile.get("businessName"),profile.get("city"));
            if(!rows.isEmpty()) bid=(UUID)rows.get(0).get("id");
        }

        if(bid==null){
            bid=UUID.randomUUID();
            db.update("insert into businesses(id,owner_user_id,owner_email,name,industry,city,goal,website,workspace_stage,last_activity_at) values(?,?,?,?,?,?,?,?,?,now())",
                bid,owner,u==null?null:u.get("email"),profile.get("businessName"),profile.get("industry"),profile.get("city"),profile.get("goal"),profile.get("website"),"diagnosed");
        }

        UUID aid=UUID.randomUUID();
        Number score=(Number)audit.getOrDefault("overall",0);
        db.update("insert into growth_audits(id,business_id,overall_score,maturity,result) values(?,?,?,?,?)",aid,bid,score.intValue(),audit.get("maturity"),jsonb(audit));

        if(assessmentId!=null){
            db.update("delete from growth_actions where audit_id=? and status='recommended'", 
                db.queryForObject("select audit_id from growth_assessments where id=?",UUID.class,assessmentId));
            db.update("update growth_assessments set audit_id=?,status='analyzed' where id=?",aid,assessmentId);
        }

        Object opportunities=audit.get("opportunities");
        if(opportunities instanceof List<?> list) for(Object item:list) if(item instanceof Map<?,?> raw){
          Map<String,Object> m=(Map<String,Object>)raw;
          db.update("insert into growth_actions(id,business_id,audit_id,title,area,impact,effort,mode,status,steps,deliverable,measurement) values(?,?,?,?,?,?,?,?,?,?,?,?)",
            UUID.randomUUID(),bid,aid,String.valueOf(m.get("title")),String.valueOf(m.get("area")),asInt(m.get("impact")),
            String.valueOf(m.get("effort")==null?"medium":m.get("effort")),String.valueOf(m.get("mode")==null?"vistaar":m.get("mode")),"recommended",jsonb(m.get("steps")),m.get("deliverable"),m.get("measurement"));
        }
        db.update("update businesses set workspace_stage='diagnosed',last_activity_at=now(),goal=?,website=? where id=?",profile.get("goal"),profile.get("website"),bid);
        return ResponseEntity.ok(Map.of("profile",profile,"audit",audit,"businessId",bid.toString(),"auditId",aid.toString(),"assessmentId",assessmentId==null?"":assessmentId.toString()));
    }

    @PostMapping("/readiness")
    public ResponseEntity<?> readiness(@RequestBody Map<String,Object> b) {
        try {
            Object answers=b.get("answers"); Number score=(Number)b.get("readinessScore");
            if(!(answers instanceof List<?> a)||a.size()!=6||score==null) return ResponseEntity.badRequest().body(Map.of("ok",false,"error","Invalid readiness submission."));
            UUID id=UUID.randomUUID();
            db.update("insert into readiness_submissions(id,answers,readiness_score) values(?,?,?)",id,jsonb(answers),(int)Math.max(0,Math.min(100,Math.round(score.doubleValue()))));
            return ResponseEntity.ok(Map.of("ok",true,"id",id.toString()));
        } catch(Exception e){return ResponseEntity.internalServerError().body(Map.of("ok",false,"error","Readiness submission could not be saved."));}
    }

    @GetMapping("/readiness")
    public ResponseEntity<?> readinessGet(HttpServletRequest r){ if(!role(r,"admin","manager")) return unauthorized(); return ResponseEntity.ok(Map.of("ok",true,"submissions",db.queryForList("select id,answers,readiness_score,source,created_at from readiness_submissions order by created_at desc limit 100"))); }

    @PostMapping("/enquiries")
    public ResponseEntity<?> enquiry(@RequestBody Map<String,Object> b){
        String[] req={"name","businessName","phone","need","question"}; for(String k:req) if(str(b,k)==null||str(b,k).isBlank()) return ResponseEntity.badRequest().body(Map.of("ok",false,"error","Please complete the required fields."));
        UUID id=UUID.randomUUID();
        db.update("insert into enquiries(id,name,business_name,phone,email,need,question) values(?,?,?,?,?,?,?)",id,str(b,"name"),str(b,"businessName"),str(b,"phone"),str(b,"email"),str(b,"need"),str(b,"question"));
        return ResponseEntity.ok(Map.of("ok",true,"stored",true,"id",id.toString()));
    }

    @GetMapping("/enquiries")
    public ResponseEntity<?> enquiries(HttpServletRequest r){if(!role(r,"admin","manager"))return unauthorized();return ResponseEntity.ok(Map.of("ok",true,"enquiries",db.queryForList("select * from enquiries order by created_at desc limit 100")));}

    @GetMapping("/workspace")
    public ResponseEntity<?> workspace(@RequestParam(required=false) String businessId,@RequestParam(required=false) String assessmentId,@RequestParam(required=false) String list,HttpServletRequest r){
        if(!role(r,"admin","manager")) return unauthorized();
        try {
            if("1".equals(list)) return ResponseEntity.ok(Map.of("ok",true,"workspaces",db.queryForList("""
                    select b.id as business_id,b.name,b.industry,b.city,b.goal,b.website,b.workspace_stage,b.last_activity_at,b.created_at,
                           a.id as assessment_id,a.version as assessment_version,a.created_at as assessment_created_at,
                           a.status as assessment_status
                    from growth_assessments a
                    join businesses b on b.id=a.business_id
                    order by a.created_at desc limit 500
                    """)));

            if(isBlankUuidParam(businessId)&&isBlankUuidParam(assessmentId))return ResponseEntity.badRequest().body(Map.of("ok",false,"error","businessId or assessmentId is required."));

            UUID bid=null;
            UUID selectedAssessmentId=null;
            UUID selectedAuditId=null;

            if(!isBlankUuidParam(assessmentId)){
                selectedAssessmentId=parseUuid(assessmentId,"assessmentId");
                List<Map<String,Object>> rows=db.queryForList("select business_id,audit_id from growth_assessments where id=? limit 1",selectedAssessmentId);
                if(rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("ok",false,"error","The selected assessment does not exist."));
                bid=(UUID)rows.get(0).get("business_id");
                Object auditRef=rows.get(0).get("audit_id");
                if(auditRef instanceof UUID) selectedAuditId=(UUID)auditRef;
                else if(auditRef!=null) selectedAuditId=UUID.fromString(String.valueOf(auditRef));
            } else {
                bid=parseUuid(businessId,"businessId");
                List<Map<String,Object>> rows=db.queryForList("select id,audit_id from growth_assessments where business_id=? order by version desc,created_at desc limit 1",bid);
                if(rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("ok",false,"error","No assessment exists for this business."));
                selectedAssessmentId=(UUID)rows.get(0).get("id");
                Object auditRef=rows.get(0).get("audit_id");
                if(auditRef instanceof UUID) selectedAuditId=(UUID)auditRef;
                else if(auditRef!=null) selectedAuditId=UUID.fromString(String.valueOf(auditRef));
            }

            if(selectedAuditId==null) return ResponseEntity.status(404).body(Map.of("ok",false,"error","This assessment does not have a saved diagnosis yet."));

            // Historical data can contain multiple assessments pointing at the same audit.
            // Never make the current URL choose an arbitrary "unclaimed" audit: that caused
            // two different assessment URLs to resolve to the same report. Repair the duplicate
            // mapping as a one-to-one assignment using assessment/audit creation times.
            if(selectedAssessmentId!=null){
                repairDuplicateAssessmentAudits(bid,selectedAuditId);
                Object repaired=db.queryForObject(
                    "select audit_id from growth_assessments where id=?",
                    Object.class,selectedAssessmentId);
                if(repaired instanceof UUID) selectedAuditId=(UUID)repaired;
                else if(repaired!=null) selectedAuditId=UUID.fromString(String.valueOf(repaired));
            }

            List<Map<String,Object>> bs=db.queryForList("select * from businesses where id=? limit 1",bid);
            List<Map<String,Object>> au=db.queryForList("select * from growth_audits where id=? and business_id=? limit 1",selectedAuditId,bid);
            List<Map<String,Object>> assessments=db.queryForList("select * from growth_assessments where id=? limit 1",selectedAssessmentId);
            if(bs.isEmpty()||au.isEmpty()||assessments.isEmpty())return ResponseEntity.status(404).body(Map.of("ok",false,"error","The selected business diagnosis could not be found."));

            Map<String,Object> b=bs.get(0), a=au.get(0);
            List<Map<String,Object>> as=db.queryForList("select * from growth_actions where business_id=? and audit_id=? order by impact desc,created_at desc limit 20",bid,selectedAuditId);
            List<Map<String,Object>> leads=db.queryForList("select * from growth_leads where business_id=? order by created_at desc limit 50",bid);
            List<Map<String,Object>> measurements=db.queryForList("select * from growth_measurements where business_id=? order by measured_at desc limit 50",bid);
            List<Map<String,Object>> specialists=db.queryForList("select * from specialist_requests where business_id=? order by created_at desc limit 20",bid);
            List<Map<String,Object>> evidence=db.queryForList("select * from growth_evidence where business_id=? and (assessment_id=? or audit_id=?) order by observed_at desc limit 100",bid,selectedAssessmentId,selectedAuditId);

            Map<String,Object> out=new LinkedHashMap<>();
            out.put("ok",true);
            out.put("business",b);
            out.put("audit",jsonValue(a.get("result")));
            out.put("auditId",a.get("id"));
            out.put("auditCreatedAt",a.get("created_at"));
            out.put("assessmentId",selectedAssessmentId);
            out.put("assessment",assessments.get(0));
            out.put("actions",as);
            out.put("leads",leads);
            out.put("measurements",measurements);
            out.put("specialists",specialists);
            out.put("evidence",evidence);
            return ResponseEntity.ok(out);
        } catch(Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("ok",false,"error","Workspace could not be loaded.","detail",e.getMessage()==null?e.getClass().getSimpleName():e.getMessage()));
        }
    }

    private Instant asInstant(Object value){
        if(value instanceof Instant i) return i;
        if(value instanceof java.sql.Timestamp t) return t.toInstant();
        if(value instanceof java.util.Date d) return d.toInstant();
        try { return Instant.parse(String.valueOf(value)); }
        catch(Exception ignored) { return Instant.EPOCH; }
    }

    private void repairDuplicateAssessmentAudits(UUID businessId, UUID duplicatedAuditId){
        Integer usage=db.queryForObject(
            "select count(*) from growth_assessments where business_id=? and audit_id=?",
            Integer.class,businessId,duplicatedAuditId);
        if(usage==null || usage<2) return;

        List<Map<String,Object>> assessments=db.queryForList("""
            select id,created_at
            from growth_assessments
            where business_id=? and audit_id=?
            order by created_at,id
            """,businessId,duplicatedAuditId);
        if(assessments.size()<2) return;

        // Include the shared audit itself plus only audits that are not already owned by
        // another assessment. This prevents stealing a valid report from a third assessment.
        List<Map<String,Object>> audits=db.queryForList("""
            select ga.id,ga.created_at
            from growth_audits ga
            where ga.business_id=?
              and (
                  ga.id=?
                  or ga.id not in (
                      select audit_id
                      from growth_assessments
                      where business_id=? and audit_id is not null and audit_id<>?
                  )
              )
            order by ga.created_at,ga.id
            """,businessId,duplicatedAuditId,businessId,duplicatedAuditId);

        if(audits.size()<assessments.size()) return;

        Set<UUID> used=new HashSet<>();
        for(Map<String,Object> assessmentRow:assessments){
            UUID assessmentId=(UUID)assessmentRow.get("id");
            Instant assessmentTime=asInstant(assessmentRow.get("created_at"));
            UUID bestAudit=null;
            long bestDistance=Long.MAX_VALUE;

            for(Map<String,Object> auditRow:audits){
                UUID auditId=(UUID)auditRow.get("id");
                if(used.contains(auditId)) continue;
                Instant auditTime=asInstant(auditRow.get("created_at"));
                long distance=Math.abs(auditTime.toEpochMilli()-assessmentTime.toEpochMilli());
                if(distance<bestDistance){
                    bestDistance=distance;
                    bestAudit=auditId;
                }
            }

            if(bestAudit!=null){
                used.add(bestAudit);
                db.update("update growth_assessments set audit_id=? where id=?",bestAudit,assessmentId);
            }
        }
    }

    private static boolean isBlankUuidParam(String value){
        return value==null||value.isBlank()||"null".equalsIgnoreCase(value);
    }

    private static UUID parseUuid(String value,String field){
        if(isBlankUuidParam(value)) throw new IllegalArgumentException("Missing "+field+".");
        try{
            return UUID.fromString(value);
        }catch(IllegalArgumentException e){
            throw new IllegalArgumentException("Invalid "+field+" UUID: "+value);
        }
    }

    @PatchMapping("/actions")
    public ResponseEntity<?> action(@RequestBody Map<String,Object> b,HttpServletRequest r){
        if(!role(r,"admin"))return forbidden(); String id=str(b,"id"), status=str(b,"status");
        Set<String> allowed=Set.of("recommended","planned","in_progress","blocked","done","dismissed");
        if(id==null||!allowed.contains(status))return ResponseEntity.badRequest().body(Map.of("ok",false,"error","A valid action id and status are required."));
        UUID uid=UUID.fromString(id); Instant now=Instant.now();
        db.update("update growth_actions set status=?,started_at=case when ?='in_progress' then coalesce(started_at,?) else started_at end,completed_at=case when ?='done' then ? else completed_at end where id=?",status,status,now,status,now,uid);
        List<Map<String,Object>> rows=db.queryForList("select * from growth_actions where id=?",uid);
        if(!rows.isEmpty())db.update("update businesses set workspace_stage=?,last_activity_at=now() where id=?",
            "in_progress".equals(status)?"executing":"done".equals(status)?"measuring":"blocked".equals(status)?"blocked":"diagnosed",rows.get(0).get("business_id"));
        return ResponseEntity.ok(Map.of("ok",true,"action",rows.isEmpty()?null:rows.get(0)));
    }

    @PostMapping("/leads")
    public ResponseEntity<?> lead(@RequestBody Map<String,Object> b,HttpServletRequest r){if(!role(r,"admin"))return forbidden();String bid=str(b,"businessId"),source=str(b,"source");if(bid==null||source==null)return ResponseEntity.badRequest().body(Map.of("ok",false,"error","businessId and source are required."));UUID id=UUID.randomUUID();db.update("insert into growth_leads(id,business_id,source,external_id,name,phone,email,status,value,currency,metadata) values(?,?,?,?,?,?,?,?,?,?,?)",id,UUID.fromString(bid),source,str(b,"externalId"),str(b,"name"),str(b,"phone"),str(b,"email"),str(b,"status")==null?"new":str(b,"status"),b.get("value"),str(b,"currency")==null?"INR":str(b,"currency"),jsonb(b.get("metadata")));return ResponseEntity.ok(Map.of("ok",true,"lead",db.queryForMap("select * from growth_leads where id=?",id)));}

    @PostMapping("/measurements")
    public ResponseEntity<?> measurement(@RequestBody Map<String,Object> b,HttpServletRequest r){if(!role(r,"admin"))return forbidden();String bid=str(b,"businessId"),metric=str(b,"metricName"),source=str(b,"source");if(bid==null||metric==null||source==null)return ResponseEntity.badRequest().body(Map.of("ok",false,"error","businessId, metricName and source are required."));UUID id=UUID.randomUUID();db.update("insert into growth_measurements(id,business_id,action_id,metric_name,baseline_value,current_value,unit,source,metadata) values(?,?,?,?,?,?,?,?,?)",id,UUID.fromString(bid),uuid(str(b,"actionId")),metric,b.get("baselineValue"),b.get("currentValue"),str(b,"unit"),source,jsonb(b.get("metadata")));db.update("update businesses set workspace_stage='learning',last_activity_at=now() where id=?",UUID.fromString(bid));return ResponseEntity.ok(Map.of("ok",true,"measurement",db.queryForMap("select * from growth_measurements where id=?",id)));}

    @PostMapping("/specialists")
    public ResponseEntity<?> specialist(@RequestBody Map<String,Object> b,HttpServletRequest r){if(!role(r,"admin"))return forbidden();String bid=str(b,"businessId"),type=str(b,"specialistType"),brief=str(b,"brief");if(bid==null||type==null||brief==null)return ResponseEntity.badRequest().body(Map.of("ok",false,"error","businessId, specialistType and brief are required."));UUID id=UUID.randomUUID();db.update("insert into specialist_requests(id,business_id,action_id,specialist_type,brief,status) values(?,?,?,?,?,?)",id,UUID.fromString(bid),uuid(str(b,"actionId")),type,brief,"recommended");return ResponseEntity.ok(Map.of("ok",true,"request",db.queryForMap("select * from specialist_requests where id=?",id)));}

    @PostMapping("/outreach")
    public ResponseEntity<?> outreach(@RequestBody Map<String,Object> b,HttpServletRequest r){if(!role(r,"admin","manager"))return forbidden();Map<String,Object> u=user(r);String bid=str(b,"businessId");if(bid==null)return ResponseEntity.badRequest().body(Map.of("ok",false,"error","businessId is required."));String status=str(b,"status")==null?"contacted":str(b,"status");UUID manager=UUID.fromString(String.valueOf(u.get("id")));db.update("insert into manager_outreach(business_id,manager_user_id,status,notes,contacted_at,updated_at) values(?,?,?,?,case when ? in ('contacted','follow_up','converted') then now() else null end,now()) on conflict(business_id,manager_user_id) do update set status=excluded.status,notes=excluded.notes,contacted_at=excluded.contacted_at,updated_at=now()",UUID.fromString(bid),manager,status,str(b,"notes"),status);return ResponseEntity.ok(Map.of("ok",true,"outreach",db.queryForMap("select * from manager_outreach where business_id=? and manager_user_id=?",UUID.fromString(bid),manager)));}

    @GetMapping("/outreach")
    public ResponseEntity<?> outreachGet(@RequestParam(required=false) String businessId,HttpServletRequest r){if(!role(r,"admin","manager"))return forbidden();Map<String,Object> u=user(r);String q="select * from manager_outreach where 1=1";List<Object> p=new ArrayList<>();if(businessId!=null){q+=" and business_id=?";p.add(UUID.fromString(businessId));}if("manager".equals(u.get("role"))){q+=" and manager_user_id=?";p.add(UUID.fromString(String.valueOf(u.get("id"))));}q+=" order by updated_at desc limit 100";return ResponseEntity.ok(Map.of("ok",true,"outreach",db.queryForList(q,p.toArray())));}

    @GetMapping("/admin/users")
    public ResponseEntity<?> users(HttpServletRequest r){if(!role(r,"admin"))return forbidden();return ResponseEntity.ok(Map.of("ok",true,"users",db.queryForList("select id,name,email,role,status,created_at,last_login_at from app_users order by created_at desc limit 500")));}

    @PatchMapping("/admin/users")
    public ResponseEntity<?> userUpdate(@RequestBody Map<String,Object> b,HttpServletRequest r){if(!role(r,"admin"))return forbidden();Map<String,Object> u=user(r);String id=str(b,"userId"),role=str(b,"role"),status=str(b,"status");if(id==null||!Set.of("admin","manager").contains(role)||!Set.of("active","disabled").contains(status))return ResponseEntity.badRequest().body(Map.of("ok",false,"error","Valid internal account, role and status are required."));if(id.equals(String.valueOf(u.get("id")))&&!role.equals("admin"))return ResponseEntity.badRequest().body(Map.of("ok",false,"error","The active admin account cannot remove its own admin role."));db.update("update app_users set role=?,status=?,updated_at=now() where id=?",role,status,UUID.fromString(id));return ResponseEntity.ok(Map.of("ok",true,"user",db.queryForMap("select id,name,email,role,status,created_at,last_login_at from app_users where id=?",UUID.fromString(id))));}

    @GetMapping("/admin/reports")
    public ResponseEntity<?> reports(HttpServletRequest r){if(!role(r,"admin"))return forbidden();return ResponseEntity.ok(Map.of("ok",true,"assessments",db.queryForList("select * from growth_assessments order by created_at desc limit 500"),"businesses",db.queryForList("select * from businesses order by created_at desc limit 500"),"audits",db.queryForList("select * from growth_audits order by created_at desc limit 500"),"actions",db.queryForList("select * from growth_actions order by created_at desc limit 500"),"enquiries",db.queryForList("select * from enquiries order by created_at desc limit 500")));}

    @GetMapping("/health")
    public Map<String,Object> health(){return Map.of("ok",true,"service","vistaar-biz-api","database","postgresql");}
}
