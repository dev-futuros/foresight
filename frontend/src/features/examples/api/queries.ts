/**
 * Read-side React Query hooks for the examples feature.
 */
import { useQuery } from '@tanstack/react-query';
import { getExample, listExamples } from './fetchers';
import { exampleKeys } from './queryKeys';

export function useExamples() {
  return useQuery({
    queryKey: exampleKeys.list(),
    queryFn: listExamples,
  });
}

export function useExample(id: string) {
  return useQuery({
    queryKey: exampleKeys.detail(id),
    queryFn: () => getExample(id),
    enabled: !!id,
  });
}
