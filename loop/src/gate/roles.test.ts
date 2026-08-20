import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseEnv, providerCredentials, roleConfiguration } from '../config/env.ts';
import { createFakeEngine } from '../docker/testing/fake-engine.ts';
import type { Chain } from '../llm/chain.ts';
import { createRoleChain, EXECUTOR_VENDOR, roleOrder } from '../llm/roles.ts';
import { pathsMentionedIn } from '../intake/assignments.ts';
import { hasResearch, research, researchPath, surveyWorkspace } from '../intake/researcher.ts';

import { checkCommand, CONTROLLER_CHECKS, runController } from './controller.ts';

/**
 * The two auxiliary roles and the account each one runs on (task 161; А-24 §1).
 *
 * Three claims, and they are separable on purpose: what the controller does with a project's own
 * toolchain, what the researcher reads off the disk, and which vendor either of them talks to. The
 * third is the amendment's own words — «контролировать и исследовать будет тот же самый тип, который
 * исполняет» — and it is configuration, so it is proven as configuration.
 */

const BASE = {
  CLAUDE_CODE_OAUTH_TOKEN: 'subscription-token',
  PORT: '3100',
  WORKSPACE_ROOT_PATH: 'C:/loop/workspace',
};

describe('which account a role runs on (А-24 §1)', () => {
  it('sends every role to the executor’s own vendor by default', () => {
    const env = parseEnv({ ...BASE, LOOP_PROVIDER_ORDER: 'google' });
    const config = roleConfiguration(env);

    for (const role of ['architect', 'controller', 'researcher'] as const) {
      expect(roleOrder(config, role)[0], `${role} leads with the executor’s vendor`).toBe(
        EXECUTOR_VENDOR,
      );
      expect(roleOrder(config, role)).toEqual([EXECUTOR_VENDOR, 'google']);
    }
  });

  /**
   * The case the amendment asks for by name: the executor is on the subscription, and one role is
   * moved to Google by a line of configuration.
   */
  it('moves one role to another provider by configuration, leaving the others alone', () => {
    const env = parseEnv({
      ...BASE,
      LOOP_PROVIDER_ORDER: 'anthropic',
      LOOP_ROLE_PROVIDER_RESEARCHER: 'google',
    });
    const config = roleConfiguration(env);

    expect(roleOrder(config, 'researcher'), 'taken whole, not prepended to').toEqual(['google']);
    expect(roleOrder(config, 'architect')).toEqual(['anthropic']);
    expect(roleOrder(config, 'controller')).toEqual(['anthropic']);
  });

  it('builds a chain that actually reaches the configured provider, and skips one with no key', () => {
    const env = parseEnv({
      ...BASE,
      LOOP_PROVIDER_ORDER: 'anthropic',
      LOOP_ROLE_PROVIDER_RESEARCHER: 'google',
      GOOGLE_GENERATIVE_AI_API_KEY: 'not-a-real-key',
    });
    const config = roleConfiguration(env);
    const credentials = providerCredentials(env);

    expect(createRoleChain(config, 'researcher', credentials).providers.map((p) => p.id)).toEqual([
      'google',
    ]);

    /*
     * The executor's own vendor with no metered key is **skipped**, which is the chain's ordinary
     * behaviour and the measured shape of this machine: the M15а walk's architect ran on Google
     * because `api.anthropic.com` takes a key and the loop holds a subscription token.
     */
    expect(createRoleChain(config, 'architect', credentials).providers).toEqual([]);
  });

  it('ignores a role variable naming a provider that does not exist', () => {
    const env = parseEnv({
      ...BASE,
      LOOP_PROVIDER_ORDER: 'google',
      LOOP_ROLE_PROVIDER_CONTROLLER: 'lunar-llm',
    });

    expect(roleOrder(roleConfiguration(env), 'controller')).toEqual([EXECUTOR_VENDOR, 'google']);
  });
});

describe('the controller, before a single test runs (task 161)', () => {
  const engine = () => createFakeEngine({ onStart: () => ({ exitCode: 0 }) });

  it('runs the stack’s own tools and reports them by name', async () => {
    const verdict = await runController('nodejs', '/copy', 'node:24', 'gate-1-style', {
      engine: engine(),
    });

    expect(verdict.clean).toBe(true);
    expect(verdict.ran).toEqual(['eslint', 'prettier']);
    expect(verdict.reason).toContain('чисто');
  });

  it('returns the task when a tool is red, and names which', async () => {
    const red = createFakeEngine({
      onStart: ({ name }) =>
        name.endsWith('-prettier')
          ? { exitCode: 1, stdout: ['[warn] src/index.js'] }
          : { exitCode: 0 },
    });

    const verdict = await runController('nodejs', '/copy', 'node:24', 'gate-1-style', {
      engine: red,
    });

    expect(verdict.clean).toBe(false);
    expect(verdict.findings.map((finding) => finding.label)).toEqual(['prettier']);
    expect(verdict.reason).toContain('до тестов');
    expect(verdict.findings[0]?.output).toContain('src/index.js');
  });

  /**
   * A tool the project does not have is not a finding about the project.
   *
   * The first version of this file read `npx`'s «could not determine executable to run» as a style
   * violation, which returned every project without ESLint to its executor for ever. The probe is
   * what tells the two apart, and `127` is how it says so.
   */
  it('skips a tool the project has not installed rather than blaming it', async () => {
    const bare = createFakeEngine({ onStart: () => ({ exitCode: 127 }) });

    const verdict = await runController('nodejs', '/copy', 'node:24', 'gate-1-style', {
      engine: bare,
    });

    expect(verdict.clean).toBe(true);
    expect(verdict.ran).toEqual([]);
    expect(verdict.skipped).toEqual(['eslint', 'prettier']);
    expect(verdict.reason).toContain('проверять нечем');
  });

  it('claims nothing about a stack whose toolchain it does not know', async () => {
    const verdict = await runController('generic', '/copy', 'debian', 'gate-1-style', {
      engine: engine(),
    });

    expect(verdict.clean).toBe(true);
    expect(verdict.ran).toEqual([]);
  });

  it('puts the probe in front of every check, in one shell', () => {
    for (const checks of Object.values(CONTROLLER_CHECKS)) {
      for (const check of checks) {
        const line = checkCommand(check);
        expect(line).toContain('|| exit 127');
        expect(line.indexOf(check.probe)).toBeLessThan(line.lastIndexOf(check.command));
      }
    }
  });
});

describe('the researcher, reading the disk (task 161)', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'loop-research-'));
    mkdirSync(join(directory, 'handoff'), { recursive: true });
    mkdirSync(join(directory, 'lib'), { recursive: true });
    mkdirSync(join(directory, 'node_modules', 'left-pad'), { recursive: true });

    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        name: 'квест',
        scripts: { test: 'node --test', lint: 'eslint .' },
        dependencies: { chalk: '^5' },
        devDependencies: { eslint: '^9' },
      }),
      'utf8',
    );
    writeFileSync(join(directory, 'lib', 'state.js'), 'export const state = {};', 'utf8');
    writeFileSync(join(directory, 'node_modules', 'left-pad', 'index.js'), '//', 'utf8');
  });

  afterEach(() => {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Cleanup is not an assertion.
    }
  });

  it('reads the tree and the manifest, and steps over the noise', () => {
    const survey = surveyWorkspace(directory);

    expect(survey.tree).toContain('lib/');
    expect(survey.tree).toContain('lib/state.js');
    expect(survey.tree.some((entry) => entry.includes('node_modules'))).toBe(false);
    expect(survey.tree.some((entry) => entry.startsWith('handoff'))).toBe(false);

    const manifest = survey.manifests[0];
    expect(manifest?.file).toBe('package.json');
    expect(manifest?.name).toBe('квест');
    expect(manifest?.scripts).toEqual(['test', 'lint']);
    expect(manifest?.dependencies).toEqual(['chalk', 'eslint']);
  });

  it('writes the report where every executor container can read it', async () => {
    expect(hasResearch(directory)).toBe(false);

    const result = await research(directory, null);

    expect(hasResearch(directory)).toBe(true);
    expect(researchPath(directory).endsWith(join('handoff', 'RESEARCH.md'))).toBe(true);
    expect(result.report).toContain('lib/state.js');
    expect(result.writtenBy, 'no chain means no brief, and the survey is the report').toBeNull();
  });

  it('adds the model’s brief when a chain answers, and survives one that does not', async () => {
    const answering: Chain = {
      providers: [{ id: 'google', model: 'gemini', generate: () => Promise.resolve('') }],
      generate: () =>
        Promise.resolve({
          text: 'Node-проект: игра в lib/, тесты node --test.',
          provider: 'google',
        }),
    };

    const written = await research(directory, answering);
    expect(written.writtenBy).toBe('google');
    expect(written.report).toContain('Node-проект');

    const failing: Chain = {
      providers: [{ id: 'google', model: 'gemini', generate: () => Promise.resolve('') }],
      generate: () => Promise.reject(new Error('провайдер ответил 429')),
    };

    const degraded = await research(directory, failing);
    expect(degraded.writtenBy).toBeNull();
    expect(degraded.report, 'the survey is still there').toContain('lib/state.js');
  });

  it('is what the assignment prompt carries — the paths miner sees it as prose, not as paths', () => {
    /*
     * A guard on the seam rather than on the prose: the report is *context*, and `filesToEdit` is
     * still mined from the task's own description. The two must not blur into each other.
     */
    expect(pathsMentionedIn('нет путей в этом предложении')).toEqual([]);
  });
});
