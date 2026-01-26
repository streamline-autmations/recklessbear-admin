import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFunnelData, getRepPerformanceData, getProductionPipelineData, getStockAlerts } from "./actions";
import { LeadsFunnel } from "./components/leads-funnel";
import { RepPerformance } from "./components/rep-performance";
import { ProductionPipeline } from "./components/production-pipeline";
import { StockAlerts } from "./components/stock-alerts";
import { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Analytics | RecklessBear Admin",
};

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
        <p className="text-muted-foreground mt-2">Only Admins and CEOs can view analytics.</p>
      </div>
    );
  }

  // Fetch data in parallel
  const [funnelData, repData, pipelineData, stockAlerts] = await Promise.all([
    getFunnelData(),
    getRepPerformanceData(),
    getProductionPipelineData(),
    getStockAlerts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Funnels, performance, and operational signals." />
      
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="funnel">Leads Funnel</TabsTrigger>
          <TabsTrigger value="reps">Rep Performance</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StockAlerts data={stockAlerts} />
            <div className="col-span-3 grid gap-4 md:grid-cols-2">
               <LeadsFunnel data={funnelData} />
               <ProductionPipeline data={pipelineData} />
            </div>
          </div>
          <RepPerformance data={repData} />
        </TabsContent>
        
        <TabsContent value="funnel" className="space-y-4">
          <LeadsFunnel data={funnelData} />
        </TabsContent>
        
        <TabsContent value="reps" className="space-y-4">
          <RepPerformance data={repData} />
        </TabsContent>
        
        <TabsContent value="production" className="space-y-4">
          <ProductionPipeline data={pipelineData} />
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <StockAlerts data={stockAlerts} />
            {/* Can add stock movements chart later */}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
