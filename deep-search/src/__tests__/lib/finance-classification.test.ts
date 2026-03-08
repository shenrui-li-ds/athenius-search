import { detectFinanceSubType } from '@/lib/prompts';

describe('detectFinanceSubType', () => {
  describe('stock_analysis detection', () => {
    it('detects ticker + investment keyword', () => {
      expect(detectFinanceSubType('NVDA stock analysis')).toBe('stock_analysis');
      expect(detectFinanceSubType('should I invest in AAPL')).toBe('stock_analysis');
      expect(detectFinanceSubType('TSLA buy or sell')).toBe('stock_analysis');
    });

    it('detects stock keywords without ticker', () => {
      expect(detectFinanceSubType('Tesla stock analysis')).toBe('stock_analysis');
      expect(detectFinanceSubType('dividend stocks for income')).toBe('stock_analysis');
      expect(detectFinanceSubType('best stocks with high earnings growth')).toBe('stock_analysis');
      expect(detectFinanceSubType('P/E ratio comparison tech companies')).toBe('stock_analysis');
      expect(detectFinanceSubType('EPS growth rate comparison')).toBe('stock_analysis');
      expect(detectFinanceSubType('market cap comparison big tech')).toBe('stock_analysis');
    });

    it('does NOT match ticker-like words without investment context', () => {
      // "NASA" looks like a ticker but lacks investment keywords
      expect(detectFinanceSubType('NASA space exploration')).not.toBe('stock_analysis');
      expect(detectFinanceSubType('COVID impact on healthcare')).not.toBe('stock_analysis');
    });
  });

  describe('macro detection', () => {
    it('detects macro queries', () => {
      expect(detectFinanceSubType('2025 recession outlook')).toBe('macro');
      expect(detectFinanceSubType('inflation impact on markets')).toBe('macro');
      expect(detectFinanceSubType('GDP growth forecast')).toBe('macro');
      expect(detectFinanceSubType('Fed interest rate decision')).toBe('macro');
      expect(detectFinanceSubType('monetary policy tightening')).toBe('macro');
      expect(detectFinanceSubType('yield curve inversion')).toBe('macro');
      expect(detectFinanceSubType('US economy outlook 2025')).toBe('macro');
    });
  });

  describe('personal_finance detection', () => {
    it('detects personal finance queries', () => {
      expect(detectFinanceSubType('best retirement savings strategy')).toBe('personal_finance');
      expect(detectFinanceSubType('how to budget effectively')).toBe('personal_finance');
      expect(detectFinanceSubType('401k vs IRA comparison')).toBe('personal_finance');
      expect(detectFinanceSubType('paying off mortgage early')).toBe('personal_finance');
      expect(detectFinanceSubType('improve credit score')).toBe('personal_finance');
      expect(detectFinanceSubType('Roth IRA contribution limits')).toBe('personal_finance');
      expect(detectFinanceSubType('tax deductions for freelancers')).toBe('personal_finance');
    });
  });

  describe('crypto detection', () => {
    it('detects crypto queries', () => {
      expect(detectFinanceSubType('Bitcoin ETF analysis')).toBe('crypto');
      expect(detectFinanceSubType('Ethereum staking rewards')).toBe('crypto');
      expect(detectFinanceSubType('DeFi yield farming risks')).toBe('crypto');
      expect(detectFinanceSubType('blockchain technology overview')).toBe('crypto');
      expect(detectFinanceSubType('BTC price prediction 2025')).toBe('crypto');
      expect(detectFinanceSubType('Web3 investment opportunities')).toBe('crypto');
    });
  });

  describe('general_finance fallback', () => {
    it('falls back for ambiguous finance queries', () => {
      expect(detectFinanceSubType('financial planning guide')).toBe('general_finance');
      expect(detectFinanceSubType('how to read financial statements')).toBe('general_finance');
      expect(detectFinanceSubType('best investment apps')).toBe('general_finance');
    });
  });

  describe('performance', () => {
    it('completes in under 1ms', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        detectFinanceSubType('NVIDIA stock analysis 2025');
      }
      const elapsed = (performance.now() - start) / 1000; // per call
      expect(elapsed).toBeLessThan(1);
    });
  });
});
