import {
  refineSearchQueryPrompt,
  summarizeSearchResultsPrompt,
  proofreadContentPrompt,
  proofreadParagraphPrompt,
  researchPlannerPrompt,
  researchSynthesizerPrompt,
  deepResearchSynthesizerPrompt,
  aspectExtractorPrompt,
  gapAnalyzerPrompt,
  researchProofreadPrompt,
  brainstormReframePrompt,
  brainstormSynthesizerPrompt,
  generateRelatedSearchesPrompt,
} from '@/lib/prompts';

describe('Prompts', () => {
  describe('refineSearchQueryPrompt', () => {
    it('includes the search term', () => {
      const prompt = refineSearchQueryPrompt('test query', 'December 27, 2024');
      expect(prompt).toContain('test query');
    });

    it('includes the current date', () => {
      const prompt = refineSearchQueryPrompt('test query', 'December 27, 2024');
      expect(prompt).toContain('December 27, 2024');
    });

    it('has proper XML structure', () => {
      const prompt = refineSearchQueryPrompt('test', 'date');
      expect(prompt).toContain('<refineSearchQuery>');
      expect(prompt).toContain('</refineSearchQuery>');
      expect(prompt).toContain('<rules>');
      expect(prompt).toContain('<examples>');
    });

    it('specifies JSON output format with intent and query', () => {
      const prompt = refineSearchQueryPrompt('test', 'date');
      expect(prompt).toContain('JSON object');
      expect(prompt).toContain('"intent"');
      expect(prompt).toContain('"query"');
      expect(prompt).toContain('{"intent": "...", "query": "..."}');
    });

    it('includes examples with intent field', () => {
      const prompt = refineSearchQueryPrompt('test', 'date');
      expect(prompt).toContain('<intent>');
      expect(prompt).toContain('</intent>');
      expect(prompt).toContain('Looking up');
      expect(prompt).toContain('Searching for');
    });
  });

  describe('summarizeSearchResultsPrompt', () => {
    it('includes the query', () => {
      const prompt = summarizeSearchResultsPrompt('quantum computing', 'December 27, 2024');
      expect(prompt).toContain('quantum computing');
    });

    it('includes citation format rules', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('[1]');
      expect(prompt).toContain('[2]');
      expect(prompt).toContain('citationFormat');
    });

    it('specifies comma-separated format for multiple citations', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('[1, 2]');
      expect(prompt).toContain('COMMA-SEPARATED');
      expect(prompt).toContain('DO NOT use adjacent brackets like [1][2]');
    });

    it('has proper XML structure', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<summarizeSearchResults>');
      expect(prompt).toContain('</summarizeSearchResults>');
    });

    it('includes responseLanguage field in context', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date', 'English');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes critical language requirement section', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date', 'Chinese');
      expect(prompt).toContain('<CRITICAL_LANGUAGE_REQUIREMENT>');
      expect(prompt).toContain('You MUST write your ENTIRE response in Chinese');
      expect(prompt).toContain('DO NOT mix languages');
    });

    it('uses provided language parameter in enforcement', () => {
      const englishPrompt = summarizeSearchResultsPrompt('test', 'date', 'English');
      expect(englishPrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: English');

      const chinesePrompt = summarizeSearchResultsPrompt('test', 'date', 'Chinese');
      expect(chinesePrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: Chinese');
    });

    it('defaults to English when language not specified', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes LaTeX math instructions for STEM topics', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('<mathAndScience>');
      expect(prompt).toContain('LaTeX notation');
      expect(prompt).toContain('$E = mc^2$');
      expect(prompt).toContain('$$');
    });

    it('provides LaTeX syntax examples', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');
      expect(prompt).toContain('\\frac{');
      expect(prompt).toContain('\\sqrt{');
      expect(prompt).toContain('\\int');
      expect(prompt).toContain('\\sum');
    });
  });

  describe('proofreadContentPrompt', () => {
    it('includes proofreading tasks', () => {
      const prompt = proofreadContentPrompt();
      expect(prompt).toContain('Fix any grammar or spelling errors');
      expect(prompt).toContain('Fix broken markdown formatting');
      expect(prompt).toContain('Remove any gibberish');
    });

    it('includes preserve rules', () => {
      const prompt = proofreadContentPrompt();
      expect(prompt).toContain('Keep all factual content');
      expect(prompt).toContain('Do NOT add new information');
    });

    it('has proper XML structure', () => {
      const prompt = proofreadContentPrompt();
      expect(prompt).toContain('<proofreadContent>');
      expect(prompt).toContain('</proofreadContent>');
    });
  });

  describe('proofreadParagraphPrompt', () => {
    it('includes quick fixes', () => {
      const prompt = proofreadParagraphPrompt();
      expect(prompt).toContain('Grammar and spelling errors');
      expect(prompt).toContain('Broken markdown');
    });

    it('has proper XML structure', () => {
      const prompt = proofreadParagraphPrompt();
      expect(prompt).toContain('<proofreadParagraph>');
      expect(prompt).toContain('</proofreadParagraph>');
    });
  });

  describe('researchPlannerPrompt', () => {
    it('includes the research topic', () => {
      const prompt = researchPlannerPrompt('machine learning', 'December 27, 2024');
      expect(prompt).toContain('machine learning');
    });

    it('includes the current date', () => {
      const prompt = researchPlannerPrompt('test', 'December 27, 2024');
      expect(prompt).toContain('December 27, 2024');
    });

    it('specifies output format as JSON array', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"aspect"');
      expect(prompt).toContain('"query"');
    });

    it('limits to 3-4 search queries', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('3-4 distinct search queries');
    });

    it('has proper XML structure', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('<researchPlanner>');
      expect(prompt).toContain('</researchPlanner>');
      expect(prompt).toContain('<task>');
      expect(prompt).toContain('<rules>');
      expect(prompt).toContain('<examples>');
    });

    it('includes language preservation rule', () => {
      const prompt = researchPlannerPrompt('test', 'date');
      expect(prompt).toContain('PRESERVE the original language');
    });
  });

  describe('researchSynthesizerPrompt', () => {
    it('includes the research topic', () => {
      const prompt = researchSynthesizerPrompt('quantum computing', 'December 27, 2024');
      expect(prompt).toContain('quantum computing');
    });

    it('includes the current date', () => {
      const prompt = researchSynthesizerPrompt('test', 'December 27, 2024');
      expect(prompt).toContain('December 27, 2024');
    });

    it('specifies comprehensive depth requirements', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Explain concepts thoroughly');
      expect(prompt).toContain('4-6 sentences');
      expect(prompt).toContain('multiple perspectives');
    });

    it('includes synthesis requirements', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Connect related claims across different aspects');
      expect(prompt).toContain('full picture');
      expect(prompt).toContain('keyInsights');
    });

    it('specifies target word count', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('800-1000 words');
    });

    it('includes citation format rules', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1], [2], [3] format');
      expect(prompt).toContain('citationRules');
    });

    it('specifies comma-separated format for multiple citations', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1, 2]');
      expect(prompt).toContain('NOT adjacent brackets [1][2]');
    });

    it('has proper XML structure', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<researchSynthesizer>');
      expect(prompt).toContain('</researchSynthesizer>');
      expect(prompt).toContain('<requirements>');
      expect(prompt).toContain('<structure>');
      expect(prompt).toContain('<formatting>');
    });

    it('includes Key Takeaways section requirement', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Key Takeaways');
      expect(prompt).toContain('5-7 bullet points');
    });

    it('includes responseLanguage field in context', () => {
      const prompt = researchSynthesizerPrompt('test', 'date', 'English');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes critical language requirement section', () => {
      const prompt = researchSynthesizerPrompt('test', 'date', 'Chinese');
      expect(prompt).toContain('<CRITICAL_LANGUAGE_REQUIREMENT>');
      expect(prompt).toContain('You MUST write your ENTIRE response in Chinese');
      expect(prompt).toContain('DO NOT mix languages');
    });

    it('uses provided language parameter in enforcement', () => {
      const englishPrompt = researchSynthesizerPrompt('test', 'date', 'English');
      expect(englishPrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: English');

      const japanesePrompt = researchSynthesizerPrompt('test', 'date', 'Japanese');
      expect(japanesePrompt).toContain('Your response language is determined ONLY by the responseLanguage field above: Japanese');
    });

    it('defaults to English when language not specified', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });

    it('includes LaTeX math instructions for STEM topics', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<mathAndScience>');
      expect(prompt).toContain('LaTeX notation');
      expect(prompt).toContain('$E = mc^2$');
      expect(prompt).toContain('$$');
    });

    it('provides LaTeX syntax examples', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('\\frac{');
      expect(prompt).toContain('\\sqrt{');
      expect(prompt).toContain('\\int');
      expect(prompt).toContain('\\sum');
    });
  });

  describe('researchProofreadPrompt', () => {
    it('is minimal and focuses only on typos and grammar', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('minimal copy editor');
      expect(prompt).toContain('fix typos and obvious grammar errors');
    });

    it('includes allowed edits', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<allowedEdits>');
      expect(prompt).toContain('Fix spelling mistakes');
      expect(prompt).toContain('Fix obvious grammar errors');
      expect(prompt).toContain('Fix punctuation errors');
    });

    it('includes strict prohibitions against content changes', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<strictProhibitions>');
      expect(prompt).toContain('Do NOT rephrase or reword');
      expect(prompt).toContain('Do NOT restructure');
      expect(prompt).toContain('Do NOT remove ANY content');
      expect(prompt).toContain('Do NOT shorten or condense');
    });

    it('includes length requirement', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<lengthRequirement>');
      expect(prompt).toContain('at least 95% of the input length');
    });

    it('has proper XML structure', () => {
      const prompt = researchProofreadPrompt();
      expect(prompt).toContain('<researchProofread>');
      expect(prompt).toContain('</researchProofread>');
    });
  });

  describe('generateRelatedSearchesPrompt', () => {
    it('includes the original query', () => {
      const prompt = generateRelatedSearchesPrompt('machine learning', 'AI, neural networks');
      expect(prompt).toContain('machine learning');
    });

    it('includes key topics', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topic1, topic2');
      expect(prompt).toContain('topic1, topic2');
    });

    it('specifies diversity requirements', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topics');
      expect(prompt).toContain('deeper');
      expect(prompt).toContain('related');
      expect(prompt).toContain('comparison');
      expect(prompt).toContain('practical');
    });

    it('includes language preservation rule', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topics');
      expect(prompt).toContain('PRESERVE the language');
    });

    it('has proper XML structure', () => {
      const prompt = generateRelatedSearchesPrompt('test', 'topics');
      expect(prompt).toContain('<generateRelatedSearches>');
      expect(prompt).toContain('</generateRelatedSearches>');
      expect(prompt).toContain('<diversityRequirements>');
      expect(prompt).toContain('<examples>');
    });
  });

  describe('brainstormReframePrompt', () => {
    it('includes the topic', () => {
      const prompt = brainstormReframePrompt('remote meetings', 'December 31, 2024');
      expect(prompt).toContain('remote meetings');
    });

    it('includes the current date', () => {
      const prompt = brainstormReframePrompt('test', 'December 31, 2024');
      expect(prompt).toContain('December 31, 2024');
    });

    it('specifies lateral thinking approaches', () => {
      const prompt = brainstormReframePrompt('test', 'date');
      expect(prompt).toContain('lateral thinking');
      expect(prompt).toContain('cross-domain');
      expect(prompt).toContain('contrarian');
    });

    it('specifies output format as JSON array', () => {
      const prompt = brainstormReframePrompt('test', 'date');
      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"angle"');
      expect(prompt).toContain('"query"');
    });

    it('has proper XML structure', () => {
      const prompt = brainstormReframePrompt('test', 'date');
      expect(prompt).toContain('<brainstormReframe>');
      expect(prompt).toContain('</brainstormReframe>');
      expect(prompt).toContain('<creativePrinciples>');
    });
  });

  describe('brainstormSynthesizerPrompt', () => {
    it('includes the original challenge', () => {
      const prompt = brainstormSynthesizerPrompt('improve team productivity', 'December 31, 2024');
      expect(prompt).toContain('improve team productivity');
    });

    it('includes the current date', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'December 31, 2024');
      expect(prompt).toContain('December 31, 2024');
    });

    it('specifies creative mindset principles', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('Yes, and...');
      expect(prompt).toContain('novelty');
      expect(prompt).toContain('actionable');
    });

    it('includes citation format rules', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1], [2]');
      expect(prompt).toContain('citationRules');
    });

    it('specifies comma-separated format for multiple citations', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('[1, 2]');
      expect(prompt).toContain('NOT adjacent brackets [1][2]');
    });

    it('includes output structure with idea cards', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('idea cards');
      expect(prompt).toContain('Unexpected Connections');
      expect(prompt).toContain('experiments');
    });

    it('has proper XML structure', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<brainstormSynthesizer>');
      expect(prompt).toContain('</brainstormSynthesizer>');
      expect(prompt).toContain('<outputStructure>');
      expect(prompt).toContain('<toneGuidelines>');
    });

    it('includes language requirement', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date', 'Spanish');
      expect(prompt).toContain('<responseLanguage>Spanish</responseLanguage>');
      expect(prompt).toContain('CRITICAL_LANGUAGE_REQUIREMENT');
    });

    it('defaults to English when language not specified', () => {
      const prompt = brainstormSynthesizerPrompt('test', 'date');
      expect(prompt).toContain('<responseLanguage>English</responseLanguage>');
    });
  });

  describe('adversarial evidence analysis prompts', () => {
    describe('summarizeSearchResultsPrompt — evidenceAnalysis', () => {
      const prompt = summarizeSearchResultsPrompt('test', 'date');

      it('includes evidenceAnalysis section', () => {
        expect(prompt).toContain('<evidenceAnalysis>');
        expect(prompt).toContain('</evidenceAnalysis>');
      });

      it('instructs multi-source claims as established fact', () => {
        expect(prompt).toContain('multiple sources independently confirm');
        expect(prompt).toContain('established fact with combined citations');
      });

      it('instructs single-source attribution', () => {
        expect(prompt).toContain('only one source supports a significant claim');
        expect(prompt).toContain('According to [Source Name]');
      });

      it('instructs both-sides conflict handling', () => {
        expect(prompt).toContain('While [1] reports X, [2] argues Y');
        expect(prompt).toContain('do not silently pick a side');
      });

      it('distinguishes data-backed from opinion-based claims', () => {
        expect(prompt).toContain('data-backed claims');
        expect(prompt).toContain('opinion-based claims');
      });

      it('replaced vague conflict instruction with specific one', () => {
        expect(prompt).not.toContain('If information is uncertain or conflicting, acknowledge this clearly');
        expect(prompt).toContain('present both positions with their respective citations rather than picking one side');
      });

      it('evidenceAnalysis appears between requirements and formatting', () => {
        const reqEnd = prompt.indexOf('</requirements>');
        const evidenceStart = prompt.indexOf('<evidenceAnalysis>');
        const fmtStart = prompt.indexOf('<formatting>');
        expect(evidenceStart).toBeGreaterThan(reqEnd);
        expect(evidenceStart).toBeLessThan(fmtStart);
      });
    });

    describe('aspectExtractorPrompt — confidenceCriteria + evidenceTypes', () => {
      const prompt = aspectExtractorPrompt('fundamentals', 'test query');

      it('includes confidenceCriteria section', () => {
        expect(prompt).toContain('<confidenceCriteria>');
        expect(prompt).toContain('</confidenceCriteria>');
      });

      it('defines all three confidence levels with countable heuristics', () => {
        expect(prompt).toContain('name="established"');
        expect(prompt).toContain('2 or more sources that agree');
        expect(prompt).toContain('name="emerging"');
        expect(prompt).toContain('only 1 source');
        expect(prompt).toContain('name="contested"');
        expect(prompt).toContain('Sources directly disagree');
      });

      it('includes evidenceTypes section', () => {
        expect(prompt).toContain('<evidenceTypes>');
        expect(prompt).toContain('</evidenceTypes>');
      });

      it('defines all four evidence types', () => {
        expect(prompt).toContain('name="data"');
        expect(prompt).toContain('specific numbers, statistics, dates');
        expect(prompt).toContain('name="study"');
        expect(prompt).toContain('named study, paper, survey');
        expect(prompt).toContain('name="expert_opinion"');
        expect(prompt).toContain('named person or organization');
        expect(prompt).toContain('name="anecdotal"');
        expect(prompt).toContain('general assertion');
      });

      it('includes evidenceType in claims output schema', () => {
        expect(prompt).toContain('"evidenceType": "data|study|expert_opinion|anecdotal"');
      });

      it('confidenceCriteria appears after extractionRules', () => {
        const rulesEnd = prompt.indexOf('</extractionRules>');
        const criteriaStart = prompt.indexOf('<confidenceCriteria>');
        expect(criteriaStart).toBeGreaterThan(rulesEnd);
      });
    });

    describe('researchSynthesizerPrompt — evidenceEvaluation', () => {
      const prompt = researchSynthesizerPrompt('test', 'date');

      it('includes evidenceEvaluation section', () => {
        expect(prompt).toContain('<evidenceEvaluation>');
        expect(prompt).toContain('</evidenceEvaluation>');
      });

      it('does not contain old confidenceHandling section', () => {
        expect(prompt).not.toContain('<confidenceHandling>');
        expect(prompt).not.toContain('</confidenceHandling>');
      });

      it('includes all 6 evidence evaluation principles', () => {
        expect(prompt).toContain('2+ sources agree');
        expect(prompt).toContain('According to [source]');
        expect(prompt).toContain('strongest evidence on each side');
        expect(prompt).toContain('rests on a single source');
        expect(prompt).toContain('Weight evidence by type');
        expect(prompt).toContain('similar perspective');
      });
    });

    describe('deepResearchSynthesizerPrompt — evidenceEvaluation + gapResolution', () => {
      const prompt = deepResearchSynthesizerPrompt('test', 'date', 'English', ['gap1']);

      it('includes evidenceEvaluation section', () => {
        expect(prompt).toContain('<evidenceEvaluation>');
        expect(prompt).toContain('</evidenceEvaluation>');
      });

      it('does not contain old confidenceHandling section', () => {
        expect(prompt).not.toContain('<confidenceHandling>');
        expect(prompt).not.toContain('</confidenceHandling>');
      });

      it('includes gapResolution section', () => {
        expect(prompt).toContain('<gapResolution>');
        expect(prompt).toContain('</gapResolution>');
      });

      it('gapResolution assesses whether gaps are genuinely resolved', () => {
        expect(prompt).toContain('genuinely resolves it or leaves it partially open');
      });

      it('gapResolution handles R1 vs R2 contradictions', () => {
        expect(prompt).toContain('Round 2 evidence contradicts Round 1 findings');
        expect(prompt).toContain('stronger evidence rather than silently preferring the newer data');
      });

      it('gapResolution acknowledges unresolved gaps', () => {
        expect(prompt).toContain('briefly acknowledge the limitation rather than omitting the topic entirely');
      });

      it('has same 6 evidenceEvaluation principles as research synthesizer', () => {
        const researchPrompt = researchSynthesizerPrompt('test', 'date');
        const deepPrompt = deepResearchSynthesizerPrompt('test', 'date');

        // Extract evidenceEvaluation content from both
        const extractEvidenceEval = (p: string) => {
          const start = p.indexOf('<evidenceEvaluation>');
          const end = p.indexOf('</evidenceEvaluation>') + '</evidenceEvaluation>'.length;
          return p.slice(start, end);
        };

        expect(extractEvidenceEval(deepPrompt)).toBe(extractEvidenceEval(researchPrompt));
      });
    });

    describe('gapAnalyzerPrompt — contradicted_claim', () => {
      const prompt = gapAnalyzerPrompt('test query', 'extracted data', 'English');

      it('includes contradicted_claim gap type', () => {
        expect(prompt).toContain('contradicted_claim');
      });

      it('defines contradicted_claim as sources directly conflicting', () => {
        expect(prompt).toContain('sources directly conflict');
        expect(prompt).toContain('authoritative resolution');
      });

      it('includes prioritization rule for contradictions', () => {
        expect(prompt).toContain('contradictions on significant claims');
        expect(prompt).toContain('prioritize generating a "contradicted_claim" gap');
        expect(prompt).toContain('authoritative or primary sources');
      });

      it('preserves existing gap types', () => {
        expect(prompt).toContain('missing_perspective');
        expect(prompt).toContain('needs_verification');
        expect(prompt).toContain('missing_practical');
        expect(prompt).toContain('needs_recency');
        expect(prompt).toContain('missing_comparison');
        expect(prompt).toContain('missing_expert');
      });
    });
  });
});
