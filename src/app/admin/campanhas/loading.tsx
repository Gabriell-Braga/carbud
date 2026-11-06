import {
  FilterBarSkeleton,
  MetricGridSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";

export default function Loading() {
  return (
    <PageSkeleton label="Carregando leads">
      <PageHeaderSkeleton withActions={false} />
      <MetricGridSkeleton count={5} />
      <FilterBarSkeleton fields={2} />
      <TableSkeleton columns={["24%", "22%", "16%", "16%", "14%", "8%"]} rows={10} />
    </PageSkeleton>
  );
}
