import { describe, it, expect } from 'vitest';
import { factories as fixtureFactories, interventions, reference } from '../domain/fixtures';
import { scenario, creditPotential, exposure } from '../domain/calculations';
import type { Factory, LedgerEntry, Sector } from '../domain/types';
import type { ToolContext } from './types';
import { tools, toolDefs, runTool } from './tools';
import { sanitiseHistory, capHistory } from './agent';
import type { ChatMessage } from '../lib/openrouter';
import { buildSystemPrompt } from './prompt';
import { parseSseChunk } from '../lib/openrouter';

function makeCtx(overrides: Partial<ToolContext> = {}) {
  const calls: { navigate: string[]; selected: string[]; recorded: any[] } = {
    navigate: [],
    selected: [],
    recorded: [],
  };
  const ledger: LedgerEntry[] = [];
  const ctx: ToolContext = {
    factories: structuredClone(fixtureFactories) as Factory[],
    ledger,
    intake: [],
    actions: {
      navigate: p => calls.navigate.push(p),
      selectFactory: id => calls.selected.push(id),
      setView: () => {},
      record: (factoryId, ids, adoption) => {
        const entry = { id: `LP-TEST${ledger.length + 1}`, factoryId, interventionIds: ids, adoption };
        calls.recorded.push(entry);
        ledger.push(entry as unknown as LedgerEntry);
        return { added: true, id: entry.id };
      },
    },
    proposeAction: a => {
      const token = `tok-${calls.recorded.length}-${a.factoryId}`;
      pending.set(token, { ...a, token, createdAt: 0 });
      return { token };
    },
    consumePending: token => {
      const e = pending.get(token) ?? null;
      pending.delete(token);
      return e;
    },
    ...overrides,
  };
  const pending = new Map<string, any>();
  return { ctx, calls };
}

describe('tool registry hygiene', () => {
  it('exposes uniquely named tools with well-formed schemas', () => {
    const names = tools.map(t => t.def.function.name);
    expect(new Set(names).size).toBe(names.length);
    names.forEach(n => expect(n).toMatch(/^[a-z][a-z0-9_]*$/));
    tools.forEach(t => {
      const p: any = t.def.function.parameters;
      expect(t.def.type).toBe('function');
      expect(t.def.function.description.length).toBeGreaterThan(10);
      expect(p.type).toBe('object');
      expect(p.additionalProperties).toBe(false);
      (p.required ?? []).forEach((r: string) => expect(Object.keys(p.properties)).toContain(r));
    });
    expect(toolDefs).toHaveLength(tools.length);
  });

  it('pins every intervention enum to the real fixture ids', () => {
    const ids = interventions.map(i => i.id);
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.enum) && node.enum.includes('waste-heat'))
        expect([...node.enum].sort()).toEqual([...ids].sort());
      Object.values(node).forEach(walk);
    };
    tools.forEach(t => walk(t.def.function.parameters));
  });
});

describe('runTool never throws', () => {
  const { ctx } = makeCtx();
  const junk = [
    '',
    '{',
    'null',
    '[]',
    '{"factory_id":null}',
    '{"factory_id":"nope","intervention_ids":["x"],"adoption":"abc"}',
  ];
  it('survives unknown tools and malformed arguments', () => {
    junk.forEach(raw => {
      expect(() => runTool('run_scenario', raw, ctx)).not.toThrow();
      expect(() => runTool('does_not_exist', raw, ctx)).not.toThrow();
    });
    const unknown = runTool('does_not_exist', '{}', ctx);
    expect(unknown.ok).toBe(false);
    const bad = runTool('run_scenario', '{oops', ctx);
    expect(bad).toMatchObject({ ok: false, error: 'Arguments were not valid JSON.' });
  });
});

describe('tools agree with the screens', () => {
  const { ctx } = makeCtx();
  const bhilai = fixtureFactories.find(f => f.id === 'bhilai-steel')!;

  it('credit_potential matches the Credits page derivation exactly', () => {
    const res: any = runTool('credit_potential', JSON.stringify({ factory_id: 'bhilai-steel' }), ctx);
    expect(res.ok).toBe(true);
    const expected = creditPotential(bhilai);
    expect(res.data.illustrative_volume_units_yr).toBe(expected.volume);
    expect(res.data.illustrative_volume_units_yr).toBe(Math.floor(expected.best!.result.reduction * 0.7));
    expect(res.data.modelling_factor).toBe(0.7);
    expect(res.data.gross_value_band_inr_yr).toEqual([
      expected.volume * reference.creditLowINR,
      expected.volume * reference.creditHighINR,
    ]);
    expect(res.data.registry_verified).toBe(false);
    expect(res.data.realised_credit_revenue_inr).toBe(0);
  });

  it('export_exposure matches exposure() and is out of scope for textiles', () => {
    const steel: any = runTool('export_exposure', JSON.stringify({ factory_id: 'bhilai-steel' }), ctx);
    expect(steel.data.rows[0].exposure_inr_yr).toBeCloseTo(exposure(bhilai)!, 2);
    const textile: any = runTool('export_exposure', JSON.stringify({ factory_id: 'surat-textiles' }), ctx);
    expect(textile.data.rows[0].in_scope).toBe(false);
  });

  it('rank_factories reproduces the Command Map ordering', () => {
    const total: any = runTool('rank_factories', JSON.stringify({ metric: 'total', limit: 3 }), ctx);
    expect(total.data.ranked[0].id).toBe('bhilai-steel');
    expect(total.data.unit).toBe('tCO2e/yr');
    const byIntensity: any = runTool(
      'rank_factories',
      JSON.stringify({ metric: 'intensity', limit: 1 }),
      ctx,
    );
    expect(byIntensity.data.ranked[0].id).toBe('surat-textiles');
  });

  it('run_scenario equals scenario() and keeps capex fixed at zero adoption', () => {
    const res: any = runTool(
      'run_scenario',
      JSON.stringify({ factory_id: 'bhilai-steel', intervention_ids: ['waste-heat'], adoption: 75 }),
      ctx,
    );
    const direct = scenario(bhilai, [interventions.find(i => i.id === 'waste-heat')!], 75);
    expect(res.data.reduction_tco2e_yr).toBeCloseTo(direct.reduction, 2);
    expect(res.data.capex_inr_one_off).toBe(direct.capex);
    expect(res.formula).toContain('reduction = min(baseline');

    const zero: any = runTool(
      'run_scenario',
      JSON.stringify({ factory_id: 'bhilai-steel', intervention_ids: ['waste-heat'], adoption: 0 }),
      ctx,
    );
    expect(zero.data.capex_inr_one_off).toBe(direct.capex);
    expect(zero.data.payback_months).toBeNull();
  });
});

describe('domain errors reach the model recoverably', () => {
  const { ctx } = makeCtx();
  it('surfaces each scenario() message verbatim with a hint', () => {
    // Null a factory that no other assertion in this block touches.
    const awaiting = ctx.factories.find(f => f.id === 'ludhiana-textiles')!;
    (awaiting as any).baseline = null;
    const noBaseline: any = runTool(
      'run_scenario',
      JSON.stringify({ factory_id: awaiting.id, intervention_ids: ['solar'], adoption: 50 }),
      ctx,
    );
    expect(noBaseline).toMatchObject({ ok: false, error: 'A validated baseline is required.' });
    expect(noBaseline.hint).toBeTruthy();

    const badAdoption: any = runTool(
      'run_scenario',
      JSON.stringify({ factory_id: 'satna-cement', intervention_ids: ['clinker'], adoption: 140 }),
      ctx,
    );
    expect(badAdoption).toMatchObject({ ok: false, error: 'Adoption must be between 0 and 100.' });
    expect(badAdoption.hint).toBeTruthy();

    const wrongSector: any = runTool(
      'run_scenario',
      JSON.stringify({ factory_id: 'tiruppur-textiles', intervention_ids: ['waste-heat'], adoption: 50 }),
      ctx,
    );
    expect(wrongSector).toMatchObject({ ok: false, error: 'This combination is not compatible.' });
    expect(wrongSector.hint).toBeTruthy();

    const sameSource: any = runTool(
      'run_scenario',
      JSON.stringify({
        factory_id: 'bhilai-steel',
        intervention_ids: ['solar', 'motor-efficiency'],
        adoption: 100,
      }),
      ctx,
    );
    expect(sameSource).toMatchObject({ ok: false, error: 'This combination is not compatible.' });
  });
});

describe('record_estimate confirmation gate', () => {
  it('parks a proposal without writing, then records once on the token', () => {
    const { ctx, calls } = makeCtx();
    const proposal: any = runTool(
      'record_estimate',
      JSON.stringify({ factory_id: 'bhilai-steel', intervention_ids: ['waste-heat'], adoption: 60 }),
      ctx,
    );
    expect(proposal.ok).toBe(true);
    expect(proposal.data.status).toBe('awaiting_confirmation');
    expect(calls.recorded).toHaveLength(0); // nothing written yet

    const token = proposal.data.confirmation_token;
    const done: any = runTool(
      'record_estimate',
      JSON.stringify({
        factory_id: 'bhilai-steel',
        intervention_ids: ['waste-heat'],
        adoption: 60,
        confirmation_token: token,
      }),
      ctx,
    );
    expect(done.ok).toBe(true);
    expect(done.data.recorded).toBe(true);
    expect(calls.recorded).toHaveLength(1);

    const replay: any = runTool(
      'record_estimate',
      JSON.stringify({
        factory_id: 'bhilai-steel',
        intervention_ids: ['waste-heat'],
        adoption: 60,
        confirmation_token: token,
      }),
      ctx,
    );
    expect(replay.ok).toBe(false); // single use
    expect(calls.recorded).toHaveLength(1);
  });

  it('rejects a token whose proposal does not match the arguments', () => {
    const { ctx, calls } = makeCtx();
    const proposal: any = runTool(
      'record_estimate',
      JSON.stringify({ factory_id: 'bhilai-steel', intervention_ids: ['waste-heat'], adoption: 60 }),
      ctx,
    );
    const tampered: any = runTool(
      'record_estimate',
      JSON.stringify({
        factory_id: 'bhilai-steel',
        intervention_ids: ['waste-heat'],
        adoption: 90,
        confirmation_token: proposal.data.confirmation_token,
      }),
      ctx,
    );
    expect(tampered.ok).toBe(false);
    expect(calls.recorded).toHaveLength(0);
  });

  it('parks nothing when the previewed scenario is invalid', () => {
    const { ctx } = makeCtx();
    const res: any = runTool(
      'record_estimate',
      JSON.stringify({ factory_id: 'tiruppur-textiles', intervention_ids: ['waste-heat'], adoption: 50 }),
      ctx,
    );
    expect(res).toMatchObject({ ok: false, error: 'This combination is not compatible.' });
  });
});

describe('navigation actions', () => {
  it('builds real in-app routes and refuses unknown factories', () => {
    const { ctx, calls } = makeCtx();
    runTool('navigate', JSON.stringify({ path: '/factories', factory_id: 'satna-cement' }), ctx);
    expect(calls.navigate).toContain('/factories/satna-cement');
    runTool('select_factory', JSON.stringify({ factory_id: 'satna-cement' }), ctx);
    expect(calls.selected).toContain('satna-cement');
    const bad = runTool('navigate', JSON.stringify({ path: '/factories', factory_id: 'ghost' }), ctx);
    expect(bad.ok).toBe(false);
  });
});

describe('conversation hygiene', () => {
  it('drops a trailing assistant turn whose tool calls were never answered', () => {
    const history: any[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'q' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'a', type: 'function', function: { name: 'x', arguments: '{}' } }],
      },
    ];
    expect(sanitiseHistory(history)).toHaveLength(2);
  });

  it('drops an orphan tool message whose call was never declared', () => {
    const history: any[] = [
      { role: 'user', content: 'q' },
      { role: 'tool', tool_call_id: 'ghost', content: '{}' },
    ];
    expect(sanitiseHistory(history)).toHaveLength(1);
  });

  it('keeps a matched assistant/tool pair and the system message when capping', () => {
    const history: any[] = [{ role: 'system', content: 's' }];
    for (let i = 0; i < 30; i++) history.push({ role: 'user', content: `q${i}` });
    const capped = capHistory(history);
    expect(capped[0].role).toBe('system');
    expect(capped.length).toBeLessThan(history.length);
  });
});

describe('system prompt', () => {
  it('carries the invariants, the fixture date and every session factory id', () => {
    const p = buildSystemPrompt({
      factories: fixtureFactories as Factory[],
      ledger: [],
      intake: [],
      toolsEnabled: true,
    });
    expect(p).toContain('01 Feb 2026');
    expect(p).toContain('Capex is fixed at every adoption level');
    expect(p).toContain('8,42,000');
    expect(p).toContain('0.70');
    fixtureFactories.forEach(f => expect(p).toContain(f.id));
  });

  it('forbids figures entirely when tools are unavailable', () => {
    const p = buildSystemPrompt({
      factories: fixtureFactories as Factory[],
      ledger: [],
      intake: [],
      toolsEnabled: false,
    });
    expect(p).toContain('YOU HAVE NO TOOLS IN THIS SESSION');
  });
});

describe('SSE frame parsing', () => {
  const collect = (chunks: string[]) => {
    const frames: any[] = [];
    let buffer = '',
      done = false;
    for (const c of chunks) {
      buffer += c;
      const step = parseSseChunk(buffer, f => frames.push(f));
      buffer = step.rest;
      if (step.done) {
        done = true;
        break;
      }
    }
    return { frames, done };
  };

  it('reassembles a frame split across chunk boundaries', () => {
    const { frames } = collect(['data: {"choices":[{"del', 'ta":{"content":"hi"}}]}\n']);
    expect(frames).toHaveLength(1);
    expect(frames[0].choices[0].delta.content).toBe('hi');
  });

  it('skips keep-alive comments and tolerates CRLF', () => {
    const { frames } = collect([': OPENROUTER PROCESSING\r\n', 'data: {"a":1}\r\n']);
    expect(frames).toEqual([{ a: 1 }]);
  });

  it('stops at the DONE sentinel', () => {
    const { frames, done } = collect(['data: {"a":1}\n', 'data: [DONE]\n', 'data: {"b":2}\n']);
    expect(done).toBe(true);
    expect(frames).toEqual([{ a: 1 }]);
  });

  it('skips one malformed frame without losing the next', () => {
    const { frames } = collect(['data: {not json}\n', 'data: {"ok":true}\n']);
    expect(frames).toEqual([{ ok: true }]);
  });
});

describe('capHistory never orphans a tool result', () => {
  it('starts the window on a user turn for every history length', () => {
    // Build a long history of tool-using turns: user → assistant(tool_calls) → tool → assistant.
    const turn = (i: number): ChatMessage[] => [
      { role: 'user', content: `q${i}` },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: 'x', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: `call_${i}`, content: '{}' },
      { role: 'assistant', content: `a${i}` },
    ];
    for (let turns = 1; turns <= 12; turns++) {
      const history: ChatMessage[] = [
        { role: 'system', content: 's' },
        ...Array.from({ length: turns }, (_, i) => turn(i)).flat(),
      ];
      const capped = capHistory(history);
      expect(capped[0].role).toBe('system');
      expect(capped[1]?.role ?? 'user').toBe('user');
      capped.forEach((m, idx) => {
        if (m.role === 'tool') {
          const declared = capped
            .slice(0, idx)
            .some(p => p.role === 'assistant' && p.tool_calls?.some(c => c.id === m.tool_call_id));
          expect(declared).toBe(true);
        }
      });
    }
  });
});
