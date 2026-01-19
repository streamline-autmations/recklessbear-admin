import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { LeadsTableClient } from "./leads-table-client";

interface Lead {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

async function getLeads(): Promise<Lead[]> {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:15',message:'getLeads entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
  // #endregion
  const supabase = await createClient();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:18',message:'After createClient',data:{supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0,30)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  // Check authentication first
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:27',message:'After auth.getUser',data:{hasUser:!!user,userId:user?.id?.substring(0,8),authError:authError?JSON.stringify(authError):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
  // #endregion

  if (authError || !user) {
    console.error("Authentication error:", authError);
    return [];
  }

  // Check if user has a profile (required for RLS)
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:36',message:'After profile query',data:{hasProfile:!!profileData,role:profileData?.role,profileError:profileError?JSON.stringify(profileError):null,profileErrorCode:profileError?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D'})}).catch(()=>{});
  // #endregion

  if (profileError) {
    console.error("Profile error (user may not have a profile - RLS may block access):", profileError);
    // Continue anyway - RLS will handle access
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:43',message:'Before leads query',data:{userId:user?.id?.substring(0,8),role:profileData?.role},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C,D,E'})}).catch(()=>{});
  // #endregion

  const { data, error } = await supabase
    .from("leads")
    .select("id, lead_id, name, email, phone, status, created_at")
    .order("created_at", { ascending: false });

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:50',message:'After leads query',data:{dataLength:data?.length??0,hasData:!!data,hasError:!!error,errorMessage:error?.message,errorCode:error?.code,errorDetails:error?.details,errorHint:error?.hint,errorStr:error?JSON.stringify(error):null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
  // #endregion

  if (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:53',message:'Error path - error object details',data:{errorKeys:error?Object.keys(error):[],errorStringified:error?JSON.stringify(error):'null',errorMessage:error?.message,errorCode:error?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B'})}).catch(()=>{});
    // #endregion
    console.error("Error fetching leads:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return [];
  }

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'leads/page.tsx:64',message:'Success path - returning leads',data:{leadCount:data?.length??0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  return data || [];
}

export default async function LeadsPage() {
  const leads = await getLeads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">
          Manage and track your leads.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Leads List</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsTableClient initialLeads={leads} />
        </CardContent>
      </Card>
    </div>
  );
}
