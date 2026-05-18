/**
 * Public surface of the examples feature's API layer.
 */
export { exampleKeys } from './queryKeys';
export { getExample, listExamples } from './fetchers';
export { useExample, useExamples } from './queries';
export {
  useDeleteExample,
  useDeleteExampleTranslation,
  useDemoteExample,
  usePromoteToExample,
  useTranslateExample,
} from './mutations';
