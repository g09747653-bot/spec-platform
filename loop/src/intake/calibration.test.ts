import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CALIBRATION_CLAMP,
  CALIBRATION_MIN_RUNS,
  calibratedBudget,
  calibrationCoefficient,
  calibrationPath,
  describeCalibration,
  readCalibration,
  recordCalibration,
} from './calibration.ts';

/**
 * Журнал калибровки бюджета объёма — петля §10.4, замкнутая на уже собираемых числах.
 *
 * Оценка модели объявляется ПРЕДСКАЗАНИЕМ, четвёртая ось суда даёт ФАКТ, отношение одного к
 * другому правит бюджет. Ни одного нового замера: оба числа контур собирает и без этого.
 */

let root: string;
let projectDirectory: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'loop-calib-'));
  projectDirectory = join(root, 'proj');
  mkdirSync(projectDirectory, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const entry = (projectId: string, predictedUnits: number, workingUnits: number) => ({
  projectId,
  at: '2026-08-26T00:00:00.000Z',
  predictedUnits,
  workingUnits,
});

describe('журнал калибровки', () => {
  it('живёт СНАРУЖИ рабочей директории — рядом с книгой, и по той же причине', () => {
    recordCalibration(projectDirectory, entry('p1', 10, 5));

    const path = calibrationPath(projectDirectory);
    expect(path.startsWith(projectDirectory)).toBe(false);
    expect(dirname(dirname(path))).toBe(root);
  });

  it('одна запись на проект: перезаход уточняет свою, а не заводит вторую', () => {
    recordCalibration(projectDirectory, entry('p1', 10, 5));
    recordCalibration(projectDirectory, entry('p1', 10, 8));

    expect(readCalibration(projectDirectory).entries).toEqual([entry('p1', 10, 8)]);
  });

  it('испорченный журнал — это отсутствие коэффициента, а не отказ проекту', () => {
    mkdirSync(dirname(calibrationPath(projectDirectory)), { recursive: true });
    writeFileSync(calibrationPath(projectDirectory), 'не JSON', 'utf8');

    expect(readCalibration(projectDirectory).entries).toEqual([]);
  });
});

describe('коэффициент — чистая функция над журналом', () => {
  it(`меньше ${String(CALIBRATION_MIN_RUNS)} прогонов — коэффициента нет, и это шум, а не перекос`, () => {
    expect(calibrationCoefficient({ entries: [] })).toBeNull();
    expect(
      calibrationCoefficient({ entries: [entry('p1', 10, 5), entry('p2', 10, 5)] }),
    ).toBeNull();
  });

  it('РЕГРЕССИЯ (§10.4): систематическое занижение видно за три прогона и правит бюджет', () => {
    const journal = {
      entries: [entry('p1', 20, 10), entry('p2', 20, 10), entry('p3', 20, 10)],
    };

    expect(calibrationCoefficient(journal)).toBe(0.5);
    /* Бюджет правится на ИЗМЕРЕННОЕ отношение, а не на догадку. */
    expect(calibratedBudget(44, calibrationCoefficient(journal))).toBe(22);
  });

  it('отношение СУММ, а не среднее отношений: маленький прогон не весит как большой', () => {
    const journal = {
      entries: [entry('p1', 100, 100), entry('p2', 100, 100), entry('p3', 1, 0)],
    };

    /* Среднее отношений дало бы 0,67; отношение сумм — 200/201, и это честнее. */
    expect(calibrationCoefficient(journal)).toBeCloseTo(200 / 201, 5);
  });

  it('один аварийный прогон не утаскивает бюджет в ноль — коэффициент зажат', () => {
    const journal = {
      entries: [entry('p1', 100, 0), entry('p2', 100, 0), entry('p3', 100, 0)],
    };

    expect(calibrationCoefficient(journal)).toBe(CALIBRATION_CLAMP.min);
    expect(calibratedBudget(44, calibrationCoefficient(journal))).toBe(11);
  });

  it('без коэффициента бюджет остаётся стартовой константой', () => {
    expect(calibratedBudget(44, null)).toBe(44);
  });

  it('пункты без предсказания в счёт не идут — делить на ноль нечем', () => {
    const journal = {
      entries: [entry('p1', 0, 5), entry('p2', 0, 5), entry('p3', 0, 5)],
    };

    expect(calibrationCoefficient(journal)).toBeNull();
  });
});

describe('строка ленты — число с провенансом, а не число', () => {
  it('без коэффициента говорит, ЧЕГО не хватает, а не молчит', () => {
    const line = describeCalibration(44, { entries: [entry('p1', 10, 5)] }, null);

    expect(line).toContain('стартовая константа');
    expect(line).toContain('1 записей');
    expect(line).toContain(String(CALIBRATION_MIN_RUNS));
  });

  it('с коэффициентом называет и его, и то, на чём он измерен', () => {
    const journal = { entries: [entry('p1', 20, 10), entry('p2', 20, 10), entry('p3', 20, 10)] };
    const line = describeCalibration(44, journal, calibrationCoefficient(journal));

    expect(line).toContain('22 единиц');
    expect(line).toContain('0.50');
    expect(line).toContain('предсказано 60');
    expect(line).toContain('вышло рабочим 30');
  });
});
