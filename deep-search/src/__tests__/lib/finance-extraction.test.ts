import type { FinancialMetric, ValuationDataPoint, RiskFactor } from '@/lib/types';

/**
 * Unit tests for finance extraction field parsing.
 * Tests that financialMetrics, valuationData, and riskFactors are correctly
 * parsed from LLM output and default to [] for malformed/missing fields.
 */

describe('Finance extraction field parsing', () => {
  // Helper: simulate the parsing logic used in extract/route.ts
  function parseFinanceFields(parsed: Record<string, unknown>) {
    return {
      financialMetrics: Array.isArray(parsed.financialMetrics)
        ? (parsed.financialMetrics as FinancialMetric[]).filter(
            (m) =>
              m != null &&
              typeof m.metric === 'string' &&
              typeof m.value === 'string'
          )
        : [],
      valuationData: Array.isArray(parsed.valuationData)
        ? (parsed.valuationData as ValuationDataPoint[]).filter(
            (v) =>
              v != null &&
              typeof v.metric === 'string' &&
              typeof v.currentValue === 'string'
          )
        : [],
      riskFactors: Array.isArray(parsed.riskFactors)
        ? (parsed.riskFactors as RiskFactor[]).filter(
            (r) =>
              r != null &&
              typeof r.factor === 'string' &&
              typeof r.description === 'string' &&
              (r.type === 'risk' || r.type === 'opportunity') &&
              (r.severity === 'high' || r.severity === 'medium' || r.severity === 'low')
          )
        : [],
    };
  }

  describe('valid financialMetrics parsing', () => {
    it('parses well-formed financial metrics', () => {
      const input = {
        financialMetrics: [
          { metric: 'Revenue', value: '$26.97B', period: 'Q3 2024', context: 'Record quarterly revenue' },
          { metric: 'Net Income', value: '$14.88B', period: 'Q3 2024', context: 'Up 109% YoY' },
        ],
      };
      const result = parseFinanceFields(input);
      expect(result.financialMetrics).toHaveLength(2);
      expect(result.financialMetrics[0].metric).toBe('Revenue');
      expect(result.financialMetrics[1].value).toBe('$14.88B');
    });
  });

  describe('valid valuationData parsing', () => {
    it('parses well-formed valuation data', () => {
      const input = {
        valuationData: [
          { metric: 'P/E Ratio', currentValue: '65.2', historicalMedian: '40.1', peerComparison: 'Above sector avg of 28' },
          { metric: 'EV/EBITDA', currentValue: '55.3' },
        ],
      };
      const result = parseFinanceFields(input);
      expect(result.valuationData).toHaveLength(2);
      expect(result.valuationData[0].metric).toBe('P/E Ratio');
      expect(result.valuationData[1].currentValue).toBe('55.3');
    });
  });

  describe('valid riskFactors parsing', () => {
    it('parses well-formed risk factors', () => {
      const input = {
        riskFactors: [
          { factor: 'Supply chain concentration', type: 'risk', severity: 'high', description: 'TSMC dependency for chip manufacturing' },
          { factor: 'AI market expansion', type: 'opportunity', severity: 'medium', description: 'Growing demand for AI training hardware' },
        ],
      };
      const result = parseFinanceFields(input);
      expect(result.riskFactors).toHaveLength(2);
      expect(result.riskFactors[0].type).toBe('risk');
      expect(result.riskFactors[1].type).toBe('opportunity');
    });
  });

  describe('malformed/missing finance fields default to []', () => {
    it('returns empty arrays when fields are missing', () => {
      const result = parseFinanceFields({});
      expect(result.financialMetrics).toEqual([]);
      expect(result.valuationData).toEqual([]);
      expect(result.riskFactors).toEqual([]);
    });

    it('returns empty arrays when fields are null', () => {
      const result = parseFinanceFields({
        financialMetrics: null,
        valuationData: null,
        riskFactors: null,
      });
      expect(result.financialMetrics).toEqual([]);
      expect(result.valuationData).toEqual([]);
      expect(result.riskFactors).toEqual([]);
    });

    it('returns empty arrays when fields are not arrays', () => {
      const result = parseFinanceFields({
        financialMetrics: 'not an array',
        valuationData: 42,
        riskFactors: { factor: 'wrong shape' },
      });
      expect(result.financialMetrics).toEqual([]);
      expect(result.valuationData).toEqual([]);
      expect(result.riskFactors).toEqual([]);
    });

    it('filters out malformed entries within arrays', () => {
      const result = parseFinanceFields({
        financialMetrics: [
          { metric: 'Revenue', value: '$26B', period: 'Q3 2024', context: 'ok' },
          { metric: 'Bad', /* missing value */ },
          null,
        ],
        valuationData: [
          { metric: 'P/E', currentValue: '65' },
          { /* missing both */ },
        ],
        riskFactors: [
          { factor: 'Valid', type: 'risk', severity: 'high', description: 'desc' },
          { factor: 'Bad type', type: 'invalid', severity: 'high', description: 'desc' },
          { factor: 'Bad severity', type: 'risk', severity: 'extreme', description: 'desc' },
        ],
      });
      expect(result.financialMetrics).toHaveLength(1);
      expect(result.valuationData).toHaveLength(1);
      expect(result.riskFactors).toHaveLength(1);
    });
  });

  describe('non-finance queryType produces no finance fields', () => {
    it('returns empty arrays for non-finance queries (simulated by absent fields)', () => {
      // When queryType is not 'finance', the extract route won't ask for these fields
      // and the LLM won't produce them, so parsing empty object should return []
      const result = parseFinanceFields({});
      expect(result.financialMetrics).toEqual([]);
      expect(result.valuationData).toEqual([]);
      expect(result.riskFactors).toEqual([]);
    });
  });
});
