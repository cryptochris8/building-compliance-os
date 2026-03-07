-- ============================================================
-- Row Level Security (RLS) Policies
-- All tables scoped to organization via auth.uid()
-- ============================================================

-- Helper: get the organization_id for the current authenticated user
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

-- ============================================================
-- 1. Organizations
-- ============================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organization"
  ON public.organizations FOR SELECT
  USING (id = public.get_user_org_id());

CREATE POLICY "Service role bypass for organizations"
  ON public.organizations FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 2. Users
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members of their organization"
  ON public.users FOR SELECT
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can update their own record"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Service role bypass for users"
  ON public.users FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 3. Buildings
-- ============================================================
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view buildings in their organization"
  ON public.buildings FOR SELECT
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can insert buildings in their organization"
  ON public.buildings FOR INSERT
  WITH CHECK (organization_id = public.get_user_org_id());

CREATE POLICY "Users can update buildings in their organization"
  ON public.buildings FOR UPDATE
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "Users can delete buildings in their organization"
  ON public.buildings FOR DELETE
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for buildings"
  ON public.buildings FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 4. Utility Accounts
-- ============================================================
ALTER TABLE public.utility_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage utility accounts for their buildings"
  ON public.utility_accounts FOR ALL
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Service role bypass for utility_accounts"
  ON public.utility_accounts FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 5. Utility Readings
-- ============================================================
ALTER TABLE public.utility_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage utility readings for their buildings"
  ON public.utility_readings FOR ALL
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Service role bypass for utility_readings"
  ON public.utility_readings FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 6. Compliance Years
-- ============================================================
ALTER TABLE public.compliance_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage compliance years for their buildings"
  ON public.compliance_years FOR ALL
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Service role bypass for compliance_years"
  ON public.compliance_years FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 7. Documents
-- ============================================================
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage documents for their buildings"
  ON public.documents FOR ALL
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Service role bypass for documents"
  ON public.documents FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 8. Import Jobs
-- ============================================================
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage import jobs for their organization"
  ON public.import_jobs FOR ALL
  USING (organization_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for import_jobs"
  ON public.import_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 9. Compliance Activities
-- ============================================================
ALTER TABLE public.compliance_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage compliance activities for their organization"
  ON public.compliance_activities FOR ALL
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for compliance_activities"
  ON public.compliance_activities FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 10. Deductions
-- ============================================================
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage deductions for their organization"
  ON public.deductions FOR ALL
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for deductions"
  ON public.deductions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 11. PM Connections
-- ============================================================
ALTER TABLE public.pm_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage PM connections for their organization"
  ON public.pm_connections FOR ALL
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for pm_connections"
  ON public.pm_connections FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 12. PM Property Mappings
-- ============================================================
ALTER TABLE public.pm_property_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage PM property mappings for their organization"
  ON public.pm_property_mappings FOR ALL
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for pm_property_mappings"
  ON public.pm_property_mappings FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 13. Subscriptions
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view subscriptions for their organization"
  ON public.subscriptions FOR SELECT
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Service role bypass for subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role');
