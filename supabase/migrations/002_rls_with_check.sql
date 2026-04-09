-- ============================================================
-- Add explicit WITH CHECK clauses on INSERT for tables using
-- FOR ALL policies. This ensures INSERT is independently
-- validated at the DB level, not just inherited from USING.
-- ============================================================

-- 4. Utility Accounts - add INSERT-specific policy
DROP POLICY IF EXISTS "Users can manage utility accounts for their buildings" ON public.utility_accounts;

CREATE POLICY "Users can select utility accounts for their buildings"
  ON public.utility_accounts FOR SELECT
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can insert utility accounts for their buildings"
  ON public.utility_accounts FOR INSERT
  WITH CHECK (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can update utility accounts for their buildings"
  ON public.utility_accounts FOR UPDATE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can delete utility accounts for their buildings"
  ON public.utility_accounts FOR DELETE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

-- 5. Utility Readings - add INSERT-specific policy
DROP POLICY IF EXISTS "Users can manage utility readings for their buildings" ON public.utility_readings;

CREATE POLICY "Users can select utility readings for their buildings"
  ON public.utility_readings FOR SELECT
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can insert utility readings for their buildings"
  ON public.utility_readings FOR INSERT
  WITH CHECK (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can update utility readings for their buildings"
  ON public.utility_readings FOR UPDATE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can delete utility readings for their buildings"
  ON public.utility_readings FOR DELETE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

-- 6. Compliance Years - add INSERT-specific policy
DROP POLICY IF EXISTS "Users can manage compliance years for their buildings" ON public.compliance_years;

CREATE POLICY "Users can select compliance years for their buildings"
  ON public.compliance_years FOR SELECT
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can insert compliance years for their buildings"
  ON public.compliance_years FOR INSERT
  WITH CHECK (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can update compliance years for their buildings"
  ON public.compliance_years FOR UPDATE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can delete compliance years for their buildings"
  ON public.compliance_years FOR DELETE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

-- 9. Compliance Activities - add INSERT-specific policy with building check
DROP POLICY IF EXISTS "Users can manage compliance activities for their organization" ON public.compliance_activities;

CREATE POLICY "Users can select compliance activities for their organization"
  ON public.compliance_activities FOR SELECT
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Users can insert compliance activities for their organization"
  ON public.compliance_activities FOR INSERT
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND building_id IN (
      SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
    )
  );

CREATE POLICY "Users can update compliance activities for their organization"
  ON public.compliance_activities FOR UPDATE
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Users can delete compliance activities for their organization"
  ON public.compliance_activities FOR DELETE
  USING (org_id = public.get_user_org_id());

-- 10. Deductions - add INSERT-specific policy with building check
DROP POLICY IF EXISTS "Users can manage deductions for their organization" ON public.deductions;

CREATE POLICY "Users can select deductions for their organization"
  ON public.deductions FOR SELECT
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Users can insert deductions for their organization"
  ON public.deductions FOR INSERT
  WITH CHECK (
    org_id = public.get_user_org_id()
    AND building_id IN (
      SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
    )
  );

CREATE POLICY "Users can update deductions for their organization"
  ON public.deductions FOR UPDATE
  USING (org_id = public.get_user_org_id());

CREATE POLICY "Users can delete deductions for their organization"
  ON public.deductions FOR DELETE
  USING (org_id = public.get_user_org_id());

-- 7. Documents - add INSERT-specific policy
DROP POLICY IF EXISTS "Users can manage documents for their buildings" ON public.documents;

CREATE POLICY "Users can select documents for their buildings"
  ON public.documents FOR SELECT
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can insert documents for their buildings"
  ON public.documents FOR INSERT
  WITH CHECK (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can update documents for their buildings"
  ON public.documents FOR UPDATE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));

CREATE POLICY "Users can delete documents for their buildings"
  ON public.documents FOR DELETE
  USING (building_id IN (
    SELECT id FROM public.buildings WHERE organization_id = public.get_user_org_id()
  ));
