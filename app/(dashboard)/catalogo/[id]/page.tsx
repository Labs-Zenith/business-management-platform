import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCOP } from "@/lib/money";
import { requireSessionOrRedirect } from "@/lib/session";
import { loadStoreFromCookie } from "@/lib/mock/cookie-persistence";
import { isCatalogEnabled } from "@/lib/services/features";
import { getCatalogProduct } from "@/lib/services/product-catalog-service";
import type { CatalogProductDetail, CatalogProductVariantWithTiers } from "@/lib/services/ports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardRow, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyAmount } from "@/components/domain/money-amount";
import { PageHeader } from "@/components/domain/page-header";
import { StatCard } from "@/components/domain/stat-card";
import { PricingModeBadge } from "@/components/domain/catalogo/pricing-mode-badge";

/**
 * Detalle de producto de catálogo screen. `getCatalogProduct` returns the
 * full `CatalogProductDetail` (header + every variant + tier, per
 * `lib/services/ports.ts`), which this page groups into a StatCards row (the
 * at-a-glance facts) plus a variants/tiers table shaped to the product's
 * `pricingMode` — `fixed`/`area` have no variants at all, `variant`/`package`
 * render one flat table, and `tiered` renders one nested table PER variant
 * (its own ladder), mirroring `invoices/[id]/page.tsx`'s
 * StatCard-row + Card-sections structure.
 */

type CatalogProductDetailPageProps = {
  params: Promise<{ id: string }>;
};

/** `min === max` collapses to a single figure; otherwise a "min - max" range. */
function formatPriceRange(cents: number[]): string {
  if (cents.length === 0) return "-";
  const min = Math.min(...cents);
  const max = Math.max(...cents);
  return min === max ? formatCOP(min) : `${formatCOP(min)} - ${formatCOP(max)}`;
}

/** The "Rango de precio" StatCard's value, computed per `pricingMode` from whatever prices that mode actually stores. */
function priceRangeLabel(product: CatalogProductDetail): string {
  switch (product.pricingMode) {
    case "fixed":
      return formatCOP(product.fixedUnitPrice ?? 0);
    case "area":
      return `${formatCOP(product.areaBasePrice ?? 0)} + ${formatCOP(product.areaRatePerM2 ?? 0)}/m²`;
    case "variant":
      return formatPriceRange(product.variants.map((variant) => variant.unitPrice ?? 0));
    case "package":
      return formatPriceRange(product.variants.map((variant) => variant.packageTotalPrice ?? 0));
    case "tiered":
      return formatPriceRange(
        product.variants.flatMap((variant) => variant.tiers.map((tier) => tier.unitPrice ?? tier.flatTotalPrice ?? 0)),
      );
  }
}

/** The "Pedido mínimo" StatCard's value — DERIVED for `package`/`tiered` (see the migration's header comment), stored directly otherwise. */
function minOrderLabel(product: CatalogProductDetail): string {
  if (product.pricingMode === "package") {
    const quantities = product.variants.map((variant) => variant.packageQuantity ?? 0).filter((qty) => qty > 0);
    return quantities.length > 0 ? `${Math.min(...quantities)} unidades (1 paquete)` : "-";
  }
  if (product.pricingMode === "tiered") {
    const minimums = product.variants
      .map((variant) => variant.minOrderQuantity)
      .filter((qty): qty is number => qty !== null);
    return minimums.length > 0 ? `${Math.min(...minimums)} unidades` : "-";
  }
  return `${product.minOrderQuantity} unidades`;
}

function VariantTable({ variants }: { variants: CatalogProductVariantWithTiers[] }) {
  return (
    <Table className="min-w-[560px]">
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Precio unitario</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {variants.map((variant) => (
          <TableRow key={variant.id}>
            <TableCell className="font-medium">{variant.name}</TableCell>
            <TableCell>{variant.description ?? "-"}</TableCell>
            <TableCell>
              <MoneyAmount cents={variant.unitPrice ?? 0} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PackageTable({ variants }: { variants: CatalogProductVariantWithTiers[] }) {
  return (
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Unidades por paquete</TableHead>
          <TableHead>Precio del paquete</TableHead>
          <TableHead>Precio por unidad (aprox.)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {variants.map((variant) => {
          const qty = variant.packageQuantity ?? 0;
          const total = variant.packageTotalPrice ?? 0;
          const perUnit = qty > 0 ? Math.round(total / qty) : 0;
          return (
            <TableRow key={variant.id}>
              <TableCell className="font-medium">{variant.name}</TableCell>
              <TableCell>{qty}</TableCell>
              <TableCell>
                <MoneyAmount cents={total} />
              </TableCell>
              <TableCell>
                <MoneyAmount cents={perUnit} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** One `Card` per `tiered` variant — each has its OWN quantity ladder, so a single flat table (unlike `variant`/`package`) would conflate different products' rungs. */
function TieredVariantCards({ variants }: { variants: CatalogProductVariantWithTiers[] }) {
  return (
    <div className="flex flex-col gap-4">
      {variants.map((variant) => (
        <Card key={variant.id}>
          <CardHeader>
            <CardTitle>{variant.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {variant.description ? <p className="mb-2 text-sm text-muted-foreground">{variant.description}</p> : null}
            <Table className="min-w-[480px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Total del escalón</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variant.tiers.map((tier) => {
                  const totalCents = tier.unitPrice !== null ? tier.unitPrice * tier.quantity : (tier.flatTotalPrice ?? 0);
                  return (
                    <TableRow key={tier.id}>
                      <TableCell>{tier.quantity}</TableCell>
                      <TableCell>
                        {tier.unitPrice !== null ? (
                          <>
                            <MoneyAmount cents={tier.unitPrice} /> c/u
                          </>
                        ) : (
                          "Precio total del escalón"
                        )}
                      </TableCell>
                      <TableCell>
                        <MoneyAmount cents={totalCents} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function CatalogProductDetailPage({ params }: CatalogProductDetailPageProps) {
  await loadStoreFromCookie();
  const session = await requireSessionOrRedirect();

  if (!(await isCatalogEnabled(session.businessId))) {
    notFound();
  }

  const { id } = await params;
  const product = await getCatalogProduct(session, id);

  return (
    <PageShell>
      <PageHeader
        title={product.name}
        description={
          <span className="flex items-center gap-2">
            {/* On a generic catalog most products use the default 'fixed'
                mode, so a "Precio fijo" badge on every single product would
                just be noise — only show it once it's actually informative
                (a non-default pricing scheme). Mirrors the same condition on
                the list page. */}
            {product.pricingMode !== "fixed" ? <PricingModeBadge mode={product.pricingMode} /> : null}
            <Badge variant={product.active ? "success" : "outline"}>{product.active ? "Activo" : "Inactivo"}</Badge>
          </span>
        }
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/catalogo" />}>Catálogo</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{product.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        actions={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<Link href={`/catalogo/${product.id}/edit`} />}
          >
            Editar producto
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Rango de precio" value={priceRangeLabel(product)} />
        <StatCard label="Pedido mínimo" value={minOrderLabel(product)} />
        <StatCard
          label="Variantes"
          value={product.variants.length > 0 ? String(product.variants.length) : "Sin variantes"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos del producto</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <CardRow label="Categoría">{product.category ?? "-"}</CardRow>
          <CardRow label="Descripción">{product.description ?? "-"}</CardRow>
        </CardContent>
      </Card>

      {product.pricingMode === "variant" ? (
        <Card>
          <CardHeader>
            <CardTitle>Variantes</CardTitle>
          </CardHeader>
          <CardContent>
            <VariantTable variants={product.variants} />
          </CardContent>
        </Card>
      ) : null}

      {product.pricingMode === "package" ? (
        <Card>
          <CardHeader>
            <CardTitle>Paquetes</CardTitle>
          </CardHeader>
          <CardContent>
            <PackageTable variants={product.variants} />
          </CardContent>
        </Card>
      ) : null}

      {product.pricingMode === "tiered" ? <TieredVariantCards variants={product.variants} /> : null}
    </PageShell>
  );
}
