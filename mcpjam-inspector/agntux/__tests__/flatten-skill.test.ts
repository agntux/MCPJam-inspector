/**
 * Unit tests for agntux/host-emulator/lib/flatten-skill.js
 *
 * Covers: happy paths, edge cases, deterministic ordering.
 */

import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — plain JS module, no type declarations
import { flattenSkill } from '../host-emulator/lib/flatten-skill.js';

// ─── Happy paths ──────────────────────────────────────────────────────────────

describe('flattenSkill — happy paths', () => {
  it('returns SKILL.md unchanged when no agents are provided', () => {
    const skillMd = '---\nname: my-plugin\n---\n\n# My Plugin\nDo stuff.';
    const result = flattenSkill(skillMd, []);
    expect(result).toBe(skillMd.trimEnd());
  });

  it('appends preamble + agent sections when agents are provided', () => {
    const skillMd = '---\nname: my-plugin\n---\n\n# My Plugin';
    const agents = [
      { filename: 'orchestrator.md', content: '# Orchestrator\nRun things.' },
    ];
    const result = flattenSkill(skillMd, agents);

    expect(result).toContain('## Subagents available in test mode');
    expect(result).toContain(
      'The following subagents are available, presented in one combined context',
    );
    expect(result).toContain('### orchestrator');
    expect(result).toContain('# Orchestrator\nRun things.');
  });

  it('includes a horizontal rule separator between SKILL.md and agents', () => {
    const skillMd = '# Skill';
    const agents = [{ filename: 'a.md', content: 'Agent A' }];
    const result = flattenSkill(skillMd, agents);

    // The separator --- must appear between SKILL.md content and the preamble
    const hrIndex = result.indexOf('\n---\n');
    const skillIndex = result.indexOf('# Skill');
    const preambleIndex = result.indexOf('## Subagents available in test mode');
    expect(hrIndex).toBeGreaterThan(skillIndex);
    expect(hrIndex).toBeLessThan(preambleIndex);
  });

  it('strips .md extension from agent filename in section heading', () => {
    const result = flattenSkill('# Skill', [
      { filename: 'retrieval-agent.md', content: 'Retrieval content.' },
    ]);
    expect(result).toContain('### retrieval-agent');
    expect(result).not.toContain('### retrieval-agent.md');
  });

  it('handles agent with no .md extension gracefully', () => {
    const result = flattenSkill('# Skill', [
      { filename: 'special', content: 'Special content.' },
    ]);
    expect(result).toContain('### special');
  });
});

// ─── Deterministic ordering ───────────────────────────────────────────────────

describe('flattenSkill — deterministic alphabetical ordering', () => {
  it('sorts agents alphabetically by filename regardless of input order', () => {
    const agents = [
      { filename: 'z-last.md', content: 'Z content' },
      { filename: 'a-first.md', content: 'A content' },
      { filename: 'm-middle.md', content: 'M content' },
    ];
    const result = flattenSkill('# Skill', agents);

    const aIdx = result.indexOf('### a-first');
    const mIdx = result.indexOf('### m-middle');
    const zIdx = result.indexOf('### z-last');

    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });

  it('produces identical output regardless of input array order', () => {
    const agents1 = [
      { filename: 'b.md', content: 'B' },
      { filename: 'a.md', content: 'A' },
    ];
    const agents2 = [
      { filename: 'a.md', content: 'A' },
      { filename: 'b.md', content: 'B' },
    ];
    expect(flattenSkill('# Skill', agents1)).toBe(flattenSkill('# Skill', agents2));
  });

  it('is case-insensitive for sort order', () => {
    const agents = [
      { filename: 'B-upper.md', content: 'B' },
      { filename: 'a-lower.md', content: 'A' },
    ];
    const result = flattenSkill('# Skill', agents);
    const aIdx = result.indexOf('### a-lower');
    const bIdx = result.indexOf('### B-upper');
    expect(aIdx).toBeLessThan(bIdx);
  });
});

// ─── Multiple agents ──────────────────────────────────────────────────────────

describe('flattenSkill — multiple agents', () => {
  it('includes all agents in the flattened output', () => {
    const agents = [
      { filename: 'alpha.md', content: 'Alpha content' },
      { filename: 'beta.md', content: 'Beta content' },
      { filename: 'gamma.md', content: 'Gamma content' },
    ];
    const result = flattenSkill('# Skill', agents);

    expect(result).toContain('### alpha');
    expect(result).toContain('Alpha content');
    expect(result).toContain('### beta');
    expect(result).toContain('Beta content');
    expect(result).toContain('### gamma');
    expect(result).toContain('Gamma content');
  });

  it('preamble appears only once even with many agents', () => {
    const agents = Array.from({ length: 5 }, (_, i) => ({
      filename: `agent-${i}.md`,
      content: `Content ${i}`,
    }));
    const result = flattenSkill('# Skill', agents);
    const count = (result.match(/## Subagents available in test mode/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('flattenSkill — edge cases', () => {
  it('handles empty SKILL.md string', () => {
    const result = flattenSkill('', []);
    expect(typeof result).toBe('string');
  });

  it('handles agent with empty content', () => {
    const result = flattenSkill('# Skill', [{ filename: 'empty.md', content: '' }]);
    expect(result).toContain('### empty');
  });

  it('trims trailing whitespace from SKILL.md', () => {
    const result = flattenSkill('# Skill   \n\n\n', []);
    expect(result).toBe('# Skill');
  });

  it('trims trailing whitespace from agent content block', () => {
    const result = flattenSkill('# Skill', [
      { filename: 'a.md', content: 'Content  \n\n  ' },
    ]);
    // The agent content itself is trimEnd()'d so it becomes "Content".
    // Verify the raw trailing spaces/newlines are gone from the content section.
    expect(result).not.toContain('Content  \n');
    expect(result).not.toContain('Content  ');
  });

  it('does not mutate the input agents array', () => {
    const agents = [
      { filename: 'z.md', content: 'Z' },
      { filename: 'a.md', content: 'A' },
    ];
    const original = [...agents];
    flattenSkill('# Skill', agents);
    expect(agents[0].filename).toBe(original[0].filename);
    expect(agents[1].filename).toBe(original[1].filename);
  });
});

// ─── Type validation ──────────────────────────────────────────────────────────

describe('flattenSkill — type validation', () => {
  it('throws TypeError when skillMd is not a string', () => {
    expect(() => flattenSkill(null as unknown as string, [])).toThrow(TypeError);
    expect(() => flattenSkill(42 as unknown as string, [])).toThrow(TypeError);
  });

  it('throws TypeError when agents is not an array', () => {
    expect(() => flattenSkill('# Skill', null as unknown as [])).toThrow(TypeError);
    expect(() => flattenSkill('# Skill', 'bad' as unknown as [])).toThrow(TypeError);
  });

  it('throws TypeError when an agent entry lacks string filename', () => {
    expect(() =>
      flattenSkill('# Skill', [{ filename: 42 as unknown as string, content: 'ok' }]),
    ).toThrow(TypeError);
  });

  it('throws TypeError when an agent entry lacks string content', () => {
    expect(() =>
      flattenSkill('# Skill', [{ filename: 'ok.md', content: null as unknown as string }]),
    ).toThrow(TypeError);
  });
});
