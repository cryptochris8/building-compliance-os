import { describe, it, expect } from 'vitest';
import {
  glossaryTerms,
  getGlossaryTerm,
  groupTermsByCategory,
  glossaryCategoryLabels,
} from '../terms';

describe('glossaryTerms', () => {
  it('has entries for every core compliance term', () => {
    const ids = new Set(glossaryTerms.map((t) => t.id));
    for (const required of ['tco2e', 'll97', 'berdo', 'rec', 'bbl', 'bin', 'gross-sqft']) {
      expect(ids, `missing term ${required}`).toContain(required);
    }
  });

  it('all entries have non-empty label and definition', () => {
    for (const term of glossaryTerms) {
      expect(term.label.length, `${term.id} missing label`).toBeGreaterThan(0);
      expect(term.definition.length, `${term.id} missing definition`).toBeGreaterThan(20);
    }
  });

  it('all entries have a known category', () => {
    const validCategories = Object.keys(glossaryCategoryLabels);
    for (const term of glossaryTerms) {
      expect(validCategories).toContain(term.category);
    }
  });

  it('term ids are unique', () => {
    const ids = glossaryTerms.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getGlossaryTerm', () => {
  it('returns the term for a known id', () => {
    const term = getGlossaryTerm('tco2e');
    expect(term).toBeDefined();
    expect(term?.label).toBe('tCO₂e');
  });

  it('returns undefined for an unknown id', () => {
    expect(getGlossaryTerm('not-a-term')).toBeUndefined();
  });
});

describe('groupTermsByCategory', () => {
  it('returns groups in the canonical display order', () => {
    const groups = groupTermsByCategory();
    expect(groups.map((g) => g.category)).toEqual([
      'regulations',
      'metrics',
      'identifiers',
      'statuses',
      'concepts',
    ]);
  });

  it('partitions every term into its declared category', () => {
    const groups = groupTermsByCategory();
    const totalGrouped = groups.reduce((sum, g) => sum + g.terms.length, 0);
    expect(totalGrouped).toBe(glossaryTerms.length);
  });

  it('every group uses its human-readable label', () => {
    const groups = groupTermsByCategory();
    for (const group of groups) {
      expect(group.label).toBe(glossaryCategoryLabels[group.category]);
    }
  });
});
