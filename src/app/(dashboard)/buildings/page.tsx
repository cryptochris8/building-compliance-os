import Link from 'next/link';
import { Plus, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { db } from '@/lib/db';
import { buildings as buildingsTable, users, complianceYears } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import type { Building, ComplianceStatus } from '@/types';
import { BuildingsPagination } from './buildings-pagination';

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const variants: Record<ComplianceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    compliant: 'default',
    at_risk: 'secondary',
    over_limit: 'destructive',
    incomplete: 'outline',
  };
  const labels: Record<ComplianceStatus, string> = {
    compliant: 'Compliant',
    at_risk: 'At Risk',
    over_limit: 'Over Limit',
    incomplete: 'Incomplete',
  };
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}

async function getBuildings(page: number): Promise<{ buildings: (Building & { status: ComplianceStatus })[]; total: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { buildings: [], total: 0 };

  const [dbUser] = await db.select({ organizationId: users.organizationId })
    .from(users).where(eq(users.id, user.id)).limit(1);
  if (!dbUser?.organizationId) return { buildings: [], total: 0 };

  // Get total count
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(buildingsTable)
    .where(eq(buildingsTable.organizationId, dbUser.organizationId));
  const total = Number(countResult?.count || 0);

  // Use a subquery to get latest compliance year status per building (avoids N+1)
  const latestCyYear = db.select({
    buildingId: complianceYears.buildingId,
    maxYear: sql<number>`max(${complianceYears.year})`.as('max_year'),
  }).from(complianceYears).groupBy(complianceYears.buildingId).as('latest_cy');

  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db.select({
    building: buildingsTable,
    latestStatus: complianceYears.status,
  }).from(buildingsTable)
    .leftJoin(latestCyYear, eq(latestCyYear.buildingId, buildingsTable.id))
    .leftJoin(complianceYears, and(
      eq(complianceYears.buildingId, buildingsTable.id),
      eq(complianceYears.year, latestCyYear.maxYear)
    ))
    .where(eq(buildingsTable.organizationId, dbUser.organizationId))
    .limit(PAGE_SIZE)
    .offset(offset);

  const buildings = rows.map(({ building: b, latestStatus }) => ({
    ...b,
    grossSqft: b.grossSqft ?? '0',
    occupancyType: b.occupancyType ?? '',
    createdAt: b.createdAt?.toISOString() ?? '',
    updatedAt: b.updatedAt?.toISOString() ?? '',
    status: (latestStatus as ComplianceStatus) || 'incomplete',
  } as Building & { status: ComplianceStatus }));

  return { buildings, total };
}

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const { buildings, total } = await getBuildings(page);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Buildings</h2>
          <p className="text-muted-foreground">
            Manage your building portfolio and track compliance.
          </p>
        </div>
        <Link href="/buildings/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Building
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Buildings</CardTitle>
          <CardDescription>
            {total === 0
              ? 'No buildings added yet. Click "Add Building" to get started.'
              : `${total} building${total !== 1 ? 's' : ''} in your portfolio`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {buildings.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Sq Ft</TableHead>
                    <TableHead>Occupancy Type</TableHead>
                    <TableHead>Jurisdiction</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildings.map((building) => (
                    <TableRow key={building.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/buildings/${building.id}`}
                          className="hover:underline"
                        >
                          {building.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {building.addressLine1}, {building.city}, {building.state} {building.zip}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(building.grossSqft).toLocaleString()}
                      </TableCell>
                      <TableCell>{building.occupancyType}</TableCell>
                      <TableCell>{building.jurisdictionId}</TableCell>
                      <TableCell>
                        <StatusBadge status={building.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <BuildingsPagination currentPage={page} totalPages={totalPages} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No buildings yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Get started by adding your first building to track compliance.
              </p>
              <Link href="/buildings/new" className="mt-4">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Building
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
